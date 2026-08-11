#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { readAuthConfig } from './release-critical-preflight.mjs';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';
const MANAGEMENT_ORIGIN='https://api.supabase.com';

function required(name){const value=process.env[name]?.trim();if(!value)throw new Error(`RELEASE_CRITICAL_STAGE_AUTH_MISSING:${name}`);return value}
function authEndpoint(ref){return new URL(`/v1/projects/${encodeURIComponent(ref)}/config/auth`,MANAGEMENT_ORIGIN)}
function allowedUrls(config){
  const raw=[config?.uri_allow_list,config?.additional_redirect_urls].flatMap(value=>Array.isArray(value)?value:[value]);
  return raw.flatMap(value=>String(value??'').split(',')).map(value=>value.trim()).filter(Boolean);
}
function isLocalhostRedirect(value){try {return ['localhost','127.0.0.1','[::1]'].includes(new URL(value.replace(/\*+$/,'')).hostname)} catch {return false}}
async function stagingOrigin(){const event=JSON.parse(await readFile(required('GITHUB_EVENT_PATH'),'utf8'));const value=String(event?.inputs?.staging_base_url??'').trim();const url=new URL(value);if(url.protocol!=='https:'||!/^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname))throw new Error('STAGING_AUTH_ORIGIN_INVALID');return url.origin}

export async function applyStagingPasswordMinimum(token,fetchImpl=fetch,origin){
  const resolvedOrigin=origin??await stagingOrigin();
  const endpoint=authEndpoint(STAGING_REF);
  const current=await readAuthConfig(STAGING_REF,token,fetchImpl);
  // Preserve every existing non-local redirect while removing the exact
  // localhost fallback that caused the prior confirmation callback to leave
  // Staging. Supabase evaluates emailRedirectTo against the callback URL,
  // not the post-callback next route.
  const allowlist=new Set(allowedUrls(current.config).filter(value=>!isLocalhostRedirect(value)));
  allowlist.add(`${resolvedOrigin}/auth/callback`);
  allowlist.add(`${resolvedOrigin}/auth/callback**`);
  const redirectField=Object.prototype.hasOwnProperty.call(current.config??{},'additional_redirect_urls')?'additional_redirect_urls':'uri_allow_list';
  const response=await fetchImpl(endpoint,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({password_min_length:8,mailer_autoconfirm:false,site_url:resolvedOrigin,[redirectField]:[...allowlist].join(',')}),redirect:'manual',cache:'no-store'});
  if(!response.ok||response.status>=300)throw new Error(`STAGING_PASSWORD_MINIMUM_UPDATE_FAILED:${response.status}`);
  const readback=await readAuthConfig(STAGING_REF,token,fetchImpl);
  const minimum=readback.config?.password_min_length??readback.config?.minimum_password_length;
  const readbackAllowlist=allowedUrls(readback.config);
  const callbackAllowed=[`${resolvedOrigin}/auth/callback`,`${resolvedOrigin}/auth/callback**`].every(expected=>readbackAllowlist.includes(expected));
  const localhostFallback=readbackAllowlist.some(isLocalhostRedirect);
  if(minimum!==8||readback.config?.mailer_autoconfirm!==false||readback.config?.site_url!==resolvedOrigin||!callbackAllowed||localhostFallback)throw new Error('STAGING_AUTH_CONTRACT_READBACK_FAILED');
  return {project_ref:STAGING_REF,password_minimum:minimum,email_confirmation_required:true,staging_origin:resolvedOrigin,callback_allowed:callbackAllowed,recovery_allowed:callbackAllowed,localhost_redirects_removed:!localhostFallback};
}

async function main(){
  const token=required('GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN');
  const result=await applyStagingPasswordMinimum(token);
  process.stdout.write(`${JSON.stringify({state:'STAGING_AUTH_CONTRACT_READY',...result,production_ref:PRODUCTION_REF,production_write:false})}\n`);
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{process.stdout.write(`${JSON.stringify({ok:false,state:'STAGING_PASSWORD_MINIMUM_UPDATE_FAILED',code:String(error?.message??error).replace(/\b(?:sbp|sb_secret|eyJ)[A-Za-z0-9._-]+\b/g,'[REDACTED]')})}\n`);process.exitCode=1;});
