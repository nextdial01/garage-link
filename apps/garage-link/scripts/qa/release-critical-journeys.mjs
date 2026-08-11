#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { chromium, webkit } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createManualGmailSession, manualGmailCheckpoint, manualGmailWorkflowInput, pollManualGmailConfirmation, releaseCriticalBaseUrl } from './release-critical-preflight.mjs';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const STAGING_PROJECT_ID='prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PRODUCTION_PROJECT_ID='prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const PARTIAL_MARKER='garage-link-139f4794-3a9b-4332-ad72-6ba56e2c8377';
const CHECKPOINT_TIMEOUT_MS=20*60_000;

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_JOURNEY_MISSING:${name}`);return value}
function safeErrorCode(error){return String(error?.message??error).replace(/https?:\/\/\S+/g,'[REDACTED_URL]').replace(/\b(?:sbp|sb_secret|eyJ)[A-Za-z0-9._-]+\b/g,'[REDACTED]').slice(0,180)}
function emit(value){process.stdout.write(`${JSON.stringify(value)}\n`)}
function sha256(value){return createHash('sha256').update(value).digest('hex')}
function signupAlertClassification(value){
  const message=String(value??'').trim();
  if(/redirect.*(?:not allowed|not permitted|allow)/i.test(message))return 'REDIRECT_URL_NOT_ALLOWED';
  if(/email.*rate limit|少し時間/.test(message))return 'EMAIL_RATE_LIMITED';
  if(/already registered|既に登録/.test(message))return 'DUPLICATE_USER';
  if(/valid password|有効なパスワード|8文字以上/.test(message))return 'PASSWORD_POLICY_REJECTED';
  if(/valid email|メールアドレスの形式/.test(message))return 'EMAIL_FORMAT_REJECTED';
  return `UNKNOWN_MESSAGE_SHA256:${sha256(message)}`;
}
function safeSignupAlertDetail(value){
  return String(value??'').trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[REDACTED_EMAIL]')
    .replace(/https?:\/\/\S+/gi,'[REDACTED_URL]')
    .replace(/\b(?:sbp|sb_secret|eyJ)[A-Za-z0-9._-]+\b/g,'[REDACTED]')
    .replace(/\s+/g,' ')
    .slice(0,180)||'EMPTY';
}

export function createReleaseCriticalRun(runId=randomUUID()){
  if(!/^[0-9a-f-]{36}$/i.test(runId))fail('RELEASE_CRITICAL_RUN_ID_INVALID');
  return {runId,marker:'[RELEASE QA 20260811]',emailMarker:`garage-link-${runId.toLowerCase()}`};
}
export function releaseCriticalSyntheticPassword(emailMarker){
  if(!/^garage-link-[a-z0-9-]{8,}$/i.test(emailMarker))fail('RELEASE_CRITICAL_MARKER_INVALID');
  return `GL-${emailMarker}-8!`;
}
export function validateReleaseCriticalProvenance(value,baseUrl){
  try {
    const base=new URL(baseUrl); const deployment=new URL(value?.deployment_url);
    if(value?.project_id!==STAGING_PROJECT_ID||value?.project_id===PRODUCTION_PROJECT_ID||!/^dpl_[A-Za-z0-9]+$/.test(value?.deployment_id??'')||!/^[0-9a-f]{40}$/i.test(value?.git_commit_sha??'')||typeof value?.git_commit_ref!=='string'||!value.git_commit_ref||!['preview','staging'].includes(String(value?.environment).toLowerCase())||base.hostname.endsWith('.garage-link.tech')||deployment.hostname.endsWith('.garage-link.tech')||base.origin!==deployment.origin||!base.hostname.endsWith('.vercel.app'))fail('RELEASE_CRITICAL_PROVENANCE_DENIED');
    return {projectId:value.project_id,deploymentId:value.deployment_id,sourceSha:value.git_commit_sha.toLowerCase(),branch:value.git_commit_ref,deploymentUrl:deployment.origin};
  } catch(error) { if(String(error?.message)==='RELEASE_CRITICAL_PROVENANCE_DENIED')throw error; fail('RELEASE_CRITICAL_PROVENANCE_DENIED'); }
}

async function clickAndWait(page,locator,url){await Promise.all([page.waitForURL(url,{timeout:30_000}),locator.click()])}
async function signupSubmitOutcome(page){
  const formAlert=page.locator('form').getByRole('alert');
  try {
    return await Promise.any([
      page.getByRole('status').waitFor({state:'visible',timeout:30_000}).then(()=>({kind:'confirmation'})),
      formAlert.waitFor({state:'visible',timeout:30_000}).then(()=>({kind:'alert'})),
      page.waitForURL(/\/onboarding(?:\?|$)/,{timeout:30_000}).then(()=>({kind:'onboarding'})),
    ]);
  } catch {fail('RELEASE_CRITICAL_SIGNUP_OUTCOME_UNOBSERVED')}
}
async function completeSecurityOtp(page){
  if(!/\/security\/email-otp/.test(page.url()))return;
  const preview=page.getByText(/Preview QA確認コード:\s*\d{6}/);
  await preview.waitFor({state:'visible',timeout:30_000});
  const otp=(await preview.textContent())?.match(/\b(\d{6})\b/)?.[1];
  if(!otp)fail('RELEASE_CRITICAL_SECURITY_OTP_UNAVAILABLE');
  await page.getByLabel('メールに届いた6桁コード').fill(otp);
  await clickAndWait(page,page.getByRole('button',{name:'この端末を承認する'}),/\/(signup\?resume=1|onboarding|dashboard)/);
}
async function login(page,email,password,nextPattern){
  await page.getByLabel('メールアドレス').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await page.waitForURL(/\/(signup\?resume=1|dashboard|security\/email-otp)/,{timeout:30_000});
  await completeSecurityOtp(page);
  await page.waitForURL(nextPattern,{timeout:30_000});
}
async function onboarding(page,marker){
  await page.getByLabel('法人名').fill(`${marker} 株式会社`);
  await page.getByLabel('店舗名').fill(`${marker} 店舗`);
  await page.getByLabel('代表者名').fill(`${marker} Owner`);
  await page.getByRole('button',{name:'保存して次へ'}).click();
  await page.getByRole('button',{name:'次へ'}).click();
  await page.getByRole('button',{name:'次へ'}).click();
  await clickAndWait(page,page.getByRole('button',{name:'設定を完了してダッシュボードへ進む'}),/\/dashboard/);
}
async function activeOwner(admin,userId){
  const {data,error}=await admin.from('memberships').select('id,tenant_id,store_id,tenants!inner(name)').eq('user_id',userId).eq('role','owner').maybeSingle();
  if(error||!data?.id||!data.tenant_id||!data.store_id||typeof data.tenants?.name!=='string')fail('RELEASE_CRITICAL_FIXTURE_DISCOVERY_FAILED');
  return {membershipId:data.id,tenantId:data.tenant_id,storeId:data.store_id,tenantName:data.tenants.name};
}
async function maybeActiveOwner(admin,userId){
  const {data,error}=await admin.from('memberships').select('id,tenant_id,store_id,tenants!inner(name)').eq('user_id',userId).eq('role','owner').maybeSingle();
  if(error)fail('RELEASE_CRITICAL_FIXTURE_DISCOVERY_FAILED');
  if(!data?.id||!data.tenant_id||!data.store_id||typeof data.tenants?.name!=='string')return null;
  return {membershipId:data.id,tenantId:data.tenant_id,storeId:data.store_id,tenantName:data.tenants.name};
}
async function findUser(admin,email){
  for(let page=1;page<=10;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)fail(`RELEASE_CRITICAL_AUTH_LOOKUP:${error.status??0}`);const user=data?.users?.find(item=>item.email?.toLowerCase()===email.toLowerCase());if(user)return user;if((data?.users?.length??0)<1000)break;}
  fail('RELEASE_CRITICAL_AUTH_USER_NOT_FOUND');
}
async function maybeFindUser(admin,email){
  for(let page=1;page<=10;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)fail(`RELEASE_CRITICAL_AUTH_LOOKUP:${error.status??0}`);const user=data?.users?.find(item=>item.email?.toLowerCase()===email.toLowerCase());if(user)return user;if((data?.users?.length??0)<1000)break;}
  return null;
}
async function findKnownPartialUser(admin){
  const matches=[];
  for(let page=1;page<=10;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)fail(`RELEASE_CRITICAL_PARTIAL_AUTH_LOOKUP:${error.status??0}`);matches.push(...(data?.users??[]).filter(item=>item.email?.toLowerCase().includes(`+${PARTIAL_MARKER}@`)));if((data?.users?.length??0)<1000)break;}
  if(matches.length>1)fail(`RELEASE_CRITICAL_PARTIAL_FIXTURE_CARDINALITY:${matches.length}`);
  return matches[0]??null;
}
export function lifecycle(admin,run,provenance){
  const rpc=async(name,args={})=>{const {data,error}=await admin.rpc(name,args);if(error)fail(`RELEASE_CRITICAL_LIFECYCLE_${name}:${error.code??'FAILED'}`);return data};
  const transition=(expected,next,action,detail={})=>rpc('qa_lifecycle_transition',{p_run_id:run.runId,p_expected_state:expected,p_next_state:next,p_next_action:action,p_failure_class:null,p_safe_detail:detail});
  const evidence=(kind,detail={})=>{const payload={run_id:run.runId,source_sha:provenance.sourceSha,deployment_id:provenance.deploymentId,actor:'release-critical-gha',residual_count:0,observed_at:new Date().toISOString(),...detail};return rpc('qa_lifecycle_record_verified_evidence',{p_run_id:run.runId,p_evidence_kind:kind,p_observation:{...payload,proof_sha:sha256(JSON.stringify(payload))}})};
  return {rpc,transition,evidence,status:()=>rpc('qa_lifecycle_status',{p_run_id:run.runId})};
}
export async function beginLifecycle(life,run,provenance){
  await life.rpc('qa_lifecycle_register_run',{p_run_id:run.runId,p_purpose:'release-critical-acquisition',p_source_sha:provenance.sourceSha,p_deployment_id:provenance.deploymentId,p_operator_reference:'release-critical-gha',p_cleanup_deadline:new Date(Date.now()+60*60_000).toISOString()});
  await life.transition('CREATED','PREFLIGHT_RUNNING','preflight-evidence');
  await life.transition('PREFLIGHT_RUNNING','PREFLIGHT_READY','signup-lifecycle-registered',{baseline_evidence:'31406030364'});
  await life.transition('PREFLIGHT_READY','PROVISIONING','adopt-signup-fixture');
}
export async function adoptLifecycleFixture(life,run,fixture){
  await life.rpc('qa_lifecycle_adopt_fixture',{p_run_id:run.runId,p_tenant_id:fixture.tenantId,p_expected_tenant_name:fixture.tenantName,p_store_id:fixture.storeId,p_user_id:fixture.userId,p_membership_id:fixture.membershipId,p_fixture_type:'release',p_marker:run.marker,p_expires_at:new Date(Date.now()+60*60_000).toISOString()});
  await life.transition('PROVISIONING','PROVISIONED','auth');
  await life.transition('PROVISIONED','AUTH_READY','run');
  await life.transition('AUTH_READY','TEST_RUNNING','run');
}
async function pollCallbackEvidence({admin,userId,run,baseUrl,purpose,requireStoreCreated=false,requirePasswordUpdate=false,timeoutMs=CHECKPOINT_TIMEOUT_MS,intervalMs=5_000,sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))}){
  const expectedNext=purpose==='signup'?`/signup?resume=1&qa_run=${run.runId}`:`/auth/reset-password?qa_run=${run.runId}`;
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const {data,error}=await admin.auth.admin.getUserById(userId); const evidence=data?.user?.app_metadata?.release_qa_callback?.[purpose];
    if(error)fail(`RELEASE_CRITICAL_CALLBACK_EVIDENCE_READ_FAILED:${error.status??0}`);
    const callback=evidence?.callback; const arrival=evidence?.arrival; const storeCreated=evidence?.store_created; const passwordUpdated=evidence?.password_updated;
    const valid=value=>value&&value.next_path===expectedNext&&value.origin===new URL(baseUrl).origin&&typeof value.recorded_at==='string';
    if(valid(callback)&&valid(arrival)&&(!requireStoreCreated||valid(storeCreated))&&(!requirePasswordUpdate||valid(passwordUpdated)))return {state:'RELEASE_CRITICAL_CALLBACK_EVIDENCE_PASS',purpose,run_marker:run.emailMarker};
    await sleep(intervalMs);
  }
  fail(`RELEASE_CRITICAL_CALLBACK_EVIDENCE_TIMEOUT:${purpose}`);
}
export async function cleanupLifecycle(life,admin,userId,runId){
  let current=await life.status();
  if(current.state==='TEST_RUNNING')await life.transition('TEST_RUNNING','TEST_COMPLETE','teardown-dry-run');
  current=await life.status();
  if(current.state==='TEST_COMPLETE')await life.transition('TEST_COMPLETE','TEARDOWN_DRY_RUN','teardown-dry-run');
  current=await life.status();
  if(current.state==='TEARDOWN_DRY_RUN'){
    const dry=await life.rpc('qa_lifecycle_teardown',{p_run_id:current.run_id,p_dry_run:true});
    if(!dry.ready)fail('RELEASE_CRITICAL_TEARDOWN_NOT_READY');
    await life.transition('TEARDOWN_DRY_RUN','TEARDOWN_READY','teardown');
  }
  current=await life.status();
  if(current.state==='TEARDOWN_READY')await life.transition('TEARDOWN_READY','TEARING_DOWN','teardown');
  current=await life.status();
  if(current.state==='TEARING_DOWN')await life.rpc('qa_lifecycle_teardown',{p_run_id:current.run_id,p_dry_run:false});
  current=await life.status();
  if(current.state==='DB_CLEANED'){
    const {error}=await admin.auth.admin.deleteUser(userId,false); if(error&&error.status!==404)fail(`RELEASE_CRITICAL_AUTH_DELETE:${error.status??0}`);
    const {data,error:lookupError}=await admin.auth.admin.getUserById(userId); if(lookupError&&lookupError.status!==404)fail('RELEASE_CRITICAL_AUTH_LOOKUP_AFTER_DELETE'); if(data?.user)fail('RELEASE_CRITICAL_AUTH_RESIDUAL');
    await life.rpc('qa_lifecycle_record_auth_evidence',{p_run_id:current.run_id,p_user_id:userId});
    await life.rpc('qa_lifecycle_advance_cleanup',{p_run_id:current.run_id,p_expected_state:'DB_CLEANED',p_next_state:'AUTH_CLEANED',p_next_action:'storage-clean'});
  }
  current=await life.status();
  if(current.state==='AUTH_CLEANED'){
    const {data:buckets,error:bucketsError}=await admin.storage.listBuckets(); if(bucketsError)fail('RELEASE_CRITICAL_STORAGE_LIST_FAILED');
    let pathCount=0;
    for(const bucket of buckets??[]){const {data,error}=await admin.storage.from(bucket.name).list(`qa/${runId}`,{limit:100});if(error)fail('RELEASE_CRITICAL_STORAGE_PATH_LIST_FAILED');pathCount+=(data??[]).length;}
    if(pathCount!==0)fail('RELEASE_CRITICAL_STORAGE_RESIDUAL');
    await life.evidence('STORAGE',{bucket_count:(buckets??[]).length,path_count:pathCount});
    await life.rpc('qa_lifecycle_advance_cleanup',{p_run_id:current.run_id,p_expected_state:'AUTH_CLEANED',p_next_state:'STORAGE_CLEANED',p_next_action:'artifact-clean'});
  }
  current=await life.status();
  if(current.state==='STORAGE_CLEANED'){
    await life.evidence('ARTIFACT',{artifact_count:0});
    await life.rpc('qa_lifecycle_advance_cleanup',{p_run_id:current.run_id,p_expected_state:'STORAGE_CLEANED',p_next_state:'ARTIFACTS_CLEANED',p_next_action:'verify-clean'});
  }
  current=await life.status();
  if(current.state==='ARTIFACTS_CLEANED'){
    await life.rpc('qa_lifecycle_record_public_marker_evidence',{p_run_id:current.run_id});
    const verified=await life.rpc('qa_lifecycle_verify_clean',{p_run_id:current.run_id,p_finalize:true}); if(!verified.clean)fail('RELEASE_CRITICAL_FIXTURE_RESIDUAL');
    return life.rpc('qa_lifecycle_finalize',{p_run_id:current.run_id});
  }
  return current;
}
async function recoverKnownPartialFixture(admin,provenance){
  const user=await findKnownPartialUser(admin); if(!user)return {state:'RELEASE_CRITICAL_PARTIAL_FIXTURE_ABSENT'};
  const owner=await activeOwner(admin,user.id);
  const marker=/^\[RELEASE QA \d{8}\]/.exec(owner.tenantName)?.[0];
  if(!marker)fail('RELEASE_CRITICAL_PARTIAL_MARKER_UNPROVEN');
  const partialRunId=PARTIAL_MARKER.replace(/^garage-link-/,'');
  const run={runId:partialRunId,marker,emailMarker:PARTIAL_MARKER};
  const statusLife=lifecycle(admin,run,provenance); const existing=await statusLife.status();
  if(!/^[0-9a-f]{40}$/i.test(existing.source_sha??'')||!/^dpl_[A-Za-z0-9]+$/.test(existing.deployment_id??''))fail('RELEASE_CRITICAL_PARTIAL_PROVENANCE_UNPROVEN');
  const life=lifecycle(admin,run,{sourceSha:existing.source_sha,deploymentId:existing.deployment_id});
  if(existing.state!=='PROVISIONING')fail(`RELEASE_CRITICAL_PARTIAL_LIFECYCLE_STATE:${existing.state}`);
  await adoptLifecycleFixture(life,run,{...owner,userId:user.id});
  const final=await cleanupLifecycle(life,admin,user.id,run.runId);
  const [membership,store,tenant,subscription,auth]=await Promise.all([
    admin.from('memberships').select('id',{count:'exact',head:true}).eq('user_id',user.id),
    admin.from('stores').select('id',{count:'exact',head:true}).eq('id',owner.storeId),
    admin.from('tenants').select('id',{count:'exact',head:true}).eq('id',owner.tenantId),
    admin.from('company_subscriptions').select('id',{count:'exact',head:true}).or(`tenant_id.eq.${owner.tenantId},company_id.eq.${owner.storeId}`),
    admin.auth.admin.getUserById(user.id),
  ]);
  if(membership.error||store.error||tenant.error||subscription.error||(auth.error&&auth.error.status!==404))fail('RELEASE_CRITICAL_PARTIAL_READBACK_FAILED');
  const {data:buckets,error:bucketsError}=await admin.storage.listBuckets(); if(bucketsError)fail('RELEASE_CRITICAL_PARTIAL_STORAGE_LIST_FAILED'); let storage=0;
  for(const bucket of buckets??[]){const {data,error}=await admin.storage.from(bucket.name).list(`qa/${partialRunId}`,{limit:100});if(error)fail('RELEASE_CRITICAL_PARTIAL_STORAGE_LIST_FAILED');storage+=(data??[]).length;}
  const residual={auth_user:auth.data?.user?1:0,membership:membership.count??0,store:store.count??0,tenant:tenant.count??0,subscription:subscription.count??0,storage,artifact:0};
  if(final.state!=='COMPLETE'||Object.values(residual).some(value=>value!==0))fail('RELEASE_CRITICAL_PARTIAL_FIXTURE_RESIDUAL');
  emit({state:'RELEASE_CRITICAL_PARTIAL_FIXTURE_CLEAN',marker:PARTIAL_MARKER,residual,qa_lifecycle:final.state});
  return final;
}
async function runMobileSmoke(baseUrl,browserType,name){
  const browser=await browserType.launch({headless:true});
  try {const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true});const page=await context.newPage();await page.goto(baseUrl,{waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'無料で始める'}).first().click();await page.waitForURL(/\/signup/,{timeout:30_000});await context.close();emit({journey:'J10',browser:name,status:'PASS'});} finally {await browser.close();}
}
async function main(){
  const eventPath=required('GITHUB_EVENT_PATH');
  const baseUrl=await releaseCriticalBaseUrl(eventPath);
  const supabaseUrl=required('E2E_TEST_SUPABASE_URL');
  const serviceRole=required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY');
  const manualBase=await manualGmailWorkflowInput(eventPath);
  const expectedCandidateSha=String(process.env.RELEASE_CRITICAL_CANDIDATE_SHA??'').trim().toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(expectedCandidateSha))fail('RELEASE_CRITICAL_CANDIDATE_SHA_INPUT_INVALID');
  if(!new URL(supabaseUrl).hostname.startsWith(`${STAGING_REF}.`)||new URL(baseUrl).hostname.endsWith('.garage-link.tech'))fail('RELEASE_CRITICAL_STAGING_BOUNDARY_DENIED');
  const provenanceResponse=await fetch(new URL('/api/qa/provenance',baseUrl),{redirect:'manual',cache:'no-store'}); if(!provenanceResponse.ok||provenanceResponse.headers.has('location'))fail('RELEASE_CRITICAL_PROVENANCE_UNREACHED');
  const provenance=validateReleaseCriticalProvenance(await provenanceResponse.json(),baseUrl); if(provenance.sourceSha!==expectedCandidateSha)fail('RELEASE_CRITICAL_CANDIDATE_SHA_MISMATCH');
  const admin=createClient(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  await recoverKnownPartialFixture(admin,provenance);
  const run=createReleaseCriticalRun(); const session=createManualGmailSession(manualBase,run.emailMarker); const initialPassword=releaseCriticalSyntheticPassword(run.emailMarker); const resetPassword='GL-Release-Reset-8!';
  let browser; let context; let page; let user; let life; let adopted=false; const results={};
  try {
    life=lifecycle(admin,run,provenance); await beginLifecycle(life,run,provenance);
    browser=await chromium.launch({headless:true}); context=await browser.newContext(); page=await context.newPage();
    await page.goto(`${baseUrl}${baseUrl.includes('?')?'&':'?'}qa_run=${encodeURIComponent(run.runId)}`,{waitUntil:'domcontentloaded'});
    await clickAndWait(page,page.getByRole('link',{name:'無料で始める'}).first(),/\/signup/);
    const fillSignup=async(password)=>{await page.getByLabel('店舗名').fill(`${run.marker} Signup`);await page.getByLabel('担当者名').fill(`${run.marker} Owner`);await page.getByLabel('メールアドレス').fill(session.emailAddress);await page.locator('#password').fill(password);await page.locator('#passwordConfirmation').fill(password);await page.getByRole('checkbox').check();};
    await fillSignup(initialPassword); await page.getByRole('button',{name:'無料でアカウントを作成する'}).click();
    const signupOutcome=await signupSubmitOutcome(page);
    if(signupOutcome.kind==='alert'){
      const alertText=await page.locator('form').getByRole('alert').textContent();
      fail(`RELEASE_CRITICAL_SIGNUP_SUBMIT_ALERT:${signupAlertClassification(alertText)}:${safeSignupAlertDetail(alertText)}`);
    }
    if(signupOutcome.kind==='onboarding'){
      user=await findUser(admin,session.emailAddress);
      const owner=await activeOwner(admin,user.id);
      await adoptLifecycleFixture(life,run,{...owner,userId:user.id});
      adopted=true;
      fail('RELEASE_CRITICAL_SIGNUP_AUTO_CONFIRMED');
    }
    if(!/確認メールを送信しました/.test(await page.getByRole('status').textContent()??''))fail('RELEASE_CRITICAL_CONFIRMATION_REQUIRED_NOT_PROVEN');
    user=await findUser(admin,session.emailAddress); results.J2='CHECKPOINT'; emit({...manualGmailCheckpoint(session,'signup'),operator_action:'Open the matching Staging-only Gmail confirmation message, verify its redirect target is the Staging HTTPS origin, click it, then keep Gmail open. A reset message will follow; click it and set the synthetic password GL-Release-Reset-8!.'});
    await pollManualGmailConfirmation({admin,userId:user.id,session,purpose:'signup',timeoutMs:CHECKPOINT_TIMEOUT_MS});
    await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'signup'});
    await page.getByRole('link',{name:'ログイン',exact:true}).last().click(); await page.waitForURL(/\/login/,{timeout:30_000}); await login(page,session.emailAddress,initialPassword,/\/signup\?resume=1/);
    await page.getByLabel('店舗名').fill(`${run.marker} 店舗`); await page.getByLabel('担当者名').fill(`${run.marker} Owner`); await page.getByRole('button',{name:'店舗を作成して次へ'}).click(); await page.waitForURL(/\/(onboarding|security\/email-otp)/,{timeout:30_000}); await completeSecurityOtp(page); await page.waitForURL(/\/onboarding/,{timeout:30_000}); await onboarding(page,run.marker); results.J1='PASS';
    await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'signup',requireStoreCreated:true});
    const owner=await activeOwner(admin,user.id); if(!owner.tenantName.startsWith(run.marker))fail('RELEASE_CRITICAL_MARKER_TENANT_MISMATCH');
    await adoptLifecycleFixture(life,run,{...owner,userId:user.id}); adopted=true; results.J2='PASS';
    const invalid=await context.newPage(); await invalid.goto(baseUrl,{waitUntil:'domcontentloaded'}); await clickAndWait(invalid,invalid.getByRole('link',{name:'無料で始める'}).first(),/\/signup/);
    // The separate page keeps the main owner session intact; fill by concrete UI locators.
    const invalidAlert=invalid.locator('form').getByRole('alert');
    await invalid.getByLabel('店舗名').fill(`${run.marker} Reject`); await invalid.getByLabel('担当者名').fill(`${run.marker} Reject`); await invalid.getByLabel('メールアドレス').fill(session.emailAddress); await invalid.locator('#password').fill('short1'); await invalid.locator('#passwordConfirmation').fill('short1'); await invalid.getByRole('checkbox').check(); await invalid.getByRole('button',{name:'無料でアカウントを作成する'}).click(); await invalidAlert.waitFor(); if(!/8文字以上/.test(await invalidAlert.textContent()??''))fail('RELEASE_CRITICAL_PASSWORD_6_NOT_REJECTED'); await invalid.locator('#password').fill('short12'); await invalid.locator('#passwordConfirmation').fill('short12'); await invalid.getByRole('button',{name:'無料でアカウントを作成する'}).click(); if(!/8文字以上/.test(await invalidAlert.textContent()??''))fail('RELEASE_CRITICAL_PASSWORD_7_NOT_REJECTED'); await invalid.close(); results.J3='PASS';
    await page.getByRole('link',{name:'ログアウト'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); await login(page,session.emailAddress,initialPassword,/\/dashboard/); await page.getByRole('link',{name:'ログアウト'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); await page.getByRole('link',{name:'忘れた方はこちら'}).click(); await page.waitForURL(/\/forgot-password/,{timeout:30_000}); await page.getByLabel('メールアドレス').fill(session.emailAddress); await page.getByRole('button',{name:'メールを送る'}).click(); await page.getByText('再設定メールを送りました。').waitFor({timeout:30_000}); emit({...manualGmailCheckpoint(session,'recovery'),operator_action:'Use the already-open Staging-only Gmail session: click the matching reset link and set the synthetic password GL-Release-Reset-8!.'}); await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'recovery',requirePasswordUpdate:true}); await page.getByRole('link',{name:'ログインへ戻る'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); await login(page,session.emailAddress,resetPassword,/\/dashboard/); results.J4='PASS';
    for(const label of ['車両','商談','顧客','メニュー']){await page.getByRole('link',{name:label,exact:true}).first().click();await page.waitForTimeout(250);} results.J5='PASS';
    await page.getByRole('link',{name:'顧客',exact:true}).first().click(); await page.getByRole('link',{name:'顧客を登録'}).click(); await page.getByLabel('顧客/会社名').fill(`${run.marker} First Value`); await page.getByRole('button',{name:'顧客を登録する'}).click(); await page.waitForURL(/\/customers/,{timeout:30_000}); await page.getByText(`${run.marker} First Value`).waitFor({timeout:30_000}); results.J6='PASS';
    await page.getByRole('link',{name:'メニュー',exact:true}).first().click(); await page.getByRole('link',{name:'プラン・契約',exact:true}).click(); await page.getByText('Free',{exact:true}).first().waitFor(); await page.getByText('無料プラン',{exact:true}).waitFor(); if(await page.getByRole('button',{name:'支払方法・契約を管理'}).count())fail('RELEASE_CRITICAL_FREE_CARDLESS_FAILED'); results.J7='PASS';
    let deferredFailure=null;
    try {
      const inquiry=await context.newPage(); await inquiry.goto(baseUrl,{waitUntil:'domcontentloaded'}); await inquiry.keyboard.press('End');
      await clickAndWait(inquiry,inquiry.getByRole('link',{name:'ヘルプ',exact:true}),/\/help/);
      const formalContact=inquiry.getByRole('link',{name:'正式窓口へ問い合わせる'}); const href=await formalContact.getAttribute('href');
      if(!href?.startsWith('mailto:'))fail('RELEASE_CRITICAL_INQUIRY_ROUTE_UNAVAILABLE'); await formalContact.click(); await inquiry.close(); results.J8='PASS';
    } catch(error) {results.J8=`FAIL:${safeErrorCode(error)}`;deferredFailure=error;emit({journey:'J8',status:'FAIL',code:safeErrorCode(error)});}
    if(!(await page.getByText('提供準備中').count())||await page.getByText('L-LINK 利用可').count())fail('RELEASE_CRITICAL_LLINK_BOUNDARY_FAILED'); results.J9='PASS';
    await runMobileSmoke(baseUrl,chromium,'chromium-mobile'); await runMobileSmoke(baseUrl,webkit,'webkit-mobile'); results.J10='PASS';
    if(deferredFailure)throw deferredFailure;
    emit({state:'RELEASE_CRITICAL_JOURNEYS_PASS',journeys:results,run_marker:run.emailMarker});
  } finally {
    try {
      if(!adopted&&life){
        user??=await maybeFindUser(admin,session.emailAddress);
        if(user?.id){
          const owner=await maybeActiveOwner(admin,user.id);
          if(owner){await adoptLifecycleFixture(life,run,{...owner,userId:user.id}); adopted=true;}
          else {const {error}=await admin.auth.admin.deleteUser(user.id,false);if(error&&error.status!==404)fail(`RELEASE_CRITICAL_EARLY_AUTH_DELETE:${error.status??0}`);await life.rpc('qa_lifecycle_abort_clean',{p_run_id:run.runId,p_reason:'early_auth_cleanup'});}
        } else {
          await life.rpc('qa_lifecycle_abort_clean',{p_run_id:run.runId,p_reason:'pre_auth_cleanup'});
        }
      }
      if(adopted)await cleanupLifecycle(life,admin,user?.id,run.runId);
    } finally {await context?.close();await browser?.close();}
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{emit({ok:false,state:'RELEASE_CRITICAL_JOURNEY_FAILED',code:safeErrorCode(error)});process.exitCode=1;});
