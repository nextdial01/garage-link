#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';
const STAGING_PROJECT_ID='prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PRODUCTION_PROJECT_ID='prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const STAGING_PROJECT_NAME='garage-link-staging';
const PRODUCTION_HOSTS=new Set(['garage-link.tech','www.garage-link.tech']);
const MAILSLURP_API_BASE='https://api.mailslurp.com';
const MAILSLURP_WAIT_TIMEOUT_MS=180_000;
const MANUAL_GMAIL_POLL_TIMEOUT_MS=10*60_000;
const MANUAL_GMAIL_POLL_INTERVAL_MS=5_000;

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_PREFLIGHT_MISSING:${name}`);return value}
function redact(error){return String(error?.message??error).replace(/[A-Za-z0-9_-]{32,}/g,'[REDACTED]').replace(/https?:\/\/[^\s)]+/g,'[REDACTED_URL]')}
async function json(response,code){if(!response.ok)fail(`${code}:${response.status}`);return response.json()}
async function authConfig(ref,token){return json(await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`,{headers:{authorization:`Bearer ${token}`}}),`SUPABASE_MANAGEMENT_AUTH_CONFIG_READ_FAILED:${ref}`)}

function mailSlurpHeaders(apiKey,hasBody=false){return {'x-api-key':apiKey,accept:'application/json',...(hasBody?{'content-type':'application/json'}:{})}}
async function mailSlurpJson(path,apiKey,options,code,fetchImpl=fetch){
  const response=await fetchImpl(`${MAILSLURP_API_BASE}${path}`,{...options,headers:{...mailSlurpHeaders(apiKey,Boolean(options.body)),...options.headers},cache:'no-store'});
  return json(response,code);
}
function requiredRunMarker(marker){if(typeof marker!=='string'||!/^garage-link-[a-z0-9-]{8,}$/i.test(marker))fail('MAILSLURP_RUN_MARKER_INVALID');return marker}
function normalizeEmail(value){return String(value??'').trim().toLowerCase()}
function manualGmailBaseAddress(value){
  const email=normalizeEmail(value);
  const match=/^([^@+\s]+)(?:\+[^@\s]*)?@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.exec(email);
  if(!match)fail('MANUAL_GMAIL_PLUS_ADDRESS_UNAVAILABLE');
  return {localPart:match[1],domain:match[2]};
}
function manualGmailAddress(baseAddress,runMarker){
  const marker=requiredRunMarker(runMarker);
  const base=manualGmailBaseAddress(baseAddress);
  return `${base.localPart}+${marker}@${base.domain}`;
}

export function createManualGmailSession(baseAddress,runMarker=`garage-link-${crypto.randomUUID()}`){
  const marker=requiredRunMarker(runMarker);
  return {emailMode:'manual_gmail',runMarker:marker,emailAddress:manualGmailAddress(baseAddress,marker)};
}

export function manualGmailCheckpoint(session,purpose){
  if(session?.emailMode!=='manual_gmail'||!['signup','recovery'].includes(purpose))fail('MANUAL_GMAIL_CHECKPOINT_INVALID');
  const signup=purpose==='signup';
  return {state:signup?'MANUAL_GMAIL_CHECKPOINT_SIGNUP':'MANUAL_GMAIL_CHECKPOINT_RESET',email_mode:'manual_gmail',run_marker:session.runMarker,recipient:'REDACTED_MANUAL_GMAIL_ADDRESS',operator_action:signup?'Open the matching Staging-only Gmail message and click its Supabase confirmation link.':'Open the matching Staging-only Gmail reset message, click its Supabase link, set the run-specific synthetic password, and submit.'};
}

export async function pollManualGmailConfirmation({admin,userId,session,purpose,requestedAt,timeoutMs=MANUAL_GMAIL_POLL_TIMEOUT_MS,intervalMs=MANUAL_GMAIL_POLL_INTERVAL_MS,sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))}){
  if(session?.emailMode!=='manual_gmail'||typeof userId!=='string'||!userId||!['signup','recovery'].includes(purpose))fail('MANUAL_GMAIL_POLL_CONTRACT_INVALID');
  const resetRequestedAt=purpose==='recovery'?Date.parse(requestedAt):NaN;
  if(purpose==='recovery'&&Number.isNaN(resetRequestedAt))fail('MANUAL_GMAIL_RESET_REQUEST_TIME_INVALID');
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const {data,error}=await admin.auth.admin.getUserById(userId);
    const user=data?.user;
    if(error)fail(`MANUAL_GMAIL_AUTH_STATE_READ_FAILED:${error.status??0}`);
    const signupConfirmed=purpose==='signup'&&Boolean(user?.email_confirmed_at??user?.confirmed_at);
    const resetCompleted=purpose==='recovery'&&Date.parse(user?.updated_at??'')>=resetRequestedAt;
    if(user?.email===session.emailAddress&&(signupConfirmed||resetCompleted))return {state:'MANUAL_GMAIL_CONFIRMED',email_mode:'manual_gmail',run_marker:session.runMarker,purpose};
    await sleep(intervalMs);
  }
  fail(`MANUAL_GMAIL_CHECKPOINT_TIMEOUT:${purpose}`);
}
function assertInbox(inbox,marker){
  if(!inbox||typeof inbox.inboxId!=='string'||!inbox.inboxId||!normalizeEmail(inbox.emailAddress).includes('@')||inbox.runMarker!==requiredRunMarker(marker))fail('MAILSLURP_INBOX_CONTRACT_INVALID');
}

