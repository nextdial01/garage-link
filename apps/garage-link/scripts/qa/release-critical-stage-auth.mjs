#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { fetchVerifiedVercelRequest, readAuthConfig } from './release-critical-preflight.mjs';
import { CONTROLLED_AUTH_EMAIL_CONTRACT, validateControlledAuthConfirmOrigin } from './release-critical-email-transport.mjs';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';
const STAGING_PROJECT_ID='prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const MANAGEMENT_ORIGIN='https://api.supabase.com';

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_STAGE_AUTH_MISSING:${name}`);return value}
function authEndpoint(ref){return new URL(`/v1/projects/${encodeURIComponent(ref)}/config/auth`,MANAGEMENT_ORIGIN)}
function allowedUrls(config){
  const raw=[config?.uri_allow_list,config?.additional_redirect_urls].flatMap(value=>Array.isArray(value)?value:[value]);
  return raw.flatMap(value=>String(value??'').split(',')).map(value=>value.trim()).filter(Boolean);
}
function isLocalhostRedirect(value){try {return ['localhost','127.0.0.1','[::1]'].includes(new URL(value.replace(/\*+$/,'')).hostname)} catch {return false}}
function redirectAllowed(pattern,target){
  const escaped=pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'__GLOBSTAR__').replace(/\*/g,'[^/?]*').replace(/__GLOBSTAR__/g,'.*');
  return new RegExp(`^${escaped}$`).test(target);
}
function controlledStagingOrigin(value){
  const {origin}=validateControlledAuthConfirmOrigin(value);
  const hostname=new URL(origin).hostname.toLowerCase();
  if(hostname==='garage-link.tech'||hostname==='www.garage-link.tech')fail('STAGING_AUTH_CONTROLLED_ORIGIN_INVALID');
  return origin;
}
function stagingRuntimeOrigin(value){
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||!/^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname))fail('STAGING_AUTH_RUNTIME_ORIGIN_INVALID');
    return url.origin;
  } catch(error) {
    if(String(error?.message??'')==='STAGING_AUTH_RUNTIME_ORIGIN_INVALID')throw error;
    fail('STAGING_AUTH_RUNTIME_ORIGIN_INVALID');
  }
}
function templateContent(config,key){return String(config?.[key]??'').replace(/\r\n/g,'\n').trim();}
function validateTemplate(name,content,type){
  const normalized=String(content).replace(/\r\n/g,'\n').trim();
  if(!normalized.includes('{{ .RedirectTo }}')||!normalized.includes('{{ .TokenHash }}')||normalized.includes('{{ .ConfirmationURL }}')||!normalized.includes(`type=${type}`))fail(`STAGING_AUTH_TEMPLATE_SOURCE_INVALID:${name}`);
  return normalized;
}
async function sourceTemplates(readFileImpl=readFile){
  const [confirmation,recovery]=await Promise.all([
    readFileImpl(new URL('../../supabase/templates/confirmation.html',import.meta.url),'utf8'),
    readFileImpl(new URL('../../supabase/templates/recovery.html',import.meta.url),'utf8'),
  ]);
  return {
    confirmation:validateTemplate('confirmation',confirmation,'email'),
    recovery:validateTemplate('recovery',recovery,'recovery'),
  };
}
function smtpReadback(config){
  const host=String(config?.smtp_host??'').trim();
  const sender=String(config?.smtp_admin_email??'').trim().toLowerCase();
  const senderName=String(config?.smtp_sender_name??'').trim();
  const domain=sender.includes('@')?sender.slice(sender.lastIndexOf('@')+1):'';
  const garageLinkDomain=/(?:^|\.)garage-link\.tech$/i.test(domain);
  const missing=[!host&&'smtp_host',!sender&&'smtp_admin_email',!senderName&&'smtp_sender_name',sender&&!garageLinkDomain&&'smtp_admin_email_garage_link_domain'].filter(Boolean);
  return {configured:missing.length===0,missing,host_configured:Boolean(host),sender_domain:garageLinkDomain?domain:null,sender_name_configured:Boolean(senderName)};
}
function safePatchFailure(response,body,allowlist){
  const providerCode=String(body?.code??body?.error_code??'UNKNOWN').replace(/[^A-Z0-9_-]/gi,'_').slice(0,48);
  const message=String(body?.message??body?.error??'').toLowerCase();
  const category=/uri|redirect|allow.?list/.test(message)?'REDIRECT_CONTRACT':/site.?url/.test(message)?'SITE_URL':/template/.test(message)?'TEMPLATE':'UNCLASSIFIED';
  return `STAGING_AUTH_ADMIN_CONFIG_UPDATE_FAILED:${response.status}:${providerCode}:${category}:ALLOWLIST_COUNT_${allowlist.size}`;
}

export async function readStagingRuntimeProvenance({runtimeOrigin,expectedSha,bypassSecret,fetchImpl=fetch}){
  const baseUrl=stagingRuntimeOrigin(runtimeOrigin);
  const headers={accept:'application/json',...(bypassSecret?{'x-vercel-protection-bypass':bypassSecret}:{})};
  const request=await fetchVerifiedVercelRequest(new URL('/api/qa/provenance',baseUrl),headers,fetchImpl);
  const response=request.response;
  if(!response.ok||response.headers.has('location'))fail(`STAGING_AUTH_RUNTIME_PROVENANCE_UNREACHED:${response.status}`);
  const value=await response.json().catch(()=>null);
  if(!value||value.project_id!==STAGING_PROJECT_ID||!/^dpl_[A-Za-z0-9]+$/.test(value.deployment_id??'')||!/^[0-9a-f]{40}$/i.test(value.git_commit_sha??'')||typeof value.git_commit_ref!=='string'||!value.git_commit_ref||!['preview','staging'].includes(String(value.environment).toLowerCase()))fail('STAGING_AUTH_RUNTIME_PROVENANCE_INVALID');
  if(expectedSha&&value.git_commit_sha.toLowerCase()!==expectedSha.toLowerCase())fail('STAGING_AUTH_RUNTIME_SHA_MISMATCH');
  const authConfirmOrigin=controlledStagingOrigin(value.auth_confirm_origin);
  return {runtime_origin:baseUrl,project_id:value.project_id,deployment_id:value.deployment_id,source_sha:value.git_commit_sha.toLowerCase(),source_ref:value.git_commit_ref,environment:String(value.environment).toLowerCase(),auth_confirm_origin:authConfirmOrigin};
}

export async function verifyControlledConfirmReach(origin,_bypassSecret,fetchImpl=fetch){
  const confirmationOrigin=controlledStagingOrigin(origin);
  // The Vercel bypass secret is required for the private preview runtime
  // provenance read, but must never accompany a request to the public
  // controlled custom origin: Vercel responds there with a 307 instead of
  // reaching the public /auth/confirm handler.
  const response=await fetchImpl(new URL('/auth/confirm',confirmationOrigin),{headers:{accept:'text/html'},redirect:'manual',cache:'no-store'});
  if(!response.ok||response.headers.has('location'))fail(`STAGING_AUTH_CONFIRM_UNREACHED:${response.status}`);
  return {confirmation_origin:confirmationOrigin,http_status:response.status,redirect:false};
}

export async function applyStagingAuthAdminConfig(token,{origin,templates,fetchImpl=fetch}={}){
  const controlledOrigin=controlledStagingOrigin(origin);
  const expectedTemplates=templates??await sourceTemplates();
  const endpoint=authEndpoint(STAGING_REF);
  const current=await readAuthConfig(STAGING_REF,token,fetchImpl);
  const smtp=smtpReadback(current.config);
  if(!smtp.configured)fail(`STAGING_AUTH_CUSTOM_SMTP_REQUIRED:${smtp.missing.join(',')}`);
  const allowlist=new Set(allowedUrls(current.config).filter(value=>!isLocalhostRedirect(value)));
  allowlist.add(`${controlledOrigin}/**`);
  const desired={password_min_length:8,mailer_autoconfirm:false,site_url:controlledOrigin,uri_allow_list:[...allowlist].join(',')};
  const patch={};
  for(const [key,value] of Object.entries(desired))if(String(current.config?.[key]??'')!==String(value))patch[key]=value;
  if(templateContent(current.config,'mailer_templates_confirmation_content')!==expectedTemplates.confirmation)patch.mailer_templates_confirmation_content=expectedTemplates.confirmation;
  if(templateContent(current.config,'mailer_templates_recovery_content')!==expectedTemplates.recovery)patch.mailer_templates_recovery_content=expectedTemplates.recovery;
  if(Object.keys(patch).length){
    const response=await fetchImpl(endpoint,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(patch),redirect:'manual',cache:'no-store'});
    if(!response.ok||response.status>=300){
      const body=await response.json().catch(()=>null);
      fail(safePatchFailure(response,body,allowlist));
    }
  }
  const readback=await readAuthConfig(STAGING_REF,token,fetchImpl);
  const readbackAllowlist=allowedUrls(readback.config);
  const readbackSmtp=smtpReadback(readback.config);
  const confirmationAllowed=readbackAllowlist.some(pattern=>redirectAllowed(pattern,`${controlledOrigin}/auth/confirm?next=%2Fauth%2Fcallback`));
  const recoveryAllowed=readbackAllowlist.some(pattern=>redirectAllowed(pattern,`${controlledOrigin}/auth/confirm?next=%2Fauth%2Freset-password`));
  if(readback.config?.password_min_length!==8||readback.config?.mailer_autoconfirm!==false||readback.config?.site_url!==controlledOrigin||!readbackSmtp.configured||!confirmationAllowed||!recoveryAllowed||templateContent(readback.config,'mailer_templates_confirmation_content')!==expectedTemplates.confirmation||templateContent(readback.config,'mailer_templates_recovery_content')!==expectedTemplates.recovery)fail('STAGING_AUTH_ADMIN_CONFIG_READBACK_FAILED');
  return {project_ref:STAGING_REF,password_minimum:8,email_confirmation_required:true,site_origin:controlledOrigin,redirect_allowlist_count:readbackAllowlist.length,confirmation_redirect_allowed:confirmationAllowed,recovery_redirect_allowed:recoveryAllowed,custom_smtp:true,smtp_host_configured:true,smtp_sender_domain:readbackSmtp.sender_domain,smtp_sender_name_configured:true,confirmation_template:'TOKENHASH_MATCH',recovery_template:'TOKENHASH_MATCH',auth_email_contract:CONTROLLED_AUTH_EMAIL_CONTRACT,production_ref:PRODUCTION_REF,production_write:false,patch_applied:Object.keys(patch).length>0};
}

async function main(){
  const token=required('GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN');
  const runtime=await readStagingRuntimeProvenance({runtimeOrigin:required('STAGING_RUNTIME_ORIGIN'),expectedSha:required('RELEASE_CRITICAL_EXPECTED_SHA'),bypassSecret:required('VERCEL_AUTOMATION_BYPASS_SECRET')});
  const reachability=await verifyControlledConfirmReach(runtime.auth_confirm_origin,required('VERCEL_AUTOMATION_BYPASS_SECRET'));
  const result=await applyStagingAuthAdminConfig(token,{origin:runtime.auth_confirm_origin});
  process.stdout.write(`${JSON.stringify({state:'STAGING_AUTH_ADMIN_CONFIG_READY',runtime,reachability,...result})}\n`);
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{process.stdout.write(`${JSON.stringify({ok:false,state:'STAGING_AUTH_ADMIN_CONFIG_FAILED',code:String(error?.message??error).replace(/\b(?:sbp|sb_secret|eyJ)[A-Za-z0-9._-]+\b/g,'[REDACTED]').replace(/https?:\/\/\S+/g,'[REDACTED_URL]')})}\n`);process.exitCode=1;});
