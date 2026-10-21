#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { chromium, webkit } from '@playwright/test';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONTRACT,armResponseWait,assertBypassAbsent,selectGeneratedBypass,assertCanonicalOrigin,assertProvenance,assertRunId,classifyFailure,coded,fixtureIdentity,keychainDelete,keychainRead,keychainWrite,nextAfter,parseArgs,qaEmail,randomPassword,removeCheckpoint,safeError,sha256,validateServiceKey,vercelRequestUrl,writeCheckpoint } from './lifecycle-core.mjs';

const args=parseArgs(process.argv.slice(2));
const root=resolve(import.meta.dirname,'../../../..');
const runId=assertRunId(args.run_id);
const sourceSha=args.source_sha;
const deploymentId=args.deployment_id;
const branch=args.branch;
const deploymentUrl=args.deployment_url;
const purpose=args.purpose;
const operatorReference=args.operator_reference;
const bypassService=`kannagi.garage-link.qa-bypass.${runId}`;
const storageStatePath=resolve(root,'.qa-runs',`${runId}.storage-state.json`);
assertProvenance({sourceSha,branch,vercelTeamId:args.vercel_team_id,vercelProjectId:args.vercel_project_id,deploymentId,deploymentUrl,supabaseProjectRef:args.supabase_project_ref,runId,canonical:CONTRACT.canonical,purpose});
let serviceKey='',temporaryPassword='',bypassSecret='';

function serviceClient(){if(!serviceKey){serviceKey=keychainRead(CONTRACT.keychainService);validateServiceKey(serviceKey)}return createClient(CONTRACT.supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})}
async function rpc(name,values={}){const{data,error}=await serviceClient().rpc(name,values);if(error)throw coded(classifyFailure(error),`${name}:${error.code??'RPC_FAILED'}:${error.message}`);return data}
async function status(){return rpc('qa_lifecycle_status',{p_run_id:runId})}
async function transition(expected,next,nextAction,failureClass=null,detail={}){return rpc('qa_lifecycle_transition',{p_run_id:runId,p_expected_state:expected,p_next_state:next,p_next_action:nextAction,p_failure_class:failureClass,p_safe_detail:detail})}
async function verifiedEvidence(kind,detail){const observedAt=new Date().toISOString();const payload={run_id:runId,source_sha:sourceSha,deployment_id:deploymentId,actor:operatorReference,residual_count:0,observed_at:observedAt,...detail};return rpc('qa_lifecycle_record_verified_evidence',{p_run_id:runId,p_evidence_kind:kind,p_observation:{...payload,proof_sha:sha256(JSON.stringify(payload))}})}
async function advanceCleanup(expected,next,action){return rpc('qa_lifecycle_advance_cleanup',{p_run_id:runId,p_expected_state:expected,p_next_state:next,p_next_action:action})}
async function registerRun(){return rpc('qa_lifecycle_register_run',{p_run_id:runId,p_purpose:purpose,p_source_sha:sourceSha,p_deployment_id:deploymentId,p_operator_reference:operatorReference,p_cleanup_deadline:new Date(Date.now()+48*60*60*1000).toISOString()})}
const integrationPurpose='garage-link-l-link-integration-acceptance';
async function provisionLineLinkIntegration(fixture){if(purpose!==integrationPurpose)return null;if(!fixture||fixture.fixture_type!=='canary'||!fixture.store_id)throw coded('FIXTURE_LIFECYCLE','L_LINK_INTEGRATION_CANARY_REQUIRED');const keyId=args.line_link_key_id;if(typeof keyId!=='string'||!/^[a-z0-9_-]{1,32}$/i.test(keyId))throw coded('FIXTURE_LIFECYCLE','L_LINK_INTEGRATION_KEY_ID_REQUIRED');const result=await rpc('qa_l_link_integration_provision',{p_run_id:runId,p_key_id:keyId});if(result?.state!=='PROVISIONED'||result?.key_id!==keyId||!Array.isArray(result?.event_ids)||result.event_ids.length!==2)throw coded('FIXTURE_LIFECYCLE','L_LINK_INTEGRATION_PROVISION_READBACK_MISMATCH');await writeCheckpoint(root,runId,{state:'PROVISIONED',next_action:'auth',line_link_integration:{state:result.state,store_id:result.store_id,event_ids:result.event_ids,key_id:result.key_id}});return result}
async function resetLineLinkIntegrationEvent(){if(purpose!==integrationPurpose)throw coded('SECURITY_BOUNDARY','L_LINK_INTEGRATION_PURPOSE_REQUIRED');if(typeof args.event_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.event_id))throw coded('FIXTURE_LIFECYCLE','L_LINK_INTEGRATION_EVENT_ID_REQUIRED');return rpc('qa_l_link_integration_reset_event',{p_run_id:runId,p_event_id:args.event_id})}
async function cleanupLineLinkIntegration(){if(purpose!==integrationPurpose)return null;const before=await rpc('qa_l_link_integration_verify_clean',{p_run_id:runId});if(before?.clean===true)return{idempotent:true,verify:before};const dryRun=await rpc('qa_l_link_integration_dry_run',{p_run_id:runId});if(dryRun?.ready!==true)throw coded('FIXTURE_LIFECYCLE','L_LINK_INTEGRATION_CLEANUP_DRY_RUN_BLOCKED');const cleanup=await rpc('qa_l_link_integration_cleanup',{p_run_id:runId});const clean=await rpc('qa_l_link_integration_verify_clean',{p_run_id:runId});if(clean?.clean!==true)throw coded('FIXTURE_LIFECYCLE','L_LINK_INTEGRATION_ZERO_RESIDUAL_REQUIRED');return{dry_run:dryRun,cleanup,verify:clean}}

