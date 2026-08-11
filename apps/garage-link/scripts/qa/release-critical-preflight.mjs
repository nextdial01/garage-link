#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';
const STAGING_PROJECT_ID='prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const STAGING_PROJECT_NAME='garage-link-staging';
const PRODUCTION_HOSTS=new Set(['garage-link.tech','www.garage-link.tech']);
const MAILSLURP_API_BASE='https://api.mailslurp.com';
const MAILSLURP_WAIT_TIMEOUT_MS=180_000;
const MANUAL_GMAIL_POLL_TIMEOUT_MS=10*60_000;
const MANUAL_GMAIL_POLL_INTERVAL_MS=5_000;

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_PREFLIGHT_MISSING:${name}`);return value}
function redact(error){return String(error?.message??error).replace(/\b(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9_-]+\b/g,'[REDACTED]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED]').replace(/https?:\/\/[^\s)]+/g,'[REDACTED_URL]')}
async function json(response,code){if(!response.ok)fail(`${code}:${response.status}`);return response.json()}

const MANAGEMENT_API_ORIGIN='https://api.supabase.com';

function managementHeaders(token){return {authorization:`Bearer ${token}`}}
function managementUrl(pathname){return new URL(pathname,MANAGEMENT_API_ORIGIN)}
function safeUrlParts(value,baseUrl){
  if(!value)return null;
  try {
    const url=new URL(value,baseUrl);
    return {origin:url.origin,pathname:url.pathname,search:url.search,hash:url.hash};
  } catch {return null}
}
function diagnosticResponse(response,location,baseUrl=response.url){
  const current=safeUrlParts(response.url||baseUrl);
  const target=safeUrlParts(location,response.url||baseUrl);
  return {
    status:response.status,
    redirected:response.redirected,
    url:current?{origin:current.origin,pathname:current.pathname}:null,
    location:target?{origin:target.origin,pathname:target.pathname}:null,
    same_origin:Boolean(current&&target&&current.origin===target.origin),
    same_path:Boolean(current&&target&&current.pathname===target.pathname),
  };
}
function canonicalAuthConfigRedirect(target,endpoint){
  return Boolean(target
    && target.origin===MANAGEMENT_API_ORIGIN
    && !target.search
    && !target.hash
    && target.pathname.replace(/\/+$/,'')===endpoint.pathname.replace(/\/+$/,''));
}

function bypassCookie(response){
  const values=typeof response.headers.getSetCookie==='function'
    ?response.headers.getSetCookie()
    :[response.headers.get('set-cookie')].filter(Boolean);
  const cookies=values.map(value=>String(value).split(';',1)[0]).filter(value=>value.includes('='));
  return cookies.length?cookies.join('; '):null;
}

export async function fetchVerifiedVercelRequest(url,headers,fetchImpl=fetch,requestInit={}){
  const request={...requestInit,headers,redirect:'manual',cache:'no-store'};
  const first=await fetchImpl(url,request);
  const firstLocation=first.headers.get('location');
  const firstDiagnostic=diagnosticResponse(first,firstLocation,url);
  if(first.status<300||first.status>=400||!firstDiagnostic.same_origin||!firstDiagnostic.same_path)return {response:first,initial:firstDiagnostic};
  const cookie=bypassCookie(first);
  if(!cookie)return {response:first,initial:firstDiagnostic};
  const target=new URL(firstLocation,url);
  const response=await fetchImpl(target,{...requestInit,headers:{...headers,cookie},redirect:'manual',cache:'no-store'});
  return {response,initial:firstDiagnostic};
}

export async function readManagementProfile(token,fetchImpl=fetch){
  const response=await fetchImpl(managementUrl('/v1/profile'),{headers:managementHeaders(token),redirect:'manual',cache:'no-store'});
  return {status:response.status,redirected:response.redirected,url:safeUrlParts(response.url)?{origin:new URL(response.url).origin,pathname:new URL(response.url).pathname}:null};
}

export async function readAuthConfig(ref,token,fetchImpl=fetch){
  const endpoint=managementUrl(`/v1/projects/${encodeURIComponent(ref)}/config/auth`);
  const environment=ref===PRODUCTION_REF?'PROD':'STAGE';
  const first=await fetchImpl(endpoint,{headers:managementHeaders(token),redirect:'manual',cache:'no-store'});
  const location=first.headers.get('location');
  const initial=diagnosticResponse(first,location,endpoint);
  if(first.ok)return {config:await first.json(),initial,canonical:null};
  if(first.status<300||first.status>=400)fail(`SB_AUTH_${environment}_READ:${first.status}`);
  const target=safeUrlParts(location,endpoint);
  if(!canonicalAuthConfigRedirect(target,endpoint))fail('SUPABASE_MANAGEMENT_REDIRECT_UNSAFE');
  const canonicalUrl=new URL(target.pathname,target.origin);
  const canonicalResponse=await fetchImpl(canonicalUrl,{headers:managementHeaders(token),redirect:'manual',cache:'no-store'});
  if(!canonicalResponse.ok)fail(`SB_AUTH_${environment}_CANONICAL_READ:${canonicalResponse.status}`);
  return {config:await canonicalResponse.json(),initial,canonical:diagnosticResponse(canonicalResponse,canonicalResponse.headers.get('location'),canonicalUrl)};
}

function mailSlurpHeaders(apiKey,hasBody=false){return {'x-api-key':apiKey,accept:'application/json',...(hasBody?{'content-type':'application/json'}:{})}}
async function mailSlurpJson(path,apiKey,options,code,fetchImpl=fetch){
  const response=await fetchImpl(`${MAILSLURP_API_BASE}${path}`,{...options,headers:{...mailSlurpHeaders(apiKey,Boolean(options.body)),...options.headers},cache:'no-store'});
  return json(response,code);
}
function requiredRunMarker(marker){if(typeof marker!=='string'||!(/^(?:garage-link-[a-z0-9-]{8,}|g[0-9a-f]{6})$/i.test(marker)))fail('MAILSLURP_RUN_MARKER_INVALID');return marker}
function normalizeEmail(value){return String(value??'').trim().toLowerCase()}
function manualGmailBaseAddress(value){
  const email=normalizeEmail(value);
  const match=/^([^@+\s]+)(?:\+[^@\s]*)?@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.exec(email);
  if(!match)fail('MANUAL_GMAIL_PLUS_ADDRESS_UNAVAILABLE');
  return {localPart:match[1],domain:match[2]};
}
function manualGmailAddress(baseAddress,runMarker,plusAddressing=true){
  const marker=requiredRunMarker(runMarker);
  const base=manualGmailBaseAddress(baseAddress);
  if(!plusAddressing)return `${base.localPart}@${base.domain}`;
  const localPart=`${base.localPart}+${marker}`;
  if(localPart.length>64)fail('MANUAL_GMAIL_PLUS_ADDRESS_TOO_LONG');
  return `${localPart}@${base.domain}`;
}
export async function releaseCriticalBaseUrl(eventPath,fallback=process.env.PLAYWRIGHT_BASE_URL,readFileImpl=readFile){
  let event;
  try {event=JSON.parse(await readFileImpl(eventPath,'utf8'))} catch {fail('RELEASE_CRITICAL_WORKFLOW_EVENT_INVALID')}
  const supplied=event?.inputs?.staging_base_url;
  if(typeof supplied==='string'&&supplied.trim()){
    let url;
    try {url=new URL(supplied.trim())} catch {fail('RELEASE_CRITICAL_STAGING_BASE_URL_INVALID')}
    if(url.protocol!=='https:'||!/^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname))fail('RELEASE_CRITICAL_STAGING_BASE_URL_DENIED');
    return url.toString();
  }
  if(typeof fallback!=='string'||!fallback.trim())fail('RELEASE_CRITICAL_PREFLIGHT_MISSING:PLAYWRIGHT_BASE_URL');
  return fallback.trim();
}

export function createManualGmailSession(baseAddress,runMarker=`garage-link-${crypto.randomUUID()}`,{plusAddressing=true}={}){
  const marker=requiredRunMarker(runMarker);
  return {emailMode:'manual_gmail',runMarker:marker,emailAddress:manualGmailAddress(baseAddress,marker,plusAddressing),plusAddressing};
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

function runtimeProvenance(value,baseUrl){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('RUNTIME_PROVENANCE_INVALID');
  const keys=Object.keys(value).sort();
  const expected=['deployment_id','deployment_url','environment','git_commit_ref','git_commit_sha','project_id'];
  if(keys.length!==expected.length||keys.some((key,index)=>key!==expected[index]))fail('RUNTIME_PROVENANCE_RESPONSE_SHAPE_INVALID');
  if(value.project_id!==STAGING_PROJECT_ID||!/^dpl_[A-Za-z0-9]+$/.test(value.deployment_id)||!/^[0-9a-f]{40}$/i.test(value.git_commit_sha)||typeof value.git_commit_ref!=='string'||!value.git_commit_ref||typeof value.environment!=='string'||!value.environment)fail('RUNTIME_PROVENANCE_INVALID');
  let deploymentUrl;
  try {deploymentUrl=new URL(value.deployment_url)} catch {fail('RUNTIME_PROVENANCE_INVALID')}
  if(deploymentUrl.protocol!=='https:'||!deploymentUrl.hostname.endsWith('.vercel.app')||PRODUCTION_HOSTS.has(deploymentUrl.hostname)||deploymentUrl.hostname.endsWith('.garage-link.tech')||baseUrl.hostname.endsWith('.garage-link.tech'))fail('RUNTIME_PROVENANCE_INVALID');
  return value;
}

async function main(){
  const eventPath=required('GITHUB_EVENT_PATH');
  const baseUrl=new URL(await releaseCriticalBaseUrl(eventPath));
  const supabaseUrl=new URL(required('E2E_TEST_SUPABASE_URL'));
  const serviceRole=required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY');
  const bypassSecret=required('VERCEL_AUTOMATION_BYPASS_SECRET');
  if(supabaseUrl.hostname!==`${STAGING_REF}.supabase.co`||supabaseUrl.hostname.includes(PRODUCTION_REF))fail('SUPABASE_STAGING_REF_MISMATCH');
  if(PRODUCTION_HOSTS.has(baseUrl.hostname)||baseUrl.hostname.endsWith('.garage-link.tech'))fail('VERCEL_PRODUCTION_HOST_DENIED');
  const admin=createClient(supabaseUrl.toString(),serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:users,error:usersError}=await admin.auth.admin.listUsers({page:1,perPage:1});
  if(usersError||!users)fail(`SUPABASE_SERVICE_ROLE_ADMIN_API_FAILED:${usersError?.status??0}`);

  // PREFLIGHT verifies direct Automation Bypass access. Cookie issuance is only
  // needed by browser follow-up requests and deliberately causes a redirect.
  const bypassHeaders={'x-vercel-protection-bypass':bypassSecret,accept:'application/json'};
  const provenanceUrl=new URL('/api/qa/provenance',baseUrl);
  const provenanceRequest=await fetchVerifiedVercelRequest(provenanceUrl,bypassHeaders);
  const provenanceResponse=provenanceRequest.response;
  if(provenanceResponse.status<200||provenanceResponse.status>=300||provenanceResponse.headers.has('location')||new URL(provenanceResponse.url).origin!==baseUrl.origin){
    const runtimeContract=String(provenanceResponse.headers.get('x-garage-qa-provenance-error')??'UNCLASSIFIED').replace(/[^A-Z_]/g,'').slice(0,32);
    process.stdout.write(`${JSON.stringify({ok:false,state:'PREFLIGHT_VERCEL_REDIRECT_DIAGNOSTIC',runtime_contract:runtimeContract,vercel_provenance:{initial:provenanceRequest.initial,final:diagnosticResponse(provenanceResponse,provenanceResponse.headers.get('location'),provenanceUrl)}})}\n`);
    fail(`RUNTIME_PROVENANCE_ACCESS_FAILED:${provenanceResponse.status}`);
  }
  const provenance=runtimeProvenance(await provenanceResponse.json().catch(()=>null),baseUrl);
  const expectedSha=process.env.RELEASE_CRITICAL_EXPECTED_SHA?.trim();
  if(expectedSha&&(!/^[0-9a-f]{40}$/i.test(expectedSha)||provenance.git_commit_sha.toLowerCase()!==expectedSha.toLowerCase()))fail('RUNTIME_PROVENANCE_SHA_MISMATCH');
  const healthUrl=new URL('/api/health',baseUrl);
  const bypass=(await fetchVerifiedVercelRequest(healthUrl,bypassHeaders)).response;
  if(bypass.status<200||bypass.status>=300||bypass.headers.has('location')||new URL(bypass.url).origin!==baseUrl.origin)fail(`VERCEL_AUTOMATION_BYPASS_FAILED:${bypass.status}`);
  const health=await bypass.json().catch(()=>null);
  if(health?.ok!==true||health.service!=='garage-link')fail('VERCEL_AUTOMATION_BYPASS_APPLICATION_UNREACHED');
  process.stdout.write(`${JSON.stringify({ok:true,state:'PREFLIGHT_READY',environment:'garage-link-staging',source_sha:provenance.git_commit_sha,branch:provenance.git_commit_ref,deployment_id:provenance.deployment_id,base_url:baseUrl.origin,auth:{service_role_admin_api:'PASS',management_api:'NOT_REQUIRED_FOR_NORMAL_RUN',hosted_contract_baseline_run_id:'31488195475',redirect_drift_gate:'HOSTED_GENERATED_LINK_AND_ACTUAL_CALLBACK_FAIL_CLOSED'},email_transport:{state:'DECOUPLED_WAITING_TRANSPORT'},vercel:{project:STAGING_PROJECT_NAME,ready:'PASS',protection_bypass:'VERCEL_AUTOMATION_BYPASS_PASS'}})}\n`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write(`${JSON.stringify({ok:false,code:redact(error)})}\n`);process.exitCode=1});
