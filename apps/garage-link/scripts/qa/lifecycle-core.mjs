import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const CONTRACT = Object.freeze({
  product: 'garage-link', environment: 'staging', projectRef: 'gaytoojzwqkpuvfofeql',
  supabaseUrl: 'https://gaytoojzwqkpuvfofeql.supabase.co',
  canonical: 'https://garage-link-staging.vercel.app',
  vercelProjectId: 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3',
  vercelProjectName: 'garage-link-staging', vercelTeamId: 'team_lwplVfhiCsDfbabe2YXf71H5',
  keychainService: 'kannagi.garage-link.staging-service-role',
  productionDenylist: ['wmlpuzuskfiwdipluglz', 'garage-link.tech', 'sk_live_', 'api.line.me'],
});

export const NEXT_ACTION = Object.freeze({
  CREATED:'preflight',PREFLIGHT_RUNNING:'preflight',PREFLIGHT_READY:'provision',PROVISIONING:'provision',
  PROVISIONED:'auth',AUTH_READY:'run',TEST_RUNNING:'run',TEST_COMPLETE:'teardown-dry-run',
  TEARDOWN_DRY_RUN:'teardown-dry-run',TEARDOWN_READY:'teardown',TEARING_DOWN:'teardown',
  DB_CLEANED:'teardown',AUTH_CLEANED:'teardown',ARTIFACT_CLEANED:'verify-clean',
  VERIFIED_CLEAN:'verify-clean',COMPLETE:'none',HARD_STOP:'none',
});
export const TRANSITIONS=Object.freeze({
  CREATED:['PREFLIGHT_RUNNING','HARD_STOP'],PREFLIGHT_RUNNING:['PREFLIGHT_READY','FAILED_RECOVERABLE','HARD_STOP'],
  PREFLIGHT_READY:['PROVISIONING','TEARDOWN_DRY_RUN','FAILED_RECOVERABLE','HARD_STOP'],PROVISIONING:['PROVISIONED','FAILED_RECOVERABLE','HARD_STOP'],
  PROVISIONED:['AUTH_READY','FAILED_RECOVERABLE','HARD_STOP'],AUTH_READY:['TEST_RUNNING','FAILED_RECOVERABLE','HARD_STOP'],
  TEST_RUNNING:['TEST_COMPLETE','FAILED_RECOVERABLE','HARD_STOP'],TEST_COMPLETE:['TEARDOWN_DRY_RUN','FAILED_RECOVERABLE','HARD_STOP'],
  TEARDOWN_DRY_RUN:['TEARDOWN_READY','FAILED_RECOVERABLE','HARD_STOP'],TEARDOWN_READY:['TEARING_DOWN','FAILED_RECOVERABLE','HARD_STOP'],
  TEARING_DOWN:['DB_CLEANED','FAILED_RECOVERABLE','HARD_STOP'],DB_CLEANED:['AUTH_CLEANED','FAILED_RECOVERABLE','HARD_STOP'],
  AUTH_CLEANED:['ARTIFACT_CLEANED','FAILED_RECOVERABLE','HARD_STOP'],ARTIFACT_CLEANED:['VERIFIED_CLEAN','FAILED_RECOVERABLE','HARD_STOP'],
  VERIFIED_CLEAN:['COMPLETE','FAILED_RECOVERABLE','HARD_STOP'],FAILED_RECOVERABLE:['PREFLIGHT_RUNNING','PROVISIONING','PROVISIONED','TEST_RUNNING','TEARDOWN_DRY_RUN','TEARING_DOWN','ARTIFACT_CLEANED','HARD_STOP'],
});
export function transitionAllowed(from,to){return TRANSITIONS[from]?.includes(to)??false}

