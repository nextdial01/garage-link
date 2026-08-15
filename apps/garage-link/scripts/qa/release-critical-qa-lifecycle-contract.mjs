#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_QA_MATRIX_MISSING:${name}`);return value}
function redact(value){return String(value??'').replace(/https?:\/\/[^\s)]+/g,'[REDACTED_URL]').slice(0,180)}

function matrixReady(value){
  return value?.ready===true
    &&value?.cta_matrix==='registry_bound'
    &&value?.private_schema===true
    &&value?.last_owner_guard_enabled===true
    &&value?.public_execute_count===0
    &&value?.service_execute_count===16
    &&value?.expired_release_recovery==='service_role_only'
    &&value?.primary_unmarked_actual_email_adoption==='service_role_only';
}

function safeReadback(value){
  return {
    ready:value?.ready===true,
    cta_matrix:value?.cta_matrix==='registry_bound'?'registry_bound':'unavailable',
    private_schema:value?.private_schema===true,
    last_owner_guard_enabled:value?.last_owner_guard_enabled===true,
    public_execute_count:Number.isInteger(value?.public_execute_count)?value.public_execute_count:null,
    service_execute_count:Number.isInteger(value?.service_execute_count)?value.service_execute_count:null,
    expired_release_recovery:value?.expired_release_recovery==='service_role_only'?'service_role_only':'unavailable',
    primary_unmarked_actual_email_adoption:value?.primary_unmarked_actual_email_adoption==='service_role_only'?'service_role_only':'unavailable',
  };
}

async function readLifecycleReadiness({supabaseUrl,serviceRole,createClientImpl=createClient}){
  const client=createClientImpl(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await client.rpc('qa_lifecycle_cleanup_readiness');
  if(error)return {ready:false,errorCode:String(error.code??error.status??'UNKNOWN'),value:null};
  return {ready:matrixReady(data),errorCode:null,value:data};
}

// The CTA matrix is deliberately bootstrapped once through the approved external
// Staging admin channel. Normal Release Critical runs only prove the already
// installed service-role contract; they never carry a Management PAT or DDL path.
export async function ensureReleaseCriticalCtaMatrix({supabaseUrl,serviceRole,createClientImpl=createClient}){
  const readiness=await readLifecycleReadiness({supabaseUrl,serviceRole,createClientImpl});
  if(!readiness.ready)fail(`CTA_MATRIX_BOOTSTRAP_REQUIRED:${readiness.errorCode??'READBACK'}`);
  return {
    state:'RELEASE_CRITICAL_QA_MATRIX_READY',
    bootstrap:'EXTERNAL_ADMIN_ONETIME',
    management_pat_required:false,
    readiness:safeReadback(readiness.value),
  };
}

async function main(){
  const supabaseUrl=required('E2E_TEST_SUPABASE_URL');
  if(!new URL(supabaseUrl).hostname.startsWith(`${STAGING_REF}.`)||supabaseUrl.includes(PRODUCTION_REF))fail('RELEASE_CRITICAL_QA_MATRIX_PRODUCTION_DENIED');
  const result=await ensureReleaseCriticalCtaMatrix({supabaseUrl,serviceRole:required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY')});
  process.stdout.write(`${JSON.stringify({...result,project_ref:STAGING_REF,production_write:false,stripe_mutation:false,line_send:false})}\n`);
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(`${JSON.stringify({state:'RELEASE_CRITICAL_QA_MATRIX_FAILED',code:redact(error)})}\n`);process.exitCode=1;});
