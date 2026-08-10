#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';
const STAGING_PROJECT_ID='prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PRODUCTION_PROJECT_ID='prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const STAGING_PROJECT_NAME='garage-link-staging';
const PRODUCTION_HOSTS=new Set(['garage-link.tech','www.garage-link.tech']);

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_PREFLIGHT_MISSING:${name}`);return value}
function redact(error){return String(error?.message??error).replace(/[A-Za-z0-9_-]{32,}/g,'[REDACTED]').replace(/https?:\/\/[^\s)]+/g,'[REDACTED_URL]')}
async function json(response,code){if(!response.ok)fail(`${code}:${response.status}`);return response.json()}
async function authConfig(ref,token){return json(await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`,{headers:{authorization:`Bearer ${token}`}}),`SUPABASE_MANAGEMENT_AUTH_CONFIG_READ_FAILED:${ref}`)}

async function main(){
  const sourceSha=required('EXPECTED_RELEASE_SHA');
  const branch=required('EXPECTED_RELEASE_BRANCH');
  const baseUrl=new URL(required('PLAYWRIGHT_BASE_URL'));
  const supabaseUrl=new URL(required('E2E_TEST_SUPABASE_URL'));
  const serviceRole=required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY');
  const managementToken=required('GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN');
  const vercelToken=required('VERCEL_ACCESS_TOKEN');
  const bypassSecret=required('VERCEL_AUTOMATION_BYPASS_SECRET');
  const qaMailbox=required('GARAGE_STAGING_QA_MAILBOX');
  const teamId=required('EXPECTED_VERCEL_TEAM_ID');
  const projectId=required('EXPECTED_VERCEL_PROJECT_ID');
  const projectName=required('EXPECTED_VERCEL_PROJECT_NAME');
  if(!/^[0-9a-f]{40}$/i.test(sourceSha)||!branch||branch==='production')fail('RELEASE_CRITICAL_PROVENANCE_INVALID');
  if(supabaseUrl.hostname!==`${STAGING_REF}.supabase.co`||supabaseUrl.hostname.includes(PRODUCTION_REF))fail('SUPABASE_STAGING_REF_MISMATCH');
  if(PRODUCTION_HOSTS.has(baseUrl.hostname)||baseUrl.hostname.endsWith('.garage-link.tech'))fail('VERCEL_PRODUCTION_HOST_DENIED');
  if(projectId!==STAGING_PROJECT_ID||projectName!==STAGING_PROJECT_NAME||projectId===PRODUCTION_PROJECT_ID||!qaMailbox.includes('@'))fail('RELEASE_CRITICAL_CONTRACT_INVALID');

  const admin=createClient(supabaseUrl.toString(),serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:users,error:usersError}=await admin.auth.admin.listUsers({page:1,perPage:1});
  if(usersError||!users)fail(`SUPABASE_SERVICE_ROLE_ADMIN_API_FAILED:${usersError?.status??0}`);
  const stagingAuth=await authConfig(STAGING_REF,managementToken);
  const productionAuth=await authConfig(PRODUCTION_REF,managementToken);
  const passwordMinimum=stagingAuth.password_min_length??stagingAuth.minimum_password_length;
  if(!Number.isInteger(passwordMinimum)||passwordMinimum<6||!productionAuth||typeof productionAuth!=='object')fail('SUPABASE_AUTH_CONFIG_INVALID');
  // Idempotent Staging-only write proves the Management API update contract without
  // changing the observed policy. Production is never passed to PATCH.
  const update=await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/config/auth`,{method:'PATCH',headers:{authorization:`Bearer ${managementToken}`,'content-type':'application/json'},body:JSON.stringify({password_min_length:passwordMinimum})});
  if(!update.ok)fail(`SUPABASE_STAGING_AUTH_UPDATE_PROBE_FAILED:${update.status}`);

  const query=`teamId=${encodeURIComponent(teamId)}`;
  const headers={authorization:`Bearer ${vercelToken}`};
  const project=await json(await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}?${query}`,{headers}),'VERCEL_PROJECT_READ_FAILED');
  if(project.id!==projectId||project.name!==projectName||project.accountId!==teamId)fail('VERCEL_PROJECT_IDENTITY_MISMATCH');
  const deployment=await json(await fetch(`https://api.vercel.com/v13/deployments/get?url=${encodeURIComponent(baseUrl.hostname)}&${query}`,{headers}),'VERCEL_DEPLOYMENT_READ_FAILED');
  if(deployment.projectId!==projectId||deployment.url!==baseUrl.hostname||deployment.readyState!=='READY')fail('VERCEL_DEPLOYMENT_NOT_READY_OR_MISMATCH');
  if(deployment.meta?.githubCommitSha!==sourceSha||deployment.meta?.githubCommitRef!==branch)fail('VERCEL_DEPLOYMENT_PROVENANCE_MISMATCH');
  const bypass=await fetch(baseUrl,{method:'HEAD',headers:{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie':'true'},redirect:'manual'});
  if(bypass.status>=400)fail(`VERCEL_AUTOMATION_BYPASS_FAILED:${bypass.status}`);
  process.stdout.write(`${JSON.stringify({ok:true,state:'PREFLIGHT_READY',environment:'garage-link-staging',source_sha:sourceSha,branch,deployment_id:deployment.uid??deployment.id??'unknown',auth:{service_role_admin_api:'PASS',staging_management_read:'PASS',staging_management_update_probe:'PASS',production_management_read_only:'PASS',password_minimum:passwordMinimum,qa_mailbox_contract:'PASS'},vercel:{project:projectName,ready:'PASS',protection_bypass:'PASS'}})}\n`);
}

main().catch(error=>{process.stderr.write(`${JSON.stringify({ok:false,code:redact(error)})}\n`);process.exitCode=1});