export async function verifyMailSlurpApiKey(apiKey,fetchImpl=fetch){
  const account=await mailSlurpJson('/userInfo',apiKey,{method:'GET'},'MAILSLURP_API_KEY_INVALID_OR_UNAVAILABLE',fetchImpl);
  if(!account||typeof account!=='object')fail('MAILSLURP_API_KEY_INVALID_OR_UNAVAILABLE');
  return 'PASS';
}

export async function createMailSlurpRunInbox(apiKey,runMarker,fetchImpl=fetch){
  const marker=requiredRunMarker(runMarker);
  const inbox=await mailSlurpJson('/inboxes/withDefaults',apiKey,{method:'POST',body:JSON.stringify({name:marker,description:'GARAGE LINK Staging synthetic QA only'})},'MAILSLURP_INBOX_CREATE_FAILED',fetchImpl);
  if(typeof inbox?.id!=='string'||!inbox.id||!normalizeEmail(inbox.emailAddress).includes('@'))fail('MAILSLURP_INBOX_CREATE_CONTRACT_INVALID');
  if(inbox.name!==marker)fail('MAILSLURP_INBOX_MARKER_MISMATCH');
  return {inboxId:inbox.id,emailAddress:inbox.emailAddress,runMarker:marker};
}

function emailRecipientMatches(email,expectedRecipient){return Array.isArray(email?.to)&&email.to.map(normalizeEmail).includes(normalizeEmail(expectedRecipient))}
function actionLinks(email,expectedType,baseUrl){
  const body=[email?.body,email?.bodyExcerpt].filter(value=>typeof value==='string').join('\n').replaceAll('&amp;','&');
  const links=[...body.matchAll(/https:\/\/[^\s"'<>]+/g)].map(match=>match[0].replace(/[),.;]+$/,'')).map(value=>new URL(value)).filter(link=>link.hostname===`${STAGING_REF}.supabase.co`&&link.pathname==='/auth/v1/verify'&&link.searchParams.get('type')===expectedType&&new URL(link.searchParams.get('redirect_to')??'https://invalid.invalid').origin===baseUrl.origin);
  const unique=[...new Map(links.map(link=>[link.toString(),link])).values()];
  if(unique.length!==1)fail('MAILSLURP_ACTION_LINK_AMBIGUOUS_OR_MISSING');
  return unique[0].toString();
}

export async function waitForMailSlurpAction({apiKey,inbox,runMarker,expectedType,baseUrl,fetchImpl=fetch}){
  assertInbox(inbox,runMarker);
  if(!['signup','recovery'].includes(expectedType))fail('MAILSLURP_ACTION_TYPE_INVALID');
  const emails=await mailSlurpJson('/waitFor',apiKey,{method:'POST',body:JSON.stringify({inboxId:inbox.inboxId,count:1,countType:'EXACTLY',timeout:MAILSLURP_WAIT_TIMEOUT_MS,unreadOnly:true,sortDirection:'DESC',matches:[{field:'TO',should:'CONTAIN',value:inbox.emailAddress}]})},'MAILSLURP_EMAIL_NOT_RECEIVED',fetchImpl);
  if(!Array.isArray(emails)||emails.length!==1||!emailRecipientMatches(emails[0],inbox.emailAddress))fail('MAILSLURP_EMAIL_RECIPIENT_OR_MARKER_MISMATCH');
  return actionLinks(emails[0],expectedType,baseUrl);
}

export async function deleteMailSlurpRunInbox(apiKey,inbox,runMarker,fetchImpl=fetch){
  assertInbox(inbox,runMarker);
  const response=await fetchImpl(`${MAILSLURP_API_BASE}/inboxes/${encodeURIComponent(inbox.inboxId)}`,{method:'DELETE',headers:mailSlurpHeaders(apiKey),cache:'no-store'});
  if(!response.ok)fail(`MAILSLURP_INBOX_DELETE_FAILED:${response.status}`);
}

export async function withMailSlurpRunInbox({apiKey,runMarker,run,fetchImpl=fetch}){
  let inbox;
  try {inbox=await createMailSlurpRunInbox(apiKey,runMarker,fetchImpl);return await run(inbox)}
  finally {if(inbox)await deleteMailSlurpRunInbox(apiKey,inbox,runMarker,fetchImpl)}
}

async function main(){
  const baseUrl=new URL(required('PLAYWRIGHT_BASE_URL'));
  const supabaseUrl=new URL(required('E2E_TEST_SUPABASE_URL'));
  const serviceRole=required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY');
  const managementToken=required('GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN');
  const emailMode=required('RELEASE_CRITICAL_EMAIL_MODE');
  const manualGmail=required('MANUAL_GMAIL_ADDRESS');
  const vercelToken=required('VERCEL_ACCESS_TOKEN');
  const bypassSecret=required('VERCEL_AUTOMATION_BYPASS_SECRET');
  const teamId=required('EXPECTED_VERCEL_TEAM_ID');
  const projectId=required('EXPECTED_VERCEL_PROJECT_ID');
  const projectName=required('EXPECTED_VERCEL_PROJECT_NAME');
  if(supabaseUrl.hostname!==`${STAGING_REF}.supabase.co`||supabaseUrl.hostname.includes(PRODUCTION_REF))fail('SUPABASE_STAGING_REF_MISMATCH');
  if(PRODUCTION_HOSTS.has(baseUrl.hostname)||baseUrl.hostname.endsWith('.garage-link.tech'))fail('VERCEL_PRODUCTION_HOST_DENIED');
  if(projectId!==STAGING_PROJECT_ID||projectName!==STAGING_PROJECT_NAME||projectId===PRODUCTION_PROJECT_ID)fail('RELEASE_CRITICAL_CONTRACT_INVALID');
  if(emailMode!=='manual_gmail')fail('RELEASE_CRITICAL_EMAIL_MODE_INVALID');
  manualGmailBaseAddress(manualGmail);

  const admin=createClient(supabaseUrl.toString(),serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:users,error:usersError}=await admin.auth.admin.listUsers({page:1,perPage:1});
  if(usersError||!users)fail(`SUPABASE_SERVICE_ROLE_ADMIN_API_FAILED:${usersError?.status??0}`);
  const stagingAuth=await authConfig(STAGING_REF,managementToken);
  const productionAuth=await authConfig(PRODUCTION_REF,managementToken);
  const passwordMinimum=stagingAuth.password_min_length??stagingAuth.minimum_password_length;
  if(!Number.isInteger(passwordMinimum)||passwordMinimum<6||!productionAuth||typeof productionAuth!=='object')fail('SUPABASE_AUTH_CONFIG_INVALID');

  const query=`teamId=${encodeURIComponent(teamId)}`;
  const headers={authorization:`Bearer ${vercelToken}`};
  const deployment=await json(await fetch(`https://api.vercel.com/v13/deployments/get?url=${encodeURIComponent(baseUrl.hostname)}&${query}`,{headers}),'VERCEL_DEPLOYMENT_READ_FAILED');
  if(deployment.projectId!==projectId||deployment.url!==baseUrl.hostname||deployment.readyState!=='READY')fail('VERCEL_DEPLOYMENT_NOT_READY_OR_MISMATCH');
  const sourceSha=deployment.meta?.githubCommitSha;
  const branch=deployment.meta?.githubCommitRef;
  if(!/^[0-9a-f]{40}$/i.test(sourceSha)||typeof branch!=='string'||!branch||branch==='production')fail('VERCEL_DEPLOYMENT_PROVENANCE_INVALID');
  const healthUrl=new URL('/api/health',baseUrl);
  const bypass=await fetch(healthUrl,{headers:{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie':'true',accept:'application/json'},redirect:'manual',cache:'no-store'});
  if(bypass.status<200||bypass.status>=300||bypass.headers.has('location')||new URL(bypass.url).origin!==baseUrl.origin)fail(`VERCEL_AUTOMATION_BYPASS_FAILED:${bypass.status}`);
  const health=await bypass.json().catch(()=>null);
  if(health?.ok!==true||health.service!=='garage-link')fail('VERCEL_AUTOMATION_BYPASS_APPLICATION_UNREACHED');
  process.stdout.write(`${JSON.stringify({ok:true,state:'PREFLIGHT_READY',environment:'garage-link-staging',source_sha:sourceSha,branch,deployment_id:deployment.uid??deployment.id??'unknown',auth:{service_role_admin_api:'PASS',staging_management_read:'PASS',production_management_read_only:'PASS',password_minimum:passwordMinimum},email:{mode:'manual_gmail',base_address:'REDACTED'},vercel:{project:projectName,ready:'PASS',protection_bypass:'VERCEL_AUTOMATION_BYPASS_PASS'}})}\n`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write(`${JSON.stringify({ok:false,code:redact(error)})}\n`);process.exitCode=1});