export function coded(failureClass, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined); error.failureClass = failureClass; return error;
}
export function assertRunId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value??'')) throw coded('EXECUTION_LIFECYCLE','RUN_ID_REQUIRED_OR_INVALID');
  return value.toLowerCase();
}
export function assertSafeContract(values) {
  const text=JSON.stringify(values).toLowerCase();
  for(const denied of CONTRACT.productionDenylist) if(text.includes(denied.toLowerCase())) throw coded('SECURITY_BOUNDARY',`PRODUCTION_DENYLIST_MATCH:${denied}`);
  if(values.projectRef&&values.projectRef!==CONTRACT.projectRef) throw coded('CREDENTIAL','SUPABASE_PROJECT_MISMATCH');
  if(values.canonical&&values.canonical!==CONTRACT.canonical) throw coded('VERCEL_PROTECTION','CANONICAL_HOST_MISMATCH');
}
export function classifyFailure(error) {
  const text=String(error?.message??error).toLowerCase();
  if(/keychain|service.role|admin api|project.mismatch|credential|jwt/.test(text)) return 'CREDENTIAL';
  if(/otp|password|cookie|session|login|auth/.test(text)) return 'AUTHENTICATION';
  if(/capacity|limit|entitlement|duplicate|quota/.test(text)) return 'CAPACITY';
  if(/browser|chromium|webkit|executable/.test(text)) return 'BROWSER';
  if(/vercel|protection|bypass|canonical/.test(text)) return 'VERCEL_PROTECTION';
  if(/fixture|teardown|cleanup|foreign key|owner|residual|marker|tenant|expired|stripe.id|line.connection|uploaded.file/.test(text)) return 'FIXTURE_LIFECYCLE';
  return 'EXECUTION_LIFECYCLE';
}
export function safeError(error){return{failure_class:error?.failureClass??classifyFailure(error),code:String(error?.message??error).replace(/[A-Za-z0-9_-]{32,}/g,'[REDACTED]')}}
export function nextAfter(state){return NEXT_ACTION[state]??'status'}
export function fixtureIdentity(runId,fixtureType='canary',date='20260804'){
  const prefix=fixtureType==='canary'?'CANARY':fixtureType.toUpperCase(); const marker=`[${prefix} QA ${date}]`;
  return{tenantId:randomUUID(),storeId:randomUUID(),membershipId:randomUUID(),marker,expectedTenantName:`${marker} Lifecycle Tenant`,storeName:`${marker} 受入監査店`,operatorReference:`qa:${runId}`};
}
export function qaEmail(runId){return`qa.lifecycle.${runId.replaceAll('-','')}@example.invalid`}
export function randomPassword(){return`${randomBytes(36).toString('base64url')}Aa1!`}
export function sha256(value){return createHash('sha256').update(value).digest('hex')}
export function keychainRead(service,account=process.env.USER??'ksk'){
  const result=spawnSync('security',['find-generic-password','-s',service,'-a',account,'-w'],{encoding:'utf8'});
  if(result.status!==0||!result.stdout.trim()) throw coded('CREDENTIAL',`KEYCHAIN_ITEM_UNAVAILABLE:${service}`); return result.stdout.trim();
}
export function keychainWrite(service,secret,account=process.env.USER??'ksk'){
  const result=spawnSync('security',['add-generic-password','-U','-s',service,'-a',account,'-w',secret],{encoding:'utf8'});
  if(result.status!==0) throw coded('VERCEL_PROTECTION',`KEYCHAIN_WRITE_FAILED:${service}`);
}
export function keychainDelete(service,account=process.env.USER??'ksk'){
  const result=spawnSync('security',['delete-generic-password','-s',service,'-a',account],{encoding:'utf8'});
  if(![0,44].includes(result.status)) throw coded('VERCEL_PROTECTION',`KEYCHAIN_DELETE_FAILED:${service}`);
}
export function validateServiceKey(key){
  if(key.startsWith('sb_secret_')) return{format:'secret-key',projectRef:'verified-by-admin-call'};
  const parts=key.split('.'); if(parts.length!==3) throw coded('CREDENTIAL','SERVICE_ROLE_KEY_FORMAT_INVALID');
  let payload; try{payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))}catch(error){throw coded('CREDENTIAL','SERVICE_ROLE_JWT_DECODE_FAILED',error)}
  if(payload.role!=='service_role') throw coded('CREDENTIAL','SERVICE_ROLE_JWT_ROLE_INVALID');
  if(payload.ref&&payload.ref!==CONTRACT.projectRef) throw coded('CREDENTIAL','SERVICE_ROLE_JWT_PROJECT_MISMATCH');
  return{format:'legacy-jwt',projectRef:payload.ref??'verified-by-admin-call'};
}
export function checkpointPath(root,runId){return resolve(root,'.qa-runs',`${runId}.json`)}
export async function writeCheckpoint(root,runId,value){
  const path=checkpointPath(root,runId); await mkdir(resolve(root,'.qa-runs'),{recursive:true,mode:0o700});
  const safe=JSON.stringify({...value,run_id:runId,updated_at:new Date().toISOString()},null,2);
  if(/"password"\s*:|otp_value|cookie_value|service_role_key|bypass_secret|access_token|@example\.invalid/i.test(safe)) throw coded('EXECUTION_LIFECYCLE','CHECKPOINT_SECRET_OR_PII_REJECTED');
  await writeFile(path,`${safe}\n`,{mode:0o600}); await chmod(path,0o600); return path;
}
export async function readCheckpoint(root,runId){try{return JSON.parse(await readFile(checkpointPath(root,runId),'utf8'))}catch(error){if(error?.code==='ENOENT')return null;throw error}}
export async function removeCheckpoint(root,runId){await rm(checkpointPath(root,runId),{force:true})}
export function parseArgs(argv){
  const[command,...rest]=argv,args={command}; for(let i=0;i<rest.length;i+=1){if(!rest[i].startsWith('--'))throw coded('EXECUTION_LIFECYCLE',`UNEXPECTED_ARGUMENT:${rest[i]}`);const key=rest[i].slice(2).replaceAll('-','_'),value=rest[i+1];if(!value||value.startsWith('--'))args[key]=true;else{args[key]=value;i+=1}} return args;
}
