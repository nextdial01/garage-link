#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { readAuthConfig } from './release-critical-preflight.mjs';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const PRODUCTION_REF='wmlpuzuskfiwdipluglz';
const MANAGEMENT_ORIGIN='https://api.supabase.com';

function required(name){const value=process.env[name]?.trim();if(!value)throw new Error(`RELEASE_CRITICAL_STAGE_AUTH_MISSING:${name}`);return value}
function authEndpoint(ref){return new URL(`/v1/projects/${encodeURIComponent(ref)}/config/auth`,MANAGEMENT_ORIGIN)}

export async function applyStagingPasswordMinimum(token,fetchImpl=fetch){
  const endpoint=authEndpoint(STAGING_REF);
  const response=await fetchImpl(endpoint,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({password_min_length:8,mailer_autoconfirm:false}),redirect:'manual',cache:'no-store'});
  if(!response.ok||response.status>=300)throw new Error(`STAGING_PASSWORD_MINIMUM_UPDATE_FAILED:${response.status}`);
  const readback=await readAuthConfig(STAGING_REF,token,fetchImpl);
  const minimum=readback.config?.password_min_length??readback.config?.minimum_password_length;
  if(minimum!==8||readback.config?.mailer_autoconfirm!==false)throw new Error('STAGING_AUTH_CONTRACT_READBACK_FAILED');
  return {project_ref:STAGING_REF,password_minimum:minimum,email_confirmation_required:true};
}

async function main(){
  const token=required('GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN');
  const result=await applyStagingPasswordMinimum(token);
  process.stdout.write(`${JSON.stringify({state:'STAGING_AUTH_CONTRACT_READY',...result,production_ref:PRODUCTION_REF,production_write:false})}\n`);
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{process.stdout.write(`${JSON.stringify({ok:false,state:'STAGING_PASSWORD_MINIMUM_UPDATE_FAILED',code:String(error?.message??error).replace(/\b(?:sbp|sb_secret|eyJ)[A-Za-z0-9._-]+\b/g,'[REDACTED]')})}\n`);process.exitCode=1;});