async function vercelToken(){const token=process.env.VERCEL_TOKEN;if(!token)throw coded('VERCEL_PROTECTION','VERCEL_TOKEN_REQUIRED');return token}
async function vercelApi(path,init={}){const response=await fetch(vercelRequestUrl(path,args.vercel_token_scope??'account'),{...init,headers:{authorization:`Bearer ${await vercelToken()}`,'content-type':'application/json',...(init.headers??{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw coded('VERCEL_PROTECTION',`VERCEL_API_${response.status}:${body.error?.code??'FAILED'}`);return body}
async function ensureBypass(){
  try{bypassSecret=keychainRead(bypassService);return{reused:true}}catch{}
  const project=await vercelApi(`/v9/projects/${CONTRACT.vercelProjectId}`);
  if(project.id!==CONTRACT.vercelProjectId||project.accountId!==CONTRACT.vercelTeamId)throw coded('VERCEL_PROTECTION','BYPASS_PROJECT_IDENTITY_MISMATCH');
  const beforeKeys=new Set(Object.keys(project.protectionBypass??{}));
  const note=`GARAGE LINK QA ${runId}`;
  const recoverable=Object.entries(project.protectionBypass??{}).filter(([,value])=>value?.scope==='automation-bypass'&&value?.note===note);
  if(recoverable.length){
    bypassSecret=selectGeneratedBypass(project,new Set(),note);
    keychainWrite(bypassService,bypassSecret);
    return{reused:true,recovered_exact_run:true};
  }
  const result=await vercelApi(`/v1/projects/${CONTRACT.vercelProjectId}/protection-bypass`,{method:'PATCH',body:JSON.stringify({generate:{note}})});
  // The API generates a valid secret, including for OAuth/project-scoped tokens.
  // Only this run's newly created exact-note entry is adopted; other entries stay untouched.
  const created=Object.entries(result?.protectionBypass??{}).filter(([key,value])=>!beforeKeys.has(key)&&value?.scope==='automation-bypass'&&value?.note===note);
  try{
    bypassSecret=selectGeneratedBypass(result,beforeKeys,note);
    keychainWrite(bypassService,bypassSecret);
  }catch(error){
    for(const [owned] of created)await vercelApi(`/v1/projects/${CONTRACT.vercelProjectId}/protection-bypass`,{method:'PATCH',body:JSON.stringify({revoke:{secret:owned,regenerate:false}})});
    bypassSecret='';
    throw error;
  }
  return{reused:false};
}
async function revokeBypass(){
  try{if(!bypassSecret)bypassSecret=keychainRead(bypassService)}catch{}
  const project=await vercelApi(`/v9/projects/${CONTRACT.vercelProjectId}`);
  assertBypassAbsent(project,'');
  const note=`GARAGE LINK QA ${runId}`;
  const cached=bypassSecret;
  const cachedEntry=project.protectionBypass?.[cached];
  if(cachedEntry&&(cachedEntry.scope!=='automation-bypass'||cachedEntry.note!==note))throw coded('VERCEL_PROTECTION','BYPASS_OWNERSHIP_MISMATCH');
  const owned=Object.entries(project.protectionBypass??{}).filter(([,value])=>value?.scope==='automation-bypass'&&value?.note===note);
  for(const [secret] of owned){
    await vercelApi(`/v1/projects/${CONTRACT.vercelProjectId}/protection-bypass`,{method:'PATCH',body:JSON.stringify({revoke:{secret,regenerate:false}})});
  }
  const current=await vercelApi(`/v9/projects/${CONTRACT.vercelProjectId}`);
  assertBypassAbsent(current,cached,note);
  keychainDelete(bypassService);bypassSecret='';
  let keychainResidual=false;try{keychainRead(bypassService);keychainResidual=true}catch{}
  if(keychainResidual)throw coded('CREDENTIAL','KEYCHAIN_BYPASS_RESIDUAL');
  return{revoked:owned.length>0,verified_absent:true};
}
async function launchProbe(browserType,name){const browser=await browserType.launch({headless:true});try{const context=await browser.newContext({extraHTTPHeaders:{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie':'true'}});const page=await context.newPage();let blockedOriginRedirect=false;await page.route('**/*',async route=>{if(route.request().isNavigationRequest()){try{assertCanonicalOrigin(route.request().url())}catch{blockedOriginRedirect=true;await route.abort();return}}await route.continue()});let response;try{response=await page.goto(CONTRACT.canonical,{waitUntil:'domcontentloaded',timeout:30000})}catch(error){if(blockedOriginRedirect)throw coded('VERCEL_PROTECTION','CANONICAL_REDIRECT_ORIGIN_MISMATCH',error);throw error}if(blockedOriginRedirect)throw coded('VERCEL_PROTECTION','CANONICAL_REDIRECT_ORIGIN_MISMATCH');assertCanonicalOrigin(page.url());if(!response||response.status()>=400)throw coded('BROWSER',`${name.toUpperCase()}_CANONICAL_STATUS:${response?.status()??0}`);const result={browser:name,status:response.status(),origin:new URL(page.url()).origin};await context.close();return result}finally{await browser.close()}}

async function preflight(){
  await registerRun();let current=await status();if(current.state==='PREFLIGHT_READY')return current;if(current.state==='CREATED')await transition('CREATED','PREFLIGHT_RUNNING','preflight');current=await status();if(current.state!=='PREFLIGHT_RUNNING')throw coded('EXECUTION_LIFECYCLE',`PREFLIGHT_STATE:${current.state}`);
  serviceKey=keychainRead(CONTRACT.keychainService);const keyInfo=validateServiceKey(serviceKey);const{data:users,error:usersError}=await serviceClient().auth.admin.listUsers({page:1,perPage:1});if(usersError||!users)throw coded('CREDENTIAL',`ADMIN_LIST_USERS_FAILED:${usersError?.status??0}`);
  const project=await vercelApi(`/v9/projects/${CONTRACT.vercelProjectId}`);if(project.id!==CONTRACT.vercelProjectId||project.name!==CONTRACT.vercelProjectName||project.accountId!==CONTRACT.vercelTeamId)throw coded('VERCEL_PROTECTION','VERCEL_PROJECT_IDENTITY_MISMATCH');const deployment=await vercelApi(`/v13/deployments/${deploymentId}`);if(deployment.readyState!=='READY'||deployment.meta?.githubCommitSha!==sourceSha||deployment.meta?.githubCommitRef!==branch||deployment.projectId!==CONTRACT.vercelProjectId||deployment.url!==new URL(deploymentUrl).host)throw coded('VERCEL_PROTECTION','DEPLOYMENT_PROVENANCE_MISMATCH');await ensureBypass();const bypassResponse=await fetch(deploymentUrl,{headers:{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie':'true'},redirect:'manual'});if(bypassResponse.status>=400)throw coded('VERCEL_PROTECTION',`VERCEL_BYPASS_FAILED:${bypassResponse.status}`);
  const readiness=await rpc('qa_lifecycle_cleanup_readiness');if(!readiness.ready)throw coded('FIXTURE_LIFECYCLE','CLEANUP_READINESS_FAILED');const{data:entitlement,error:entitlementError}=await serviceClient().from('garage_plan_entitlements').select('plan,staff_limit,store_limit').eq('plan','free').single();if(entitlementError||entitlement.staff_limit<1||entitlement.store_limit<1)throw coded('CAPACITY','CANARY_CAPACITY_UNAVAILABLE');
  const browserResults=[await launchProbe(chromium,'chromium'),await launchProbe(webkit,'webkit')];await writeCheckpoint(root,runId,{state:'PREFLIGHT_READY',next_action:'provision',probes:{key_format:keyInfo.format,admin_api:'PASS',project_identity:'PASS',cleanup_readiness:'PASS',entitlement:'PASS',vercel_protection:project.ssoProtection?'PASS':'FAIL',bypass:'PASS',browser:browserResults}});return transition('PREFLIGHT_RUNNING','PREFLIGHT_READY','provision',null,{probe_count:8});
}
function fixtureFromArgs(existing=null){if(!args.adopt){if(existing)return{tenantId:existing.tenant_id,expectedTenantName:existing.expected_tenant_name,storeId:existing.store_id,membershipId:existing.membership_id,userId:existing.user_id,fixtureType:existing.fixture_type,marker:existing.marker,storeName:`${existing.marker} 受入監査店`};return fixtureIdentity(runId,args.fixture_type??'canary')}const value={tenantId:args.tenant_id,expectedTenantName:args.tenant_name,storeId:args.store_id,membershipId:args.membership_id,userId:args.user_id,fixtureType:args.fixture_type,marker:args.marker};for(const[key,id]of Object.entries(value))if(!id)throw coded('FIXTURE_LIFECYCLE',`ADOPT_FIELD_REQUIRED:${key}`);return value}
async function provision(){
  let current=await status();if(current.state==='PREFLIGHT_READY')await transition('PREFLIGHT_READY','PROVISIONING','provision');current=await status();if(current.state==='PROVISIONED'){await provisionLineLinkIntegration(current.fixtures[0]);return current}if(current.state!=='PROVISIONING')throw coded('EXECUTION_LIFECYCLE',`PROVISION_STATE:${current.state}`);const f=fixtureFromArgs(current.fixtures[0]);
  if(args.adopt){await rpc('qa_lifecycle_adopt_fixture',{p_run_id:runId,p_tenant_id:f.tenantId,p_expected_tenant_name:f.expectedTenantName,p_store_id:f.storeId,p_user_id:f.userId,p_membership_id:f.membershipId,p_fixture_type:f.fixtureType,p_marker:f.marker,p_expires_at:new Date(Date.now()+24*60*60*1000).toISOString()});await writeCheckpoint(root,runId,{state:'PROVISIONED',next_action:'auth',adopted:true});return transition('PROVISIONING','PROVISIONED','auth',null,{adopted_residual:true})}
  temporaryPassword=randomPassword();const email=qaEmail(runId);let userId;const{data:listed}=await serviceClient().auth.admin.listUsers({page:1,perPage:1000});const existing=listed?.users?.find(user=>user.email===email);if(existing){userId=existing.id;const{error}=await serviceClient().auth.admin.updateUserById(userId,{password:temporaryPassword,email_confirm:true});if(error)throw coded('AUTHENTICATION',`CANARY_PASSWORD_ROTATE_FAILED:${error.status??0}`)}else{const{data,error}=await serviceClient().auth.admin.createUser({email,password:temporaryPassword,email_confirm:true,app_metadata:{purpose:'qa-lifecycle-canary',run_id:runId}});if(error||!data.user)throw coded('AUTHENTICATION',`CANARY_AUTH_CREATE_FAILED:${error?.status??0}`);userId=data.user.id}f.userId=userId;
  await rpc('qa_lifecycle_register_fixture',{p_run_id:runId,p_tenant_id:f.tenantId,p_expected_tenant_name:f.expectedTenantName,p_store_id:f.storeId,p_user_id:userId,p_membership_id:f.membershipId,p_fixture_type:'canary',p_marker:f.marker,p_expires_at:new Date(Date.now()+24*60*60*1000).toISOString()});await rpc('qa_lifecycle_provision_canary',{p_run_id:runId});await writeCheckpoint(root,runId,{state:'PROVISIONED',next_action:'auth',fixture_type:'canary'});const transitioned=await transition('PROVISIONING','PROVISIONED','auth');const provisioned=await status();await provisionLineLinkIntegration(provisioned.fixtures[0]);return transitioned;
}
async function auth(){
  let current=await status();if(current.state==='AUTH_READY')return current;if(current.state!=='PROVISIONED')throw coded('EXECUTION_LIFECYCLE',`AUTH_STATE:${current.state}`);const f=current.fixtures[0];await provisionLineLinkIntegration(f);if(args.adopt||f.fixture_type!=='canary'){const{data,error}=await serviceClient().auth.admin.getUserById(f.user_id);if(error||!data.user?.deleted_at)throw coded('AUTHENTICATION','ADOPTED_AUTH_USER_NOT_SOFT_DELETED');return transition('PROVISIONED','AUTH_READY','run',null,{adopted_soft_deleted_auth_verified:true})}
  temporaryPassword=randomPassword();const email=qaEmail(runId);const{error:rotateError}=await serviceClient().auth.admin.updateUserById(f.user_id,{password:temporaryPassword,email_confirm:true});if(rotateError)throw coded('AUTHENTICATION',`PASSWORD_ROTATE_FAILED:${rotateError.status??0}`);if(!bypassSecret)bypassSecret=keychainRead(bypassService);const browser=await chromium.launch({headless:true});try{const context=await browser.newContext({baseURL:CONTRACT.canonical,extraHTTPHeaders:{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie':'true'}});const page=await context.newPage();await page.goto('/login?next=%2Fdashboard',{waitUntil:'domcontentloaded'}).catch(error=>{throw coded('AUTHENTICATION','LOGIN_PAGE_NOT_REACHED',error)});await page.locator('#email').fill(email).catch(error=>{throw coded('AUTHENTICATION','LOGIN_EMAIL_FIELD_MISSING',error)});await page.locator('#password').fill(temporaryPassword).catch(error=>{throw coded('AUTHENTICATION','LOGIN_PASSWORD_FIELD_MISSING',error)});const login=armResponseWait(page,'/api/auth/password-login','PASSWORD_LOGIN_RESPONSE_MISSING');await page.getByRole('button',{name:'ログイン',exact:true}).click().catch(error=>{throw coded('AUTHENTICATION','LOGIN_BUTTON_UNAVAILABLE',error)});const loginResponse=await login();if(loginResponse.status()!==200)throw coded('AUTHENTICATION',`PASSWORD_LOGIN_FAILED:${loginResponse.status()}`);await page.waitForURL(/\/dashboard(?:\?|$)/,{timeout:30000}).catch(error=>{throw coded('AUTHENTICATION','DASHBOARD_NOT_REACHED',error)});const cookies=await context.cookies(CONTRACT.canonical).catch(error=>{throw coded('AUTHENTICATION','COOKIE_READ_FAILED',error)});if(!cookies.some(cookie=>cookie.name.startsWith('sb-')))throw coded('AUTHENTICATION','TRUSTED_SESSION_COOKIE_MISSING');await context.storageState({path:storageStatePath}).catch(error=>{throw coded('AUTHENTICATION','STORAGE_STATE_WRITE_FAILED',error)});await context.close()}finally{await browser.close();temporaryPassword=''}await writeCheckpoint(root,runId,{state:'AUTH_READY',next_action:'run',password_login:'PASS',auth_contract:'password-session-dashboard',trusted_session:'PASS',dashboard:'PASS',storage_state_created:true});return transition('PROVISIONED','AUTH_READY','run',null,{auth_probe_count:3,auth_contract:'password-session-dashboard'});
}
async function verifySidebarLayout(){
  if(!bypassSecret)bypassSecret=keychainRead(bypassService);
  const browser=await chromium.launch({headless:true});
  const measurements=[];
  try{
    const context=await browser.newContext({baseURL:CONTRACT.canonical,storageState:storageStatePath,extraHTTPHeaders:{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie':'true'}});
    const page=await context.newPage();
    for(const width of [1024,1280,1440]){
      await page.setViewportSize({width,height:900});
      await page.goto('/dashboard',{waitUntil:'domcontentloaded'}).catch(error=>{throw coded('BROWSER',`SIDEBAR_DASHBOARD_UNREACHABLE:${width}`,error)});
      await page.getByTestId('sidebar-brand-card').waitFor({state:'visible',timeout:30000}).catch(error=>{throw coded('BROWSER',`SIDEBAR_CARD_NOT_VISIBLE:${width}`,error)});
      const geometry=await page.evaluate(() => {
        const card=document.querySelector('[data-testid="sidebar-brand-card"]');
        const logo=document.querySelector('[data-testid="garage-brand-logo"]');
        const label=card?.querySelector('p');
        if(!card||!logo||!label)return null;
        const cardBox=card.getBoundingClientRect();
        const logoBox=logo.getBoundingClientRect();
        const labelBox=label.getBoundingClientRect();
        return {
          card:{left:cardBox.left,right:cardBox.right,top:cardBox.top,bottom:cardBox.bottom,scrollWidth:card.scrollWidth,clientWidth:card.clientWidth},
          logo:{left:logoBox.left,right:logoBox.right,top:logoBox.top,bottom:logoBox.bottom,width:logoBox.width,height:logoBox.height},
          label:{left:labelBox.left,right:labelBox.right,top:labelBox.top,bottom:labelBox.bottom,text:label.textContent?.trim()??''},
          pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        };
      });
      if(!geometry||geometry.logo.width<=0||geometry.logo.height<=0||geometry.label.text.length===0)throw coded('BROWSER',`SIDEBAR_GEOMETRY_MISSING:${width}`);
      const ratio=geometry.logo.width/geometry.logo.height;
      const inside=(box,container)=>box.left>=container.left-1&&box.right<=container.right+1&&box.top>=container.top-1&&box.bottom<=container.bottom+1;
      if(Math.abs(ratio-(1010/396))>0.02||!inside(geometry.logo,geometry.card)||!inside(geometry.label,geometry.card)||geometry.card.scrollWidth>geometry.card.clientWidth||geometry.pageOverflow!==0)throw coded('BROWSER',`SIDEBAR_LAYOUT_REGRESSION:${width}`);
      measurements.push({width,logo_aspect:Number(ratio.toFixed(4)),page_overflow:geometry.pageOverflow,card_overflow:geometry.card.scrollWidth-geometry.card.clientWidth,label_visible:true});
    }
    await context.close();
  }finally{await browser.close()}
  return measurements;
}
async function verifyStaleSessionRecovery(){
  const current=await status();
  const fixture=current.fixtures[0];
  if(!fixture||fixture.fixture_type!=='canary')throw coded('AUTHENTICATION','STALE_SESSION_CANARY_REQUIRED');
  if(!bypassSecret)bypassSecret=keychainRead(bypassService);
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({baseURL:CONTRACT.canonical,extraHTTPHeaders:{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie':'true'}});
    await context.addCookies([{name:`sb-${CONTRACT.projectRef}-auth-token`,value:`base64-${Buffer.from(JSON.stringify({access_token:'expired-access-token',refresh_token:'missing-refresh-token',expires_at:0,expires_in:0,token_type:'bearer',user:{id:fixture.user_id}})).toString('base64url')}`,url:CONTRACT.canonical,httpOnly:true,secure:true,sameSite:'Lax'}]);
    const page=await context.newPage();
    await page.goto('/dashboard',{waitUntil:'domcontentloaded'}).catch(error=>{throw coded('AUTHENTICATION','STALE_SESSION_DASHBOARD_REQUEST_FAILED',error)});
    await page.waitForURL(/\/login(?:\?|$)/,{timeout:30000}).catch(error=>{throw coded('AUTHENTICATION','STALE_SESSION_LOGIN_REDIRECT_MISSING',error)});
    const afterRecovery=await context.cookies(CONTRACT.canonical);
    if(afterRecovery.some(cookie=>/^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(cookie.name)))throw coded('AUTHENTICATION','STALE_SESSION_COOKIE_RESIDUAL');
    const password=randomPassword();
    const{error:rotateError}=await serviceClient().auth.admin.updateUserById(fixture.user_id,{password,email_confirm:true});
    if(rotateError)throw coded('AUTHENTICATION',`STALE_SESSION_PASSWORD_ROTATE_FAILED:${rotateError.status??0}`);
    const login=armResponseWait(page,'/api/auth/password-login','STALE_SESSION_PASSWORD_LOGIN_RESPONSE_MISSING');
    await page.getByLabel('メールアドレス').fill(qaEmail(runId));
    await page.getByLabel('パスワード').fill(password);
    await page.getByRole('button',{name:'ログイン',exact:true}).click();
    const loginResponse=await login();
    if(loginResponse.status()!==200)throw coded('AUTHENTICATION',`STALE_SESSION_PASSWORD_LOGIN_FAILED:${loginResponse.status()}`);
    await page.waitForURL(/\/dashboard(?:\?|$)/,{timeout:30000}).catch(error=>{throw coded('AUTHENTICATION','STALE_SESSION_FRESH_SESSION_REDIRECT_MISSING',error)});
    const freshCookies=await context.cookies(CONTRACT.canonical);
    if(!freshCookies.some(cookie=>/^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(cookie.name)))throw coded('AUTHENTICATION','STALE_SESSION_FRESH_COOKIE_MISSING');
    await context.close();
    return {stale_cookie_cleared:true,fresh_password_login:true,fresh_session_cookie:true};
  }finally{await browser.close()}
}
async function runTests(){let current=await status();if(current.state==='AUTH_READY')await transition('AUTH_READY','TEST_RUNNING','run');current=await status();if(current.state==='TEST_COMPLETE')return current;if(current.state!=='TEST_RUNNING')throw coded('EXECUTION_LIFECYCLE',`TEST_STATE:${current.state}`);await writeCheckpoint(root,runId,{state:'TEST_RUNNING',next_action:'run',checkpoint_probe:'PASS'});const[sidebar,staleSession]=await Promise.all([verifySidebarLayout(),verifyStaleSessionRecovery()]);await writeCheckpoint(root,runId,{state:'TEST_RUNNING',next_action:'run',sidebar_layout:sidebar,stale_session_recovery:staleSession});return transition('TEST_RUNNING','TEST_COMPLETE','teardown-dry-run',null,{canary_business_rows:0,stripe:0,line:0,storage:0,sidebar_viewports:sidebar.map(item=>item.width),stale_session_recovery:'PASS'})}
async function teardownDryRun(){let current=await status();if(current.state==='TEST_COMPLETE')await transition('TEST_COMPLETE','TEARDOWN_DRY_RUN','teardown-dry-run');current=await status();if(current.state==='TEARDOWN_READY')return current;if(current.state!=='TEARDOWN_DRY_RUN')throw coded('EXECUTION_LIFECYCLE',`DRY_RUN_STATE:${current.state}`);await cleanupLineLinkIntegration();const result=await rpc('qa_lifecycle_teardown',{p_run_id:runId,p_dry_run:true});if(!result.ready)throw coded('FIXTURE_LIFECYCLE',`TEARDOWN_EXTERNAL_BLOCKERS:${result.external_blockers.join(',')}`);await writeCheckpoint(root,runId,{state:'TEARDOWN_READY',next_action:'teardown',dry_run:'PASS',counts:result.counts,deletion_order:result.deletion_order});return transition('TEARDOWN_DRY_RUN','TEARDOWN_READY','teardown',null,{dry_run:'PASS'})}
async function teardown(){let current=await status();if(current.state==='TEARDOWN_READY')await transition('TEARDOWN_READY','TEARING_DOWN','teardown');current=await status();if(current.state==='TEARING_DOWN'){await cleanupLineLinkIntegration();await rpc('qa_lifecycle_teardown',{p_run_id:runId,p_dry_run:false})}current=await status();const fixture=current.fixtures[0];if(current.state==='DB_CLEANED'){const{error}=await serviceClient().auth.admin.deleteUser(fixture.user_id,false);if(error&&error.status!==404)throw coded('AUTHENTICATION',`AUTH_HARD_DELETE_FAILED:${error.status??0}`);const{data:user, error:lookupError}=await serviceClient().auth.admin.getUserById(fixture.user_id);if(lookupError&&lookupError.status!==404)throw coded('AUTHENTICATION','AUTH_POST_DELETE_LOOKUP_FAILED');if(user?.user)throw coded('AUTHENTICATION','AUTH_USER_RESIDUAL_AFTER_DELETE');await rpc('qa_lifecycle_record_auth_evidence',{p_run_id:runId,p_user_id:fixture.user_id});current=await status();}if(current.state==='DB_CLEANED'){await advanceCleanup('DB_CLEANED','AUTH_CLEANED','storage-clean')}current=await status();if(current.state==='AUTH_CLEANED'){const { data:buckets,error }=await serviceClient().storage.listBuckets();if(error)throw coded('FIXTURE_LIFECYCLE','STORAGE_LIST_FAILED');let checkedBuckets=0,checkedPaths=0;for(const bucket of buckets??[]){checkedBuckets++;let offset=0;while(true){const{data:objects,error:listError}=await serviceClient().storage.from(bucket.name).list(`qa/${runId}`,{limit:100,offset});if(listError)throw coded('FIXTURE_LIFECYCLE','STORAGE_LIST_FAILED');checkedPaths+=(objects??[]).length;if((objects??[]).length===0)break;if(objects.length<100)break;offset+=100}}if(checkedPaths!==0)throw coded('FIXTURE_LIFECYCLE','STORAGE_RESIDUAL_BLOCKS_COMPLETE');await verifiedEvidence('STORAGE',{bucket_count:checkedBuckets,path_count:checkedPaths});await advanceCleanup('AUTH_CLEANED','STORAGE_CLEANED','artifact-clean')}current=await status();if(current.state==='STORAGE_CLEANED'){const artifactPaths=[storageStatePath,resolve(root,'.qa-runs',`${runId}.json`)];for(const path of artifactPaths){try{await rm(path,{force:false});}catch(error){if(error?.code!=='ENOENT')throw error;}}for(const path of artifactPaths){try{await rm(path,{force:false});throw coded('FIXTURE_LIFECYCLE','LOCAL_ARTIFACT_RESIDUAL')}catch(error){if(error?.code!=='ENOENT')throw error;}}const bypass=await revokeBypass();await verifiedEvidence('ARTIFACT',{artifact_count:0});await verifiedEvidence('BYPASS',{vercel_bypass_present:false,keychain_bypass_present:false,verified_absent:bypass.verified_absent===true});await rpc('qa_lifecycle_record_public_marker_evidence',{p_run_id:runId});await advanceCleanup('STORAGE_CLEANED','ARTIFACTS_CLEANED','verify-clean')}return status()}
async function verifyClean(){const current=await status();if(current.state==='VERIFIED_CLEAN')return rpc('qa_lifecycle_finalize',{p_run_id:runId});if(current.state==='COMPLETE')return current;if(current.state!=='ARTIFACTS_CLEANED')throw coded('EXECUTION_LIFECYCLE',`VERIFY_STATE:${current.state}`);if(purpose===integrationPurpose){const integration=await rpc('qa_l_link_integration_verify_clean',{p_run_id:runId});if(integration?.clean!==true)throw coded('FIXTURE_LIFECYCLE','L_LINK_INTEGRATION_ZERO_RESIDUAL_REQUIRED')}const result=await rpc('qa_lifecycle_verify_clean',{p_run_id:runId,p_finalize:true});if(!result.clean)throw coded('FIXTURE_LIFECYCLE','ZERO_RESIDUAL_GATE_FAILED');return rpc('qa_lifecycle_finalize',{p_run_id:runId})}
async function resume(){const current=await status();if(current.state==='FAILED_RECOVERABLE'){const action=current.next_action||nextAfter(current.last_successful_state);const stateForAction={preflight:'PREFLIGHT_RUNNING',provision:'PROVISIONING',auth:'PROVISIONED',run:'TEST_RUNNING','teardown-dry-run':'TEARDOWN_DRY_RUN',teardown:'TEARING_DOWN','auth-clean':'DB_CLEANED','storage-clean':'AUTH_CLEANED','artifact-clean':'STORAGE_CLEANED','verify-clean':'ARTIFACTS_CLEANED'}[action];if(!stateForAction)throw coded('EXECUTION_LIFECYCLE',`RESUME_ACTION_INVALID:${action}`);await transition('FAILED_RECOVERABLE',stateForAction,action,null,{resumed:true});return dispatch(action)}return dispatch(current.next_action||nextAfter(current.state))}
async function abortSafe(){let current=await status();if(current.state==='FAILED_RECOVERABLE'&&current.last_successful_state==='TEST_RUNNING'){await transition('FAILED_RECOVERABLE','TEST_RUNNING','run',null,{safe_abort:true,recovered_failed_test_for_cleanup:true});current=await status()}if(current.state==='FAILED_RECOVERABLE'&&current.last_successful_state==='PROVISIONED'&&current.fixtures.length===1){await transition('FAILED_RECOVERABLE','PROVISIONED','run',null,{safe_abort:true,recovered_registered_fixture:true});current=await status()}if(['CREATED','PREFLIGHT_RUNNING','PREFLIGHT_READY','PROVISIONING'].includes(current.state)&&current.fixtures.length===0){await revokeBypass();await removeCheckpoint(root,runId);return rpc('qa_lifecycle_abort_clean',{p_run_id:runId,p_reason:'no_fixture_abort'})}if(current.state==='PROVISIONED')await transition('PROVISIONED','AUTH_READY','run',null,{safe_abort:true});current=await status();if(current.state==='AUTH_READY')await transition('AUTH_READY','TEST_RUNNING','run',null,{safe_abort:true});current=await status();if(current.state==='TEST_RUNNING')await transition('TEST_RUNNING','TEST_COMPLETE','teardown-dry-run',null,{safe_abort:true});await teardownDryRun();await teardown();return verifyClean()}
async function dispatch(command){switch(command){case'preflight':return preflight();case'provision':return provision();case'auth':return auth();case'run':return runTests();case'line-link-reset':return resetLineLinkIntegrationEvent();case'teardown-dry-run':return teardownDryRun();case'teardown':case'auth-clean':case'storage-clean':case'artifact-clean':return teardown();case'verify-clean':return verifyClean();case'status':return status();case'resume':return resume();case'abort-safe':return abortSafe();default:throw coded('EXECUTION_LIFECYCLE','USAGE:lifecycle.mjs <preflight|provision|auth|run|line-link-reset|teardown-dry-run|teardown|verify-clean|status|resume|abort-safe> --run-id <uuid>')}}

try{const result=await dispatch(args.command);process.stdout.write(`${JSON.stringify({ok:true,command:args.command,result})}\n`)}catch(error){const safe=safeError(error);try{const current=await status(),hardStop=safe.failure_class==='SECURITY_BOUNDARY';if(!['COMPLETE','HARD_STOP'].includes(current.state))await transition(current.state,hardStop?'HARD_STOP':'FAILED_RECOVERABLE',current.next_action||nextAfter(current.last_successful_state),safe.failure_class,{code:safe.code})}catch{}process.stderr.write(`${JSON.stringify({ok:false,command:args.command,...safe})}\n`);process.exitCode=safe.failure_class==='SECURITY_BOUNDARY'?78:75}finally{serviceKey='';temporaryPassword='';bypassSecret=''}
