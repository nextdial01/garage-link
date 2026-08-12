#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';
const MATRIX_VERSION='20260812000100';
const MANAGEMENT_ORIGIN='https://api.supabase.com';

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_QA_MATRIX_MISSING:${name}`);return value}
function redact(value){return String(value??'').replace(/\b(?:sbp|sb_secret|eyJ)[A-Za-z0-9._-]+\b/g,'[REDACTED]').replace(/https?:\/\/[^\s)]+/g,'[REDACTED_URL]').slice(0,180)}
function managementEndpoint(path){return new URL(`/v1/projects/${STAGING_REF}${path}`,MANAGEMENT_ORIGIN)}
function managementHeaders(token){return {authorization:`Bearer ${token}`,'content-type':'application/json'}}
function sqlLiteral(value){return `'${String(value).replaceAll("'","''")}'`}
function matrixReady(value){return value?.ready===true&&value?.service_execute_count===14&&value?.cta_matrix==='registry_bound'}
function exactlyOneTransaction(sql){
  const first=sql.search(/^\s*begin\s*;/im); const last=sql.search(/commit\s*;\s*$/im);
  if(first<0||last<0||last<=first||sql.slice(first+1,last).match(/^\s*begin\s*;/im))fail('RELEASE_CRITICAL_QA_MATRIX_TRANSACTION_SHAPE_INVALID');
  return `${sql.slice(0,first)}${sql.slice(first).replace(/^\s*begin\s*;/im,'').slice(0,sql.slice(first).replace(/^\s*begin\s*;/im,'').search(/commit\s*;\s*$/im))}`;
}

async function readLifecycleReadiness({supabaseUrl,serviceRole,createClientImpl=createClient}){
  const client=createClientImpl(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await client.rpc('qa_lifecycle_cleanup_readiness');
  if(error)return {ready:false,missing:error.code==='PGRST202'||error.status===404,errorCode:String(error.code??error.status??'UNKNOWN')};
  return {ready:matrixReady(data),missing:false,value:data};
}
async function managementQuery(token,path,query,fetchImpl=fetch){
  const response=await fetchImpl(managementEndpoint(path),{method:'POST',headers:managementHeaders(token),body:JSON.stringify({query}),redirect:'manual',cache:'no-store'});
  if(!response.ok||response.status>=300)fail(`RELEASE_CRITICAL_QA_MATRIX_MANAGEMENT_${path.includes('read-only')?'READ':'WRITE'}:${response.status}`);
  return response.json().catch(()=>[]);
}
async function managementProfile(token,fetchImpl=fetch){
  const response=await fetchImpl(new URL('/v1/profile',MANAGEMENT_ORIGIN),{headers:managementHeaders(token),redirect:'manual',cache:'no-store'});
  if(!response.ok||response.status>=300)fail(`RELEASE_CRITICAL_QA_MATRIX_MANAGEMENT_PROFILE:${response.status}`);
}
function ledgerRows(value){return Array.isArray(value)?value:value?.result??[]}
function ledgerQuery(){return `select m.version,m.name,i.checksum,i.state from supabase_migrations.schema_migrations m join supabase_migrations.migration_integrity i using(version) where m.version=${sqlLiteral(MATRIX_VERSION)}`}
function ledgerMatches(rows,entry){
  const row=ledgerRows(rows)[0];
  return row?.version===entry.version&&row?.name===entry.name&&row?.checksum===entry.checksum&&row?.state==='applied';
}
function ledgerFinalize(entry){return `
insert into supabase_migrations.schema_migrations(version,statements,name)
values (${sqlLiteral(entry.version)},array[${sqlLiteral(entry.file)}]::text[],${sqlLiteral(entry.name)})
on conflict (version) do update set statements=excluded.statements,name=excluded.name;
insert into supabase_migrations.migration_integrity(version,checksum,kind,environment,state,applied_at,updated_at)
values (${sqlLiteral(entry.version)},${sqlLiteral(entry.checksum)},${sqlLiteral(entry.kind)},'staging-qa-only','applied',clock_timestamp(),clock_timestamp())
on conflict (version) do update set checksum=excluded.checksum,kind=excluded.kind,environment='staging-qa-only',state='applied',updated_at=clock_timestamp();`}
function transactionalApply(sql,entry){
  const body=exactlyOneTransaction(sql);
  return `begin; set local lock_timeout='3s'; set local statement_timeout='120s'; ${body}\n${ledgerFinalize(entry)}\ncommit;`;
}

export async function ensureReleaseCriticalCtaMatrix({supabaseUrl,serviceRole,managementToken,manifest,readFileImpl=readFile,fetchImpl=fetch,createClientImpl=createClient}){
  const initial=await readLifecycleReadiness({supabaseUrl,serviceRole,createClientImpl});
  if(initial.ready)return {state:'RELEASE_CRITICAL_QA_MATRIX_READY',applied:false,management_pat_required:false};
  if(!managementToken)fail('RELEASE_CRITICAL_QA_MATRIX_BOOTSTRAP_REQUIRED');
  // Bootstrap is the only normal path that touches the Management API. Prove
  // the PAT independently before classifying a database-query failure as an
  // API permission issue.
  await managementProfile(managementToken,fetchImpl);
  const entry=manifest?.entries?.find(candidate=>candidate.version===MATRIX_VERSION);
  if(!entry||entry.kind!=='contract'||entry.file!=='migrations/20260812000100_qa_lifecycle_cta_account_state_matrix.sql'||!/^[0-9a-f]{64}$/.test(entry.checksum??''))fail('RELEASE_CRITICAL_QA_MATRIX_MANIFEST_INVALID');
  const before=await managementQuery(managementToken,'/database/query/read-only',ledgerQuery(),fetchImpl);
  if(!ledgerMatches(before,entry)){
    const migration=await readFileImpl(new URL(`../../supabase/qa/${entry.file}`,import.meta.url),'utf8');
    await managementQuery(managementToken,'/database/query',transactionalApply(migration,entry),fetchImpl);
  }
  const after=await managementQuery(managementToken,'/database/query/read-only',ledgerQuery(),fetchImpl);
  if(!ledgerMatches(after,entry))fail('RELEASE_CRITICAL_QA_MATRIX_LEDGER_READBACK_FAILED');
  const readiness=await readLifecycleReadiness({supabaseUrl,serviceRole,createClientImpl});
  if(!readiness.ready)fail('RELEASE_CRITICAL_QA_MATRIX_READINESS_READBACK_FAILED');
  return {state:'RELEASE_CRITICAL_QA_MATRIX_READY',applied:true,management_pat_required:true};
}

async function main(){
  const supabaseUrl=required('E2E_TEST_SUPABASE_URL');
  if(!new URL(supabaseUrl).hostname.startsWith(`${STAGING_REF}.`)||supabaseUrl.includes(PRODUCTION_REF))fail('RELEASE_CRITICAL_QA_MATRIX_PRODUCTION_DENIED');
  const manifest=JSON.parse(await readFile(new URL('../../supabase/qa/manifest.json',import.meta.url),'utf8'));
  const result=await ensureReleaseCriticalCtaMatrix({supabaseUrl,serviceRole:required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY'),managementToken:process.env.GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN?.trim(),manifest});
  process.stdout.write(`${JSON.stringify({...result,project_ref:STAGING_REF,production_write:false,stripe_mutation:false,line_send:false})}\n`);
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(`${JSON.stringify({state:'RELEASE_CRITICAL_QA_MATRIX_FAILED',code:redact(error)})}\n`);process.exitCode=1;});
