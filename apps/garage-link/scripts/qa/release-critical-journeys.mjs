#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { chromium, webkit } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createManualGmailSession, fetchVerifiedVercelRequest, manualGmailCheckpoint, pollManualGmailConfirmation, releaseCriticalBaseUrl } from './release-critical-preflight.mjs';

const STAGING_REF='gaytoojzwqkpuvfofeql';
const STAGING_PROJECT_ID='prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PRODUCTION_PROJECT_ID='prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const PARTIAL_MARKER='garage-link-139f4794-3a9b-4332-ad72-6ba56e2c8377';
const PARTIAL_USER_ID='809dc953-e604-48a7-a4b1-606a57aae461';
const CHECKPOINT_TIMEOUT_MS=20*60_000;

function fail(code){throw new Error(code)}
function required(name){const value=process.env[name]?.trim();if(!value)fail(`RELEASE_CRITICAL_JOURNEY_MISSING:${name}`);return value}
function safeErrorCode(error){return String(error?.message??error).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[REDACTED_EMAIL]').replace(/https?:\/\/\S+/g,'[REDACTED_URL]').replace(/\b(?:sbp|sb_secret|eyJ)[A-Za-z0-9._-]+\b/g,'[REDACTED]').slice(0,180)}
function safeProviderCode(error){return String(error?.code??error?.status??'UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)}
function emit(value){process.stdout.write(`${JSON.stringify(value)}\n`)}
function sha256(value){return createHash('sha256').update(value).digest('hex')}
function signupAlertClassification(value){
  const message=String(value??'').trim();
  if(/redirect.*(?:not allowed|not permitted|allow)/i.test(message))return 'REDIRECT_URL_NOT_ALLOWED';
  if(/email.*rate limit|少し時間/.test(message))return 'EMAIL_RATE_LIMITED';
  if(/already registered|既に登録/.test(message))return 'DUPLICATE_USER';
  if(/valid password|有効なパスワード|8文字以上/.test(message))return 'PASSWORD_POLICY_REJECTED';
  if(/valid email|email address .* invalid|メールアドレスの形式/i.test(message))return 'EMAIL_FORMAT_REJECTED';
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
  return {runId,marker:'[RELEASE QA 20260811]',emailMarker:`g${runId.replaceAll('-','').slice(0,6).toLowerCase()}`};
}
export function releaseCriticalSyntheticPassword(emailMarker){
  if(!/^(?:garage-link-[a-z0-9-]{8,}|g[0-9a-f]{6})$/i.test(emailMarker))fail('RELEASE_CRITICAL_MARKER_INVALID');
  return `GL-${emailMarker}-8!`;
}
export function validateReleaseCriticalProvenance(value,baseUrl){
  try {
    const base=new URL(baseUrl); const deployment=new URL(value?.deployment_url);
    if(value?.project_id!==STAGING_PROJECT_ID||value?.project_id===PRODUCTION_PROJECT_ID||!/^dpl_[A-Za-z0-9]+$/.test(value?.deployment_id??'')||!/^[0-9a-f]{40}$/i.test(value?.git_commit_sha??'')||typeof value?.git_commit_ref!=='string'||!value.git_commit_ref||!['preview','staging'].includes(String(value?.environment).toLowerCase())||base.hostname.endsWith('.garage-link.tech')||deployment.hostname.endsWith('.garage-link.tech')||base.origin!==deployment.origin||!base.hostname.endsWith('.vercel.app'))fail('RELEASE_CRITICAL_PROVENANCE_DENIED');
    return {projectId:value.project_id,deploymentId:value.deployment_id,sourceSha:value.git_commit_sha.toLowerCase(),branch:value.git_commit_ref,deploymentUrl:deployment.origin};
  } catch(error) { if(String(error?.message)==='RELEASE_CRITICAL_PROVENANCE_DENIED')throw error; fail('RELEASE_CRITICAL_PROVENANCE_DENIED'); }
}

// App Router transitions can complete as an RSC navigation without a new
// document `load` event.  The interaction is still only accepted after the
// caller checks the rendered destination, so wait for the committed route
// here rather than timing out on a document lifecycle event that may not run.
async function clickAndWait(page,locator,url){await Promise.all([page.waitForURL(url,{timeout:30_000,waitUntil:'commit'}),locator.click()])}
function safeNavigationPath(value,baseUrl){
  try {
    const url=new URL(value); const base=new URL(baseUrl);
    if(url.origin!==base.origin)return 'CROSS_ORIGIN';
    return `${url.pathname}${url.search}`.slice(0,180);
  } catch {return 'INVALID_URL';}
}
export function classifyCtaTrace(trace){
  if(trace.runtimeErrorCount>0)return 'RUNTIME_ERROR';
  if(!trace.domClick)return 'CLICK_NOT_FIRED';
  if(trace.expected)return 'PASS';
  if(trace.navigationRequestCount>0||trace.finalPath!==trace.initialPath)return 'ROUTE_STARTED_REDIRECTED';
  return 'CLICK_FIRED_ROUTER_UNOBSERVED';
}
export function validateHostedGeneratedLink(actionLink,expectedRedirect,supabaseUrl){
  try {
    const action=new URL(actionLink); const expected=new URL(expectedRedirect); const project=new URL(supabaseUrl);
    const redirect=new URL(action.searchParams.get('redirect_to')??'');
    if(action.origin!==project.origin||action.pathname!=='/auth/v1/verify'||redirect.toString()!==expected.toString()||redirect.protocol!=='https:'||['localhost','127.0.0.1','[::1]'].includes(redirect.hostname)||!/^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i.test(redirect.hostname))fail('RELEASE_CRITICAL_HOSTED_AUTH_REDIRECT_DRIFT');
    return {origin:redirect.origin,path:redirect.pathname,localhost:false};
  } catch(error) {if(String(error?.message)==='RELEASE_CRITICAL_HOSTED_AUTH_REDIRECT_DRIFT')throw error;fail('RELEASE_CRITICAL_HOSTED_AUTH_REDIRECT_DRIFT');}
}
export function validateClientAuthRedirect(requestUrl,expectedRedirect,supabaseUrl){
  try {
    const request=new URL(requestUrl); const expected=new URL(expectedRedirect); const project=new URL(supabaseUrl); const redirect=new URL(request.searchParams.get('redirect_to')??'');
    if(request.origin!==project.origin||redirect.toString()!==expected.toString()||redirect.protocol!=='https:'||['localhost','127.0.0.1','[::1]'].includes(redirect.hostname))fail('RELEASE_CRITICAL_CLIENT_REDIRECT_INVALID');
    return {origin:redirect.origin,path:redirect.pathname};
  } catch(error) {if(String(error?.message)==='RELEASE_CRITICAL_CLIENT_REDIRECT_INVALID')throw error;fail('RELEASE_CRITICAL_CLIENT_REDIRECT_INVALID');}
}
export async function installVercelBrowserBypass(context,baseUrl,bypassSecret){
  let base;
  try {base=new URL(baseUrl)} catch {fail('RELEASE_CRITICAL_BROWSER_BYPASS_ORIGIN_INVALID')}
  if(!/^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i.test(base.hostname)||typeof bypassSecret!=='string'||!bypassSecret)fail('RELEASE_CRITICAL_BROWSER_BYPASS_ORIGIN_INVALID');
  // Scope the Protection credential to the exact Staging deployment origin.
  // A context-wide header would leak it to Supabase and other third parties.
  await context.route(url=>url.origin===base.origin,route=>route.continue({headers:{
    ...route.request().headers(),
    'x-vercel-protection-bypass':bypassSecret,
    'x-vercel-set-bypass-cookie':'true',
  }}));
}
export async function verifyHostedRedirectContract({admin,run,baseUrl,supabaseUrl}){
  const probeMarker=`g${run.runId.replaceAll('-','').slice(6,12).toLowerCase()}`;
  const probe={emailAddress:`qa.redirect.${probeMarker}@example.invalid`}; const password=releaseCriticalSyntheticPassword(probeMarker);
  if(probeMarker===run.emailMarker)fail('RELEASE_CRITICAL_REDIRECT_PROBE_MARKER_COLLISION');
  const callback=new URL('/auth/callback',baseUrl); callback.searchParams.set('next',releaseQaNextPathForRunner('/signup?resume=1',run.runId)); callback.searchParams.set('qa_run',run.runId);
  let userId=''; let subject=null;
  try {
    const {data:created,error:createError}=await admin.auth.admin.createUser({email:probe.emailAddress,password,email_confirm:true,app_metadata:{release_qa_redirect_probe:run.runId}});
    userId=created?.user?.id??''; if(createError||!userId)fail(`RELEASE_CRITICAL_REDIRECT_PROBE_CREATE:${safeProviderCode(createError)}`);
    // The Staging service role intentionally has no direct table grants. Verify
    // this Auth-only probe through the same authenticated-user RLS boundary as
    // the application instead of treating a service-role table 403 as residue.
    subject=createClient(supabaseUrl,required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY'),{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:login,error:loginError}=await subject.auth.signInWithPassword({email:probe.emailAddress,password});
    if(loginError||login.user?.id!==userId)fail(`RELEASE_CRITICAL_REDIRECT_PROBE_LOGIN:${safeProviderCode(loginError)}`);
    const {count:membershipCount,error:membershipError}=await subject.from('current_user_active_store_membership').select('id',{count:'exact',head:true});
    if(membershipError||(membershipCount??0)!==0)fail(`RELEASE_CRITICAL_REDIRECT_PROBE_MEMBERSHIP:${safeProviderCode(membershipError)}`);
    const {data:generated,error:generateError}=await admin.auth.admin.generateLink({type:'recovery',email:probe.emailAddress,options:{redirectTo:callback.toString()}});
    if(generateError||typeof generated?.properties?.action_link!=='string')fail(`RELEASE_CRITICAL_REDIRECT_PROBE_GENERATE:${safeProviderCode(generateError)}`);
    const verified=validateHostedGeneratedLink(generated.properties.action_link,callback.toString(),supabaseUrl);
    emit({state:'RELEASE_CRITICAL_HOSTED_AUTH_REDIRECT_PASS',candidate_origin:verified.origin,callback_path:verified.path,localhost:false,management_pat_required:false,baseline_run_id:'31488195475'});
  } finally {
    await subject?.auth.signOut().catch(()=>undefined);
    if(userId){const {error}=await admin.auth.admin.deleteUser(userId,false);if(error&&error.status!==404)fail(`RELEASE_CRITICAL_REDIRECT_PROBE_DELETE:${error.status??0}`);const {data,error:lookupError}=await admin.auth.admin.getUserById(userId);if((lookupError&&lookupError.status!==404)||data?.user)fail('RELEASE_CRITICAL_REDIRECT_PROBE_RESIDUAL');}
  }
}
function releaseQaNextPathForRunner(path,runId){const url=new URL(path,'https://release-qa.invalid');url.searchParams.set('qa_run',runId);return `${url.pathname}${url.search}`;}
async function tracePointerCta(page,{baseUrl,label,locator,expectedPath=null,expectedRender=null,accountState,expectedClassification='PASS',expectedFinalPath=null}){
  const initialPath=safeNavigationPath(page.url(),baseUrl);
  const trace={domClick:false,expected:false,initialPath,finalPath:initialPath,navigationRequestCount:0,runtimeErrorCount:0};
  const clickKey=`release-critical-cta-${label}`;
  const observedRequests=[];
  const onRequest=request=>{
    // App Router Link transitions are usually RSC fetches rather than a full
    // document navigation. Count both without recording headers or bodies.
    if(!request.isNavigationRequest()&&request.headers().rsc!=='1')return;
    const path=safeNavigationPath(request.url(),baseUrl);
    if(path!=='CROSS_ORIGIN'&&path!=='INVALID_URL')observedRequests.push(path);
  };
  const onPageError=()=>{trace.runtimeErrorCount+=1;};
  const onConsole=message=>{if(message.type()==='error')trace.runtimeErrorCount+=1;};
  let emittedClassification=null;
  const emitTrace=()=>{
    if(emittedClassification)return emittedClassification;
    trace.finalPath=safeNavigationPath(page.url(),baseUrl);
    trace.navigationRequestCount=observedRequests.length;
    const classification=classifyCtaTrace(trace);
    emit({state:'RELEASE_CRITICAL_CTA_TRACE',cta:label,classification,dom_click:trace.domClick?'YES':'NO',navigation_request_count:trace.navigationRequestCount,middleware_final_destination:trace.finalPath,browser_runtime_error_count:trace.runtimeErrorCount,garage_ui_context:accountState?.garageUiContext??'UNKNOWN',active_store:accountState?.activeStore??'UNKNOWN',onboarding_completed:accountState?.onboardingCompleted??'UNKNOWN',membership_role:accountState?.membershipRole??'UNKNOWN',membership_status:accountState?.membershipStatus??'UNKNOWN',contract_access_state:accountState?.contractAccessState??'UNKNOWN',admin_security_requirement:trace.finalPath.startsWith('/security/email-otp')?'REQUIRED':'NOT_OBSERVED'});
    emittedClassification=classification;
    return emittedClassification;
  };
  page.on('request',onRequest); page.on('pageerror',onPageError); page.on('console',onConsole);
  try {
    await locator.evaluate(element=>{
      element.addEventListener('click',()=>{sessionStorage.setItem(element.getAttribute('data-release-critical-click-key')??'release-critical-cta','1');},{once:true});
    });
    await locator.setAttribute('data-release-critical-click-key',clickKey);
    await locator.click();
    trace.domClick=await page.evaluate(key=>sessionStorage.getItem(key)==='1',clickKey);
    await page.evaluate(key=>sessionStorage.removeItem(key),clickKey);
    try {
      if(expectedRender){await expectedRender.waitFor({state:'visible',timeout:30_000});}
      else if(expectedPath){await page.waitForURL(url=>{
        const pathname=new URL(url).pathname;
        return expectedPath.endsWith('/') ? pathname.startsWith(expectedPath) : pathname===expectedPath;
      },{timeout:30_000});}
      else fail('RELEASE_CRITICAL_CTA_EXPECTATION_MISSING');
      trace.expected=true;
    } catch {await page.waitForTimeout(750);}
    const classification=emitTrace();
    if((expectedClassification!==null&&classification!==expectedClassification)||(
      expectedFinalPath!==null&&trace.finalPath.split('?')[0]!==expectedFinalPath
    ))fail(`RELEASE_CRITICAL_CTA_${label}:${classification}`);
    return {classification,finalPath:trace.finalPath,domClick:trace.domClick,navigationRequestCount:trace.navigationRequestCount,runtimeErrorCount:trace.runtimeErrorCount};
  } catch(error) {
    const classification=emitTrace();
    if(String(error?.message??error).startsWith(`RELEASE_CRITICAL_CTA_${label}:`))throw error;
    fail(`RELEASE_CRITICAL_CTA_${label}:${classification==='PASS'?'TRACE_EXECUTION_ERROR':classification}`);
  } finally {
    page.off('request',onRequest); page.off('pageerror',onPageError); page.off('console',onConsole);
  }
}
async function verifyVehicleAccountStateGate({browser,sourceContext,baseUrl,bypassSecret,accountState}){
  const storageState=await sourceContext.storageState();
  const gatedContext=await browser.newContext({storageState});
  try {
    await installVercelBrowserBypass(gatedContext,baseUrl,bypassSecret);
    const gatedPage=await gatedContext.newPage();
    await gatedPage.goto(new URL('/vehicles',baseUrl),{waitUntil:'domcontentloaded'});
    await gatedPage.getByRole('link',{name:'車両を登録',exact:true}).waitFor({state:'visible',timeout:30_000});
    await gatedContext.clearCookies({name:/^garage_admin_email_verified$/});
    await tracePointerCta(gatedPage,{baseUrl,label:'VEHICLE_CREATE_ADMIN_SECURITY_GATE',locator:gatedPage.getByRole('link',{name:'車両を登録',exact:true}),expectedPath:'/vehicles/new',accountState,expectedClassification:'ROUTE_STARTED_REDIRECTED',expectedFinalPath:'/security/email-otp'});
    const gateUrl=new URL(gatedPage.url());
    if(gateUrl.searchParams.get('from')!=='/vehicles/new')fail('RELEASE_CRITICAL_CTA_ADMIN_SECURITY_RETURN_PATH_INVALID');
    emit({state:'RELEASE_CRITICAL_CTA_ACCOUNT_STATE_DIFFERENTIAL',cta:'VEHICLE_CREATE',normal_active_owner:'PASS',admin_security_unverified:'ROUTE_STARTED_REDIRECTED',gate:'admin_security',final_destination:'/security/email-otp',return_path:'/vehicles/new',customer_equivalence:'NOT_ASSERTED',root_cause:'NOT_REPRODUCED'});
  } finally {await gatedContext.close();}
}
const CTA_MATRIX_STATES=['active_owner','active_non_owner','selection_required','onboarding_incomplete','contract_restricted','admin_security_unverified'];

function matrixSubjectEmail(run,state,kind='subject'){
  const compact=run.runId.replaceAll('-','');
  return `qa.cta.${compact}.${state}.${kind}@example.invalid`;
}
function matrixExpectedState(state){
  return {
    active_owner:{garageUiContext:'active',activeStore:'YES',onboardingCompleted:'YES',membershipRole:'owner',contractAccessState:'active'},
    active_non_owner:{garageUiContext:'active',activeStore:'YES',onboardingCompleted:'YES',membershipRole:'staff',contractAccessState:'active'},
    selection_required:{garageUiContext:'selection_required',activeStore:'NO',onboardingCompleted:'NO',membershipRole:'owner',contractAccessState:'active'},
    onboarding_incomplete:{garageUiContext:'active',activeStore:'YES',onboardingCompleted:'NO',membershipRole:'owner',contractAccessState:'active'},
    contract_restricted:{garageUiContext:'active',activeStore:'YES',onboardingCompleted:'YES',membershipRole:'owner',contractAccessState:'restricted'},
    admin_security_unverified:{garageUiContext:'active',activeStore:'YES',onboardingCompleted:'YES',membershipRole:'owner',contractAccessState:'active'},
  }[state];
}
async function matrixAccountState({supabaseUrl,serviceRole,email,password}){
  const subject=createClient(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  try {
    const {data,error}=await subject.auth.signInWithPassword({email,password});
    if(error||!data.user?.id)fail(`RELEASE_CRITICAL_CTA_MATRIX_AUTH:${safeProviderCode(error)}`);
    const [ui,contract]=await Promise.all([
      subject.rpc('get_garage_ui_context_v2',{}),
      subject.rpc('get_member_contract_access',{}),
    ]);
    if(ui.error||contract.error)fail(`RELEASE_CRITICAL_CTA_MATRIX_STATE:${safeProviderCode(ui.error??contract.error)}`);
    const value={
      garageUiContext:ui.data?.state,
      activeStore:ui.data?.store_id?'YES':'NO',
      onboardingCompleted:ui.data?.onboarding_completed===true?'YES':'NO',
      membershipRole:ui.data?.role,
      membershipStatus:'active',
      contractAccessState:contract.data?.state,
    };
    if(!['active','selection_required','no_access'].includes(value.garageUiContext)||!['YES','NO'].includes(value.activeStore)||!['YES','NO'].includes(value.onboardingCompleted)||!/^[a-z_]{2,32}$/i.test(String(value.membershipRole??''))||!/^[a-z_]{2,48}$/i.test(String(value.contractAccessState??'')))fail('RELEASE_CRITICAL_CTA_MATRIX_STATE_SHAPE');
    return value;
  } finally {await subject.auth.signOut().catch(()=>undefined);}
}
function matrixStateMatches(actual,expected){
  return actual.garageUiContext===expected.garageUiContext
    && actual.activeStore===expected.activeStore
    && actual.onboardingCompleted===expected.onboardingCompleted
    && actual.membershipRole===expected.membershipRole
    && actual.contractAccessState===expected.contractAccessState;
}
function emitUnavailableMatrixTrace({baseUrl,page,state,accountState}){
  const finalPath=safeNavigationPath(page.url(),baseUrl);
  const classification=finalPath.split('?')[0]!=='/vehicles'?'ROUTE_STARTED_REDIRECTED':'CLICK_NOT_FIRED';
  emit({state:'RELEASE_CRITICAL_CTA_TRACE',cta:`VEHICLE_CREATE_MATRIX_${state.toUpperCase()}`,classification,dom_click:'NO',navigation_request_count:0,middleware_final_destination:finalPath,browser_runtime_error_count:0,garage_ui_context:accountState.garageUiContext,active_store:accountState.activeStore,onboarding_completed:accountState.onboardingCompleted,membership_role:accountState.membershipRole,membership_status:accountState.membershipStatus,contract_access_state:accountState.contractAccessState,admin_security_requirement:finalPath.startsWith('/security/email-otp')?'REQUIRED':'NOT_OBSERVED'});
  return {classification,finalPath,domClick:false,navigationRequestCount:0,runtimeErrorCount:0};
}
async function executeVehicleMatrixCase({browser,baseUrl,bypassSecret,state,subject,password,supabaseUrl,serviceRole}){
  const accountState=await matrixAccountState({supabaseUrl,serviceRole,email:subject.email,password});
  if(!matrixStateMatches(accountState,matrixExpectedState(state)))fail(`RELEASE_CRITICAL_CTA_MATRIX_EXPECTED_STATE_MISMATCH:${state}`);
  const context=await browser.newContext();
  try {
    await installVercelBrowserBypass(context,baseUrl,bypassSecret);
    const page=await context.newPage();
    await page.goto(new URL('/login',baseUrl),{waitUntil:'domcontentloaded'});
    await login(page,subject.email,password,/\/(dashboard|onboarding)(?:\?|$)/);
    if(state==='admin_security_unverified')await context.clearCookies({name:/^garage_admin_email_verified$/});
    await page.goto(new URL('/vehicles',baseUrl),{waitUntil:'domcontentloaded'});
    const cta=page.getByRole('link',{name:'車両を登録',exact:true});
    const trace=await cta.isVisible().catch(()=>false)
      ?await tracePointerCta(page,{baseUrl,label:`VEHICLE_CREATE_MATRIX_${state.toUpperCase()}`,locator:cta,expectedPath:'/vehicles/new',accountState,expectedClassification:null})
      :emitUnavailableMatrixTrace({baseUrl,page,state,accountState});
    return {state,accountState,trace};
  } finally {await context.close();}
}
async function runVehicleAccountStateMatrix({admin,life,run,baseUrl,supabaseUrl,serviceRole,bypassSecret}){
  const password=releaseCriticalSyntheticPassword(run.emailMarker);
  const subjects={}; const created=[]; let provisioned=false; let browser;
  try {
    for(const state of CTA_MATRIX_STATES){
      const subjectEmail=matrixSubjectEmail(run,state);
      const {data,error}=await admin.auth.admin.createUser({email:subjectEmail,password,email_confirm:true,app_metadata:{purpose:'release-cta-matrix',release_qa_cta_matrix_run_id:run.runId}});
      if(error||!data.user?.id)fail(`RELEASE_CRITICAL_CTA_MATRIX_SUBJECT_CREATE:${state}:${safeProviderCode(error)}`);
      subjects[state]={subject_user_id:data.user.id,email:subjectEmail}; created.push(data.user.id);
      if(state==='active_non_owner'){
        const supportEmail=matrixSubjectEmail(run,state,'support');
        const support=await admin.auth.admin.createUser({email:supportEmail,password,email_confirm:true,app_metadata:{purpose:'release-cta-matrix',release_qa_cta_matrix_run_id:run.runId}});
        if(support.error||!support.data.user?.id)fail(`RELEASE_CRITICAL_CTA_MATRIX_SUPPORT_CREATE:${safeProviderCode(support.error)}`);
        subjects[state].support_user_id=support.data.user.id; subjects[state].support_email=supportEmail; created.push(support.data.user.id);
      }
    }
    const provision=await life.rpc('qa_lifecycle_cta_matrix',{p_run_id:run.runId,p_action:'provision',p_subjects:subjects});
    if(provision?.state!=='PROVISIONED'||provision?.fixture_count!==6)fail('RELEASE_CRITICAL_CTA_MATRIX_PROVISION_FAILED');
    provisioned=true;
    browser=await chromium.launch({headless:true});
    const results=[];
    for(const state of CTA_MATRIX_STATES){
      results.push(await executeVehicleMatrixCase({browser,baseUrl,bypassSecret,state,subject:subjects[state],password,supabaseUrl,serviceRole}));
    }
    const normal=results.find(result=>result.state==='active_owner');
    const nonOwner=results.find(result=>result.state==='active_non_owner');
    // The Production observation is only owner-versus-customer. A security
    // cookie differential or any other synthetic state is useful evidence but
    // cannot be labelled customer-equivalent without this direct role delta.
    const reproduced=normal?.trace.classification==='PASS'&&nonOwner?.trace.classification!=='PASS';
    emit({state:'RELEASE_CRITICAL_CTA_ACCOUNT_STATE_MATRIX',states:results.map(result=>({state:result.state,classification:result.trace.classification,middleware_final_destination:result.trace.finalPath,account_state:result.accountState})),customer_equivalence:reproduced?'ACTIVE_NON_OWNER_REPRODUCED':'NOT_ASSERTED',root_cause:reproduced?'ACTIVE_NON_OWNER_GATE':'NOT_REPRODUCED'});
    if(results.some(result=>result.trace.runtimeErrorCount!==0))fail('RELEASE_CRITICAL_CTA_MATRIX_RUNTIME_ERROR');
    return results;
  } finally {
    try {
      if(provisioned){
        const reset=await life.rpc('qa_lifecycle_cta_matrix',{p_run_id:run.runId,p_action:'reset',p_subjects:{}});
        const ids=Array.isArray(reset?.auth_user_ids)?reset.auth_user_ids.filter(value=>typeof value==='string'):[];
        if(ids.length!==created.length||ids.some(id=>!created.includes(id)))fail('RELEASE_CRITICAL_CTA_MATRIX_RESET_IDENTITY_MISMATCH');
        for(const id of ids){const {error}=await admin.auth.admin.deleteUser(id,false);if(error&&error.status!==404)fail(`RELEASE_CRITICAL_CTA_MATRIX_AUTH_DELETE:${error.status??0}`);}
        const verified=await life.rpc('qa_lifecycle_cta_matrix',{p_run_id:run.runId,p_action:'verify_clean',p_subjects:{auth_user_ids:ids}});
        if(verified?.clean!==true)fail('RELEASE_CRITICAL_CTA_MATRIX_RESIDUAL');
      } else {
        for(const id of created){const {error}=await admin.auth.admin.deleteUser(id,false);if(error&&error.status!==404)fail(`RELEASE_CRITICAL_CTA_MATRIX_EARLY_AUTH_DELETE:${error.status??0}`);}
      }
    } finally {await browser?.close();}
  }
}
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
  await page.waitForURL(/\/(signup\?resume=1|dashboard|onboarding|security\/email-otp)/,{timeout:30_000});
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
function fixtureDiscoveryFailure(response,detail,emailMarker){
  const layer=String(detail?.layer??(response.status===401||response.status===403?'VERCEL_OR_ROUTE':'UNKNOWN')).replace(/[^A-Z0-9_]/g,'_');
  const code=String(detail?.code??detail?.provider_error_code??'UNKNOWN').replace(/[^A-Z0-9_]/g,'_');
  const postgrest=Number.isInteger(detail?.postgrest_response_code)?detail.postgrest_response_code:'NONE';
  const postgrestProviderCode=String(detail?.postgrest_provider_error_code??'NONE').replace(/[^A-Z0-9_]/gi,'_').slice(0,32);
  const postgrestClass=String(detail?.postgrest_error_class??'NONE').replace(/[^A-Z_]/g,'').slice(0,32);
  const postgrestObject=String(detail?.postgrest_object??'NONE').replace(/[^a-z_]/g,'').slice(0,48);
  emit({state:'RELEASE_CRITICAL_FIXTURE_DISCOVERY_DIAGNOSTIC',layer,http_status:response.status,provider_error_code:code,jwt_sub_matches_user:detail?.jwt?.sub_matches_user??'UNKNOWN',jwt_role:detail?.jwt?.role??'UNKNOWN',jwt_aud:detail?.jwt?.aud??'UNKNOWN',jwt_exp_valid:detail?.jwt?.exp_valid??'UNKNOWN',project_ref_matches:detail?.jwt?.project_ref_matches??'UNKNOWN',deployed_supabase_ref_matches:detail?.deployed_supabase_ref_matches??'UNKNOWN',deployed_anon_key_accepted:detail?.deployed_anon_key_accepted??'UNKNOWN',postgrest_response_code:postgrest,postgrest_provider_error_code:postgrestProviderCode,postgrest_error_class:postgrestClass,postgrest_object:postgrestObject,bypass_applied:'YES',fixture_marker_hash:sha256(emailMarker)});
  return `RELEASE_CRITICAL_FIXTURE_DISCOVERY:${response.status}:${layer}:${code}`;
}
async function ownerFixtureForUser({baseUrl,supabaseUrl,serviceRole,email,password,tenantNamePrefix,bypassSecret,runId,optional=false}){
  // The lifecycle service role intentionally has no direct table grants. The
  // Staging-only endpoint verifies the synthetic owner token and reads through
  // that owner's existing RLS boundary without widening any database grant.
  const subject=createClient(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  try {
    const {data:login,error:loginError}=await subject.auth.signInWithPassword({email,password});
    if(loginError||!login.session?.user){if(optional)return null;fail(`RELEASE_CRITICAL_FIXTURE_OWNER_LOGIN:${safeProviderCode(loginError)}`);}
    await trustReleaseQaAdminSession({baseUrl,bypassSecret,accessToken:login.session.access_token});
    const emailMarker=email.split('@')[0]?.split('+')[1];
    const legacyMarker=/^garage-link-(?:[0-9a-f]{12}|[0-9a-f-]{36})$/i.test(emailMarker??'')?emailMarker:null;
    const qaRunId=typeof runId==='string'&&/^[0-9a-f-]{36}$/i.test(runId)?runId:null;
    if(!legacyMarker&&!qaRunId)fail('RELEASE_CRITICAL_FIXTURE_MARKER_INVALID');
    const headers={authorization:`Bearer ${login.session.access_token}`,'content-type':'application/json','x-vercel-protection-bypass':bypassSecret};
    const request=await fetchVerifiedVercelRequest(new URL('/api/qa/fixture-discovery',baseUrl),headers,fetch,{method:'POST',body:JSON.stringify(qaRunId?{run_id:qaRunId}:{email_marker:legacyMarker})});
    const response=request.response;
    if(response.headers.has('location'))fail('RELEASE_CRITICAL_FIXTURE_DISCOVERY_REDIRECT');
    if(!response.ok){const detail=await response.json().catch(()=>null);if(optional&&response.status===409)return null;fail(fixtureDiscoveryFailure(response,detail,qaRunId??legacyMarker));}
    const fixture=await response.json();
    const accountState=fixture?.account_state;
    if(typeof fixture?.membership_id!=='string'||typeof fixture?.tenant_id!=='string'||typeof fixture?.store_id!=='string'||typeof fixture?.tenant_name!=='string'||!fixture.tenant_name.startsWith(tenantNamePrefix)||!['ACTIVE_STORE_VIEW','JWT_MEMBERSHIP_FALLBACK'].includes(fixture?.discovery_path)||!['active','selection_required','no_access'].includes(accountState?.garage_ui_context)||!['YES','NO'].includes(accountState?.active_store)||!['YES','NO'].includes(accountState?.onboarding_completed)||!/^\w{2,32}$/.test(accountState?.membership_role??'')||accountState?.membership_status!=='active'||!/^\w{2,48}$/.test(accountState?.contract_access_state??''))fail('RELEASE_CRITICAL_FIXTURE_DISCOVERY_INVALID');
    if(fixture.discovery_path==='JWT_MEMBERSHIP_FALLBACK')emit({state:'RELEASE_CRITICAL_FIXTURE_VIEW_BOUNDARY_ISOLATED',primary_path:'ACTIVE_STORE_VIEW',fallback_path:'JWT_MEMBERSHIP_FALLBACK',subject_jwt_preserved:true,grant_or_rls_change:false});
    return {membershipId:fixture.membership_id,tenantId:fixture.tenant_id,storeId:fixture.store_id,tenantName:fixture.tenant_name,accountState:{garageUiContext:accountState.garage_ui_context,activeStore:accountState.active_store,onboardingCompleted:accountState.onboarding_completed,membershipRole:accountState.membership_role,membershipStatus:accountState.membership_status,contractAccessState:accountState.contract_access_state}};
  } finally {await subject.auth.signOut().catch(()=>undefined);}
}
async function trustReleaseQaAdminSession({baseUrl,bypassSecret,accessToken}){
  const headers={authorization:`Bearer ${accessToken}`,'content-type':'application/json','x-vercel-protection-bypass':bypassSecret};
  const requestOtp=()=>fetchVerifiedVercelRequest(new URL('/api/auth/admin-email-otp/request',baseUrl),headers,fetch,{method:'POST',body:'{}'});
  let requested=await requestOtp();
  // A browser-completed administrator OTP and the service-role fixture lookup
  // legitimately use different sessions for the same synthetic user. Respect
  // the route's one-minute resend contract once instead of bypassing the
  // security gate or declaring the user journey failed on that safe cooldown.
  if(requested.response.status===429&&!requested.response.headers.has('location')){
    const retryAfter=Number(requested.response.headers.get('retry-after'));
    if(!Number.isInteger(retryAfter)||retryAfter<1||retryAfter>60)fail('RELEASE_CRITICAL_FIXTURE_OTP_RETRY_AFTER_INVALID');
    emit({state:'RELEASE_CRITICAL_FIXTURE_OTP_COOLDOWN_WAIT',retry_after_seconds:retryAfter,attempt:1});
    await new Promise(resolve=>setTimeout(resolve,(retryAfter*1000)+250));
    requested=await requestOtp();
  }
  if(!requested.response.ok||requested.response.headers.has('location'))fail(`RELEASE_CRITICAL_FIXTURE_OTP_REQUEST:${requested.response.status}`);
  const requestBody=await requested.response.json().catch(()=>null);
  const code=typeof requestBody?.previewOtp==='string'&&/^\d{6}$/.test(requestBody.previewOtp)?requestBody.previewOtp:null;
  if(!code)fail('RELEASE_CRITICAL_FIXTURE_OTP_CODE_UNAVAILABLE');
  const verified=await fetchVerifiedVercelRequest(new URL('/api/auth/admin-email-otp/verify',baseUrl),headers,fetch,{method:'POST',body:JSON.stringify({code})});
  if(!verified.response.ok||verified.response.headers.has('location'))fail(`RELEASE_CRITICAL_FIXTURE_OTP_VERIFY:${verified.response.status}`);
}
async function activeOwner(options){return ownerFixtureForUser(options)}
async function maybeActiveOwner(options){return ownerFixtureForUser({...options,optional:true})}
async function findUser(admin,email){
  for(let page=1;page<=10;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)fail(`RELEASE_CRITICAL_AUTH_LOOKUP:${error.status??0}`);const user=data?.users?.find(item=>item.email?.toLowerCase()===email.toLowerCase());if(user)return user;if((data?.users?.length??0)<1000)break;}
  fail('RELEASE_CRITICAL_AUTH_USER_NOT_FOUND');
}
async function maybeFindUser(admin,email){
  for(let page=1;page<=10;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)fail(`RELEASE_CRITICAL_AUTH_LOOKUP:${error.status??0}`);const user=data?.users?.find(item=>item.email?.toLowerCase()===email.toLowerCase());if(user)return user;if((data?.users?.length??0)<1000)break;}
  return null;
}
async function bindSyntheticIdentity(admin,user,run){
  const {data,error}=await admin.auth.admin.updateUserById(user.id,{app_metadata:{...user.app_metadata,release_qa_run_id:run.runId}});
  if(error||data.user?.app_metadata?.release_qa_run_id!==run.runId)fail(`RELEASE_CRITICAL_SYNTHETIC_IDENTITY_BIND:${safeProviderCode(error)}`);
  return data.user;
}
async function findKnownPartialUser(admin){
  const matches=[];
  for(let page=1;page<=10;page+=1){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)fail(`RELEASE_CRITICAL_PARTIAL_AUTH_LOOKUP:${error.status??0}`);matches.push(...(data?.users??[]).filter(item=>item.email?.toLowerCase().includes(`+${PARTIAL_MARKER}@`)));if((data?.users?.length??0)<1000)break;}
  if(matches.length>1)fail(`RELEASE_CRITICAL_PARTIAL_FIXTURE_CARDINALITY:${matches.length}`);
  return matches[0]??null;
}
export function lifecycle(admin,run,provenance){
  const rpc=async(name,args={})=>{const {data,error}=await admin.rpc(name,args);if(error)fail(`RELEASE_CRITICAL_LIFECYCLE_${name}:${error.code??'FAILED'}`);return data};
  const maybeStatus=async()=>{const {data,error}=await admin.rpc('qa_lifecycle_status',{p_run_id:run.runId});if(!error)return data;if(error.code==='P0001'&&String(error.message??'').includes('QA_RUN_NOT_FOUND'))return null;fail(`RELEASE_CRITICAL_LIFECYCLE_qa_lifecycle_status:${error.code??'FAILED'}`);};
  const transition=(expected,next,action,detail={})=>rpc('qa_lifecycle_transition',{p_run_id:run.runId,p_expected_state:expected,p_next_state:next,p_next_action:action,p_failure_class:null,p_safe_detail:detail});
  const evidence=(kind,detail={})=>{const payload={run_id:run.runId,source_sha:provenance.sourceSha,deployment_id:provenance.deploymentId,actor:'release-critical-gha',residual_count:0,observed_at:new Date().toISOString(),...detail};return rpc('qa_lifecycle_record_verified_evidence',{p_run_id:run.runId,p_evidence_kind:kind,p_observation:{...payload,proof_sha:sha256(JSON.stringify(payload))}})};
  return {rpc,transition,evidence,status:()=>rpc('qa_lifecycle_status',{p_run_id:run.runId}),maybeStatus};
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
async function pollCallbackEvidence({admin,userId,run,baseUrl,purpose,requireStoreCreated=false,requireOnboardingCompleted=false,requirePasswordUpdate=false,timeoutMs=CHECKPOINT_TIMEOUT_MS,intervalMs=5_000,sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))}){
  const expectedNext=purpose==='signup'?`/signup?resume=1&qa_run=${run.runId}`:`/auth/reset-password?qa_run=${run.runId}`;
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const {data,error}=await admin.auth.admin.getUserById(userId); const evidence=data?.user?.app_metadata?.release_qa_callback?.[purpose];
    if(error)fail(`RELEASE_CRITICAL_CALLBACK_EVIDENCE_READ_FAILED:${error.status??0}`);
    const callback=evidence?.callback; const arrival=evidence?.arrival; const storeCreated=evidence?.store_created; const onboardingCompleted=evidence?.onboarding_completed; const passwordUpdated=evidence?.password_updated;
    const valid=value=>value&&value.next_path===expectedNext&&value.origin===new URL(baseUrl).origin&&typeof value.recorded_at==='string';
    const ordered=valid(callback)&&valid(arrival)&&Date.parse(callback.recorded_at)<=Date.parse(arrival.recorded_at);
    const continued=value=>valid(value)&&value.server_bound_continuation===true&&value.continuation_of_callback_at===callback.recorded_at&&Date.parse(value.recorded_at)>=Date.parse(arrival.recorded_at);
    if(ordered&&(!requireStoreCreated||continued(storeCreated))&&(!requireOnboardingCompleted||continued(onboardingCompleted))&&(!requirePasswordUpdate||continued(passwordUpdated)))return {state:'RELEASE_CRITICAL_CALLBACK_EVIDENCE_PASS',purpose,run_marker:run.emailMarker,actual_callback_chain:true,activation_chain:requireStoreCreated||requireOnboardingCompleted,server_bound_continuation:requireStoreCreated||requireOnboardingCompleted||requirePasswordUpdate};
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
    await life.evidence('BYPASS',{temporary_protection_mutation:false,temporary_bypass_created:false});
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
async function recoverKnownPartialFixture(admin,provenance,baseUrl,supabaseUrl,serviceRole,bypassSecret){
  const partialRunId=PARTIAL_MARKER.replace(/^garage-link-/,'');
  const partialRun={runId:partialRunId,marker:'[RELEASE QA 20260811]',emailMarker:PARTIAL_MARKER};
  const statusLife=lifecycle(admin,partialRun,provenance); let existing=await statusLife.maybeStatus();
  const user=await findKnownPartialUser(admin);
  if(!user){
    if(!existing)return {state:'RELEASE_CRITICAL_PARTIAL_FIXTURE_ABSENT'};
    if(!/^[0-9a-f]{40}$/i.test(existing.source_sha??'')||!/^dpl_[A-Za-z0-9]+$/.test(existing.deployment_id??''))fail('RELEASE_CRITICAL_PARTIAL_PROVENANCE_UNPROVEN');
    const life=lifecycle(admin,partialRun,{sourceSha:existing.source_sha,deploymentId:existing.deployment_id});
    if(!['DB_CLEANED','AUTH_CLEANED','STORAGE_CLEANED','ARTIFACTS_CLEANED','COMPLETE'].includes(existing.state))fail(`RELEASE_CRITICAL_PARTIAL_AUTH_ABSENT_STATE:${existing.state}`);
    if(existing.state!=='COMPLETE')await cleanupLifecycle(life,admin,PARTIAL_USER_ID,partialRunId);
    return verifyKnownPartialLifecycle(admin,life,partialRunId);
  }
  const owner=await activeOwner({baseUrl,supabaseUrl,serviceRole,email:user.email,password:releaseCriticalSyntheticPassword(PARTIAL_MARKER),tenantNamePrefix:'[RELEASE QA ',bypassSecret});
  const marker=/^\[RELEASE QA \d{8}\]/.exec(owner.tenantName)?.[0];
  if(!marker)fail('RELEASE_CRITICAL_PARTIAL_MARKER_UNPROVEN');
  const run={runId:partialRunId,marker,emailMarker:PARTIAL_MARKER};
  existing=await statusLife.maybeStatus();
  if(!existing){await beginLifecycle(statusLife,run,provenance);existing=await statusLife.status();}
  if(!/^[0-9a-f]{40}$/i.test(existing.source_sha??'')||!/^dpl_[A-Za-z0-9]+$/.test(existing.deployment_id??''))fail('RELEASE_CRITICAL_PARTIAL_PROVENANCE_UNPROVEN');
  const life=lifecycle(admin,run,{sourceSha:existing.source_sha,deploymentId:existing.deployment_id});
  if(existing.state!=='PROVISIONING')fail(`RELEASE_CRITICAL_PARTIAL_LIFECYCLE_STATE:${existing.state}`);
  await adoptLifecycleFixture(life,run,{...owner,userId:user.id});
  await cleanupLifecycle(life,admin,user.id,run.runId);
  return verifyKnownPartialLifecycle(admin,life,partialRunId);
}
async function verifyKnownPartialLifecycle(admin,life,partialRunId){
  const final=await life.status();
  const verified=final.final_evidence;
  const counts=verified?.db_counts;
  if(final.state!=='COMPLETE'||verified?.clean!==true||verified?.auth_users!==0||verified?.auth_sessions!==0||verified?.db_total!==0||!counts||Object.values(counts).some(value=>Number(value)!==0))fail('RELEASE_CRITICAL_PARTIAL_READBACK_FAILED');
  const {data:buckets,error:bucketsError}=await admin.storage.listBuckets(); if(bucketsError)fail('RELEASE_CRITICAL_PARTIAL_STORAGE_LIST_FAILED'); let storage=0;
  for(const bucket of buckets??[]){const {data,error}=await admin.storage.from(bucket.name).list(`qa/${partialRunId}`,{limit:100});if(error)fail('RELEASE_CRITICAL_PARTIAL_STORAGE_LIST_FAILED');storage+=(data??[]).length;}
  const residual={auth_user:verified.auth_users,membership:Number(counts.memberships??0),store:Number(counts.stores??0),tenant:Number(counts.tenants??0),subscription:Number(counts.company_subscriptions??0),storage,artifact:0};
  if(Object.values(residual).some(value=>value!==0))fail('RELEASE_CRITICAL_PARTIAL_FIXTURE_RESIDUAL');
  emit({state:'RELEASE_CRITICAL_PARTIAL_FIXTURE_CLEAN',marker:PARTIAL_MARKER,residual,qa_lifecycle:final.state});
  return final;
}
async function runMobileSmoke(baseUrl,browserType,name,bypassSecret){
  const browser=await browserType.launch({headless:true});
  try {const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true});await installVercelBrowserBypass(context,baseUrl,bypassSecret);const page=await context.newPage();await page.goto(baseUrl,{waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'無料で始める'}).first().click();await page.waitForURL(/\/signup/,{timeout:30_000});await context.close();emit({journey:'J10',browser:name,status:'PASS'});} finally {await browser.close();}
}
async function hostedActionLink(admin,{type,email,password,redirectTo,supabaseUrl}){
  const {data,error}=await admin.auth.admin.generateLink({type,email,password,options:{redirectTo}});
  const actionLink=data?.properties?.action_link;
  if(error||typeof actionLink!=='string')fail(`RELEASE_CRITICAL_HOSTED_ACTION_LINK:${type}:${safeProviderCode(error)}`);
  validateHostedGeneratedLink(actionLink,redirectTo,supabaseUrl);
  return actionLink;
}
async function followHostedAction(page,actionLink,{baseUrl,expectedPath,purpose}){
  emit({state:'RELEASE_CRITICAL_AUTH_CALLBACK_NAVIGATION',purpose,stage:'HOSTED_ACTION_OPENED'});
  await page.goto(actionLink,{waitUntil:'domcontentloaded'});
  try {
    await page.waitForURL(url=>new URL(url).origin===new URL(baseUrl).origin&&new URL(url).pathname===expectedPath,{timeout:30_000});
  } catch {
    emit({state:'RELEASE_CRITICAL_AUTH_CALLBACK_NAVIGATION',purpose,stage:'EXPECTED_ARRIVAL_MISSING',final_path:safeNavigationPath(page.url(),baseUrl)});
    fail(`RELEASE_CRITICAL_AUTH_CALLBACK_ARRIVAL_MISSING:${purpose}`);
  }
  emit({state:'RELEASE_CRITICAL_AUTH_CALLBACK_NAVIGATION',purpose,stage:'STAGING_ARRIVAL_PASS',final_path:safeNavigationPath(page.url(),baseUrl)});
}
async function submitResumeStore(page,baseUrl,supabaseUrl){
  const formAlert=page.locator('form').getByRole('alert');
  const form=page.locator('form');
  const submitButton=page.getByRole('button',{name:'店舗を作成して次へ'});
  const traceKey=`release-critical-resume-${randomUUID()}`;
  const trace={buttonClick:false,formSubmit:false,runtimeErrorCount:0,runtimeErrorClasses:[]};
  let rpcResponse=null;
  const onResponse=response=>{
    try {
      const url=new URL(response.url());
      if(url.origin===new URL(supabaseUrl).origin&&url.pathname==='/rest/v1/rpc/create_store_for_current_user')rpcResponse=response;
    } catch {}
  };
  const recordRuntimeError=error=>{trace.runtimeErrorCount+=1;trace.runtimeErrorClasses.push(safeErrorCode(error));};
  const onPageError=error=>recordRuntimeError(error);
  const onConsole=message=>{if(message.type()==='error')recordRuntimeError(message.text());};
  page.on('response',onResponse);
  page.on('pageerror',onPageError); page.on('console',onConsole);
  try {
    await submitButton.evaluate((button,key)=>{
      button.addEventListener('click',()=>sessionStorage.setItem(`${key}:click`,'1'),{once:true});
      button.form?.addEventListener('submit',()=>sessionStorage.setItem(`${key}:submit`,'1'),{once:true});
    },traceKey);
    const buttonDisabled=await submitButton.isDisabled();
    const formValid=await form.evaluate(node=>node.checkValidity());
    const arrival=page.waitForURL(/\/(onboarding|security\/email-otp)/,{timeout:30_000}).then(()=>({kind:'arrival'})).catch(()=>null);
    const alert=formAlert.waitFor({state:'visible',timeout:30_000}).then(async()=>({kind:'alert',message:await formAlert.textContent()})).catch(()=>null);
    emit({state:'RELEASE_CRITICAL_AUTH_CALLBACK_NAVIGATION',purpose:'signup',stage:'RESUME_STORE_SUBMIT'});
    await submitButton.click();
    trace.buttonClick=await page.evaluate(key=>sessionStorage.getItem(`${key}:click`)==='1',traceKey);
    trace.formSubmit=await page.evaluate(key=>sessionStorage.getItem(`${key}:submit`)==='1',traceKey);
    await page.evaluate(key=>{sessionStorage.removeItem(`${key}:click`);sessionStorage.removeItem(`${key}:submit`);},traceKey);
    const outcome=await Promise.race([arrival,alert,page.waitForTimeout(30_000).then(()=>null)]);
    let rpcStatus='NOT_OBSERVED'; let rpcCode='NONE';
    if(rpcResponse){
      rpcStatus=String(rpcResponse.status());
      try {rpcCode=safeProviderCode((await rpcResponse.json())?.code??'NONE');} catch {rpcCode='NON_JSON';}
    }
    const finalPath=safeNavigationPath(page.url(),baseUrl);
    if(outcome?.kind==='arrival'){
      emit({state:'RELEASE_CRITICAL_AUTH_CALLBACK_NAVIGATION',purpose:'signup',stage:'RESUME_STORE_ARRIVAL_PASS',final_path:finalPath,rpc_status:rpcStatus,rpc_code:rpcCode,button_disabled:buttonDisabled?'YES':'NO',form_valid:formValid?'YES':'NO',dom_button_click:trace.buttonClick?'YES':'NO',dom_form_submit:trace.formSubmit?'YES':'NO',browser_runtime_error_count:trace.runtimeErrorCount,browser_runtime_error_classes:[...new Set(trace.runtimeErrorClasses)]});
      return;
    }
    emit({state:'RELEASE_CRITICAL_AUTH_CALLBACK_NAVIGATION',purpose:'signup',stage:'RESUME_STORE_ARRIVAL_MISSING',final_path:finalPath,rpc_status:rpcStatus,rpc_code:rpcCode,form_alert:outcome?.kind==='alert'?signupAlertClassification(outcome.message):'NONE',button_disabled:buttonDisabled?'YES':'NO',form_valid:formValid?'YES':'NO',dom_button_click:trace.buttonClick?'YES':'NO',dom_form_submit:trace.formSubmit?'YES':'NO',browser_runtime_error_count:trace.runtimeErrorCount,browser_runtime_error_classes:[...new Set(trace.runtimeErrorClasses)]});
    fail('RELEASE_CRITICAL_SIGNUP_RESUME_STORE_ARRIVAL_MISSING');
  } finally {page.off('response',onResponse);page.off('pageerror',onPageError);page.off('console',onConsole);}
}
async function runMachineOnly({baseUrl,supabaseUrl,serviceRole,bypassSecret,provenance}){
  const admin=createClient(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  const run=createReleaseCriticalRun();
  const email=`qa.machine.${run.runId.replaceAll('-','')}@example.invalid`;
  const initialPassword=releaseCriticalSyntheticPassword(run.emailMarker);
  const resetPassword='GL-Release-Reset-8!';
  const results={J1:'EMAIL_TRANSPORT_WAITING',J2:'MECHANICS_PENDING',J3:'PENDING',J4:'MECHANICS_PENDING',J5:'PENDING',J6:'PENDING',J7:'PENDING',J8:'PENDING',J9:'PENDING',J10:'PENDING'};
  let browser; let context; let page; let user; let life; let adopted=false;
  try {
    await verifyHostedRedirectContract({admin,run,baseUrl,supabaseUrl});
    await recoverKnownPartialFixture(admin,provenance,baseUrl,supabaseUrl,serviceRole,bypassSecret);
    // Register the lifecycle before the first Auth mutation.  A successful
    // signup-side create followed by an exception must still have a formal
    // abort/teardown path; otherwise the finally block cannot prove residual
    // zero for a partially-created synthetic user.
    life=lifecycle(admin,run,provenance); await beginLifecycle(life,run,provenance);
    const created=await admin.auth.admin.createUser({email,password:initialPassword,email_confirm:false,app_metadata:{release_qa_run_id:run.runId}});
    if(created.error||!created.data?.user?.id)fail(`RELEASE_CRITICAL_MACHINE_AUTH_CREATE:${safeProviderCode(created.error)}`);
    user=created.data.user;
    user=await bindSyntheticIdentity(admin,user,run);
    browser=await chromium.launch({headless:true}); context=await browser.newContext(); await installVercelBrowserBypass(context,baseUrl,bypassSecret); page=await context.newPage();
    await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await clickAndWait(page,page.getByRole('link',{name:'無料で始める'}).first(),/\/signup/);
    await page.getByLabel('店舗名').fill(`${run.marker} Reject`); await page.getByLabel('担当者名').fill(`${run.marker} Owner`); await page.getByLabel('メールアドレス').fill(email); await page.locator('#password').fill('short1'); await page.locator('#passwordConfirmation').fill('short1'); await page.getByRole('checkbox').check();
    const signupButton=page.getByRole('button',{name:'無料でアカウントを作成する'}); if(!(await signupButton.isDisabled()))fail('RELEASE_CRITICAL_PASSWORD_6_NOT_REJECTED'); await page.locator('#password').fill('short12'); await page.locator('#passwordConfirmation').fill('short12'); if(!(await signupButton.isDisabled()))fail('RELEASE_CRITICAL_PASSWORD_7_NOT_REJECTED'); results.J3='PASS';
    const signupCallback=new URL('/auth/callback',baseUrl); signupCallback.searchParams.set('next',releaseQaNextPathForRunner('/signup?resume=1',run.runId)); signupCallback.searchParams.set('qa_run',run.runId);
    const signupAction=await hostedActionLink(admin,{type:'signup',email,password:initialPassword,redirectTo:signupCallback.toString(),supabaseUrl});
    await followHostedAction(page,signupAction,{baseUrl,expectedPath:'/signup',purpose:'signup'}); if(!new URL(page.url()).searchParams.has('resume'))fail('RELEASE_CRITICAL_AUTH_CALLBACK_RESUME_MISSING'); await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'signup'});
    await page.getByLabel('店舗名').fill(`${run.marker} 店舗`); await page.getByLabel('担当者名').fill(`${run.marker} Owner`); await submitResumeStore(page,baseUrl,supabaseUrl); await completeSecurityOtp(page); await page.waitForURL(/\/onboarding/,{timeout:30_000,waitUntil:'commit'}); await onboarding(page,run.marker); await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'signup',requireStoreCreated:true,requireOnboardingCompleted:true});
    const owner=await activeOwner({baseUrl,supabaseUrl,serviceRole,email,password:initialPassword,tenantNamePrefix:run.marker,bypassSecret,runId:run.runId}); await adoptLifecycleFixture(life,run,{...owner,userId:user.id}); adopted=true; results.J2='MECHANICS_PASS';
    await runVehicleAccountStateMatrix({admin,life,run,baseUrl,supabaseUrl,serviceRole,bypassSecret});
    await clickAndWait(page,page.getByRole('link',{name:'車両',exact:true}).first(),/\/vehicles(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'VEHICLE_CREATE',locator:page.getByRole('link',{name:'車両を登録',exact:true}),expectedPath:'/vehicles/new',accountState:owner.accountState}); await page.getByText('車両登録',{exact:true}).waitFor({timeout:30_000}); await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/vehicles(?:\?|$)/,{timeout:30_000}); await verifyVehicleAccountStateGate({browser,sourceContext:context,baseUrl,bypassSecret,accountState:owner.accountState});
    await clickAndWait(page,page.getByRole('link',{name:'顧客',exact:true}).first(),/\/customers(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'CUSTOMER_CREATE',locator:page.getByRole('link',{name:'顧客を登録',exact:true}),expectedPath:'/customers/new',accountState:owner.accountState}); await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/customers(?:\?|$)/,{timeout:30_000}); await clickAndWait(page,page.getByRole('link',{name:'商談',exact:true}).first(),/\/deals(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'DEAL_CREATE',locator:page.getByRole('link',{name:'商談を登録',exact:true}),expectedPath:'/deals/new',accountState:owner.accountState}); await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/deals(?:\?|$)/,{timeout:30_000});
    await clickAndWait(page,page.getByRole('link',{name:'見積書',exact:true}).first(),/\/quotes(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'QUOTE_CREATE',locator:page.getByRole('link',{name:'見積書を作成',exact:true}),expectedPath:'/quotes/new',accountState:owner.accountState}); await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/quotes(?:\?|$)/,{timeout:30_000});
    await clickAndWait(page,page.getByRole('link',{name:'請求書',exact:true}).first(),/\/invoices(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'INVOICE_CREATE',locator:page.getByRole('link',{name:'請求書を作成',exact:true}),expectedPath:'/invoices/new',accountState:owner.accountState}); await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/invoices(?:\?|$)/,{timeout:30_000});
    await clickAndWait(page,page.getByRole('link',{name:'来店・試乗予約',exact:true}).first(),/\/appointments(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'APPOINTMENT_CREATE',locator:page.getByRole('button',{name:'新しい予約を登録',exact:true}),expectedRender:page.getByRole('button',{name:'予約を登録する',exact:true}),accountState:owner.accountState}); results.J5='PASS';
    await clickAndWait(page,page.getByRole('link',{name:'車両',exact:true}).first(),/\/vehicles(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'VEHICLE_FIRST_VALUE',locator:page.getByRole('link',{name:'車両を登録',exact:true}),expectedPath:'/vehicles/new',accountState:owner.accountState}); await page.getByLabel('車台No').fill(`${run.emailMarker.slice(-12).toUpperCase()}-QA`); await page.getByLabel('メーカー名').fill(`${run.marker} Make`); await page.getByLabel('車名').fill(`${run.marker} Vehicle`); await page.getByRole('button',{name:'車両を登録する'}).click(); await page.waitForURL(/\/vehicles(?:\?|$)/,{timeout:30_000}); const vehicleRow=page.getByRole('button').filter({hasText:`${run.marker} Vehicle`}); await vehicleRow.click(); await tracePointerCta(page,{baseUrl,label:'VEHICLE_DETAIL',locator:page.getByRole('link',{name:'車両詳細を開く',exact:true}),expectedPath:'/vehicles/',accountState:owner.accountState}); await page.getByLabel('メーカー').fill(`${run.marker} Edited`); await page.getByRole('button',{name:'保存する',exact:true}).click(); await page.getByText('車両情報を保存しました。').waitFor({timeout:30_000}); await page.getByRole('link',{name:'車両一覧に戻る',exact:true}).click(); await page.waitForURL(/\/vehicles(?:\?|$)/,{timeout:30_000});
    await clickAndWait(page,page.getByRole('link',{name:'顧客',exact:true}).first(),/\/customers(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'CUSTOMER_FIRST_VALUE',locator:page.getByRole('link',{name:'顧客を登録',exact:true}),expectedPath:'/customers/new',accountState:owner.accountState}); await page.getByLabel('顧客/会社名').fill(`${run.marker} First Value`); await page.getByRole('button',{name:'顧客を登録する'}).click(); await page.waitForURL(/\/customers/,{timeout:30_000}); await page.getByText(`${run.marker} First Value`).waitFor({timeout:30_000}); results.J6='PASS';
    await page.getByRole('link',{name:'メニュー',exact:true}).first().click(); await page.getByRole('link',{name:'プラン・契約',exact:true}).click(); await page.getByText('Free',{exact:true}).first().waitFor(); await page.getByText('無料プラン',{exact:true}).waitFor(); if(await page.getByRole('button',{name:'支払方法・契約を管理'}).count())fail('RELEASE_CRITICAL_FREE_CARDLESS_FAILED'); results.J7='PASS';
    const inquiry=await context.newPage(); await inquiry.goto(baseUrl,{waitUntil:'domcontentloaded'}); await inquiry.keyboard.press('End'); await clickAndWait(inquiry,inquiry.getByRole('link',{name:'ヘルプ',exact:true}),/\/help/); const formalContact=inquiry.getByRole('link',{name:'正式窓口へ問い合わせる'}); if(!(await formalContact.getAttribute('href'))?.startsWith('mailto:'))fail('RELEASE_CRITICAL_INQUIRY_ROUTE_UNAVAILABLE'); await formalContact.click(); await inquiry.close(); results.J8='PASS';
    if(!(await page.getByText('提供準備中').count())||await page.getByText('L-LINK 利用可').count())fail('RELEASE_CRITICAL_LLINK_BOUNDARY_FAILED'); results.J9='PASS'; await runMobileSmoke(baseUrl,chromium,'chromium-mobile',bypassSecret); await runMobileSmoke(baseUrl,webkit,'webkit-mobile',bypassSecret); results.J10='PASS';
    await page.getByRole('link',{name:'ログアウト'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); const recoveryCallback=new URL('/auth/callback',baseUrl); recoveryCallback.searchParams.set('next',releaseQaNextPathForRunner('/auth/reset-password',run.runId)); recoveryCallback.searchParams.set('qa_run',run.runId); const recoveryAction=await hostedActionLink(admin,{type:'recovery',email,password:initialPassword,redirectTo:recoveryCallback.toString(),supabaseUrl}); await followHostedAction(page,recoveryAction,{baseUrl,expectedPath:'/auth/reset-password',purpose:'recovery'}); await page.getByLabel('新しいパスワード').fill(resetPassword); await page.getByLabel('もう一度入力').fill(resetPassword); await page.getByRole('button',{name:'パスワードを変更する'}).click(); await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'recovery',requirePasswordUpdate:true}); await page.getByRole('link',{name:'ログインへ戻る'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); await login(page,email,resetPassword,/\/dashboard/); results.J4='MECHANICS_PASS';
    emit({state:'RELEASE_CRITICAL_MACHINE_GATES_PASS',journeys:results,email_transport:'WAITING_TRANSPORT',auth_callback_mechanics:'PASS',run_marker:run.emailMarker});
  } finally {
    try {
      if(!adopted&&life){
        user??=await maybeFindUser(admin,email);
        if(user?.id){
          const owner=await maybeActiveOwner({baseUrl,supabaseUrl,serviceRole,email,password:initialPassword,tenantNamePrefix:run.marker,bypassSecret,runId:run.runId});
          if(owner){await adoptLifecycleFixture(life,run,{...owner,userId:user.id});adopted=true;}
          else {
            const {error}=await admin.auth.admin.deleteUser(user.id,false);
            if(error&&error.status!==404)fail(`RELEASE_CRITICAL_MACHINE_EARLY_AUTH_DELETE:${error.status??0}`);
            await life.rpc('qa_lifecycle_abort_clean',{p_run_id:run.runId,p_reason:'machine_early_auth_cleanup'});
          }
        } else {
          await life.rpc('qa_lifecycle_abort_clean',{p_run_id:run.runId,p_reason:'machine_pre_auth_cleanup'});
        }
      }
      if(adopted)await cleanupLifecycle(life,admin,user?.id,run.runId);
    } finally {await context?.close();await browser?.close();}
  }
}
async function main(){
  const eventPath=required('GITHUB_EVENT_PATH');
  const baseUrl=await releaseCriticalBaseUrl(eventPath);
  const supabaseUrl=required('E2E_TEST_SUPABASE_URL');
  const serviceRole=required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY');
  const bypassSecret=required('VERCEL_AUTOMATION_BYPASS_SECRET');
  const executionMode=String(process.env.RELEASE_CRITICAL_EXECUTION_MODE??'email_transport').trim();
  const expectedCandidateSha=String(process.env.RELEASE_CRITICAL_CANDIDATE_SHA??'').trim().toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(expectedCandidateSha))fail('RELEASE_CRITICAL_CANDIDATE_SHA_INPUT_INVALID');
  if(!new URL(supabaseUrl).hostname.startsWith(`${STAGING_REF}.`)||new URL(baseUrl).hostname.endsWith('.garage-link.tech'))fail('RELEASE_CRITICAL_STAGING_BOUNDARY_DENIED');
  const provenanceResponse=await fetch(new URL('/api/qa/provenance',baseUrl),{headers:{'x-vercel-protection-bypass':bypassSecret},redirect:'manual',cache:'no-store'}); if(!provenanceResponse.ok||provenanceResponse.headers.has('location'))fail('RELEASE_CRITICAL_PROVENANCE_UNREACHED');
  const provenance=validateReleaseCriticalProvenance(await provenanceResponse.json(),baseUrl); if(provenance.sourceSha!==expectedCandidateSha)fail('RELEASE_CRITICAL_CANDIDATE_SHA_MISMATCH');
  if(executionMode==='machine_only')return runMachineOnly({baseUrl,supabaseUrl,serviceRole,bypassSecret,provenance});
  if(executionMode!=='email_transport')fail('RELEASE_CRITICAL_EXECUTION_MODE_INVALID');
  const manualBase=required('RELEASE_CRITICAL_MANUAL_GMAIL_ADDRESS');
  const admin=createClient(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  // Default SMTP accepts only an authorized organization-member recipient.
  // Keep that mailbox separate from the persistent E2E login identity.
  const run=createReleaseCriticalRun(); const session=createManualGmailSession(manualBase,run.emailMarker,{plusAddressing:false}); const initialPassword=releaseCriticalSyntheticPassword(run.emailMarker); const resetPassword='GL-Release-Reset-8!';
  await verifyHostedRedirectContract({admin,run,baseUrl,supabaseUrl});
  await recoverKnownPartialFixture(admin,provenance,baseUrl,supabaseUrl,serviceRole,bypassSecret);
  if(await maybeFindUser(admin,session.emailAddress))fail('RELEASE_CRITICAL_MANUAL_GMAIL_BASE_USER_CONFLICT');
  let browser; let context; let page; let user; let life; let adopted=false; const results={};
  try {
    life=lifecycle(admin,run,provenance); await beginLifecycle(life,run,provenance);
    browser=await chromium.launch({headless:true}); context=await browser.newContext(); await installVercelBrowserBypass(context,baseUrl,bypassSecret); page=await context.newPage();
    await page.goto(`${baseUrl}${baseUrl.includes('?')?'&':'?'}qa_run=${encodeURIComponent(run.runId)}`,{waitUntil:'domcontentloaded'});
    await clickAndWait(page,page.getByRole('link',{name:'無料で始める'}).first(),/\/signup/);
    const fillSignup=async(password)=>{await page.getByLabel('店舗名').fill(`${run.marker} Signup`);await page.getByLabel('担当者名').fill(`${run.marker} Owner`);await page.getByLabel('メールアドレス').fill(session.emailAddress);await page.locator('#password').fill(password);await page.locator('#passwordConfirmation').fill(password);await page.getByRole('checkbox').check();};
    const signupCallback=new URL('/auth/callback',baseUrl); signupCallback.searchParams.set('next',releaseQaNextPathForRunner('/signup?resume=1',run.runId)); signupCallback.searchParams.set('qa_run',run.runId);
    const signupRequest=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/auth/v1/signup',{timeout:30_000});
    const signupResponse=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/auth/v1/signup',{timeout:30_000});
    await fillSignup(initialPassword); await page.getByRole('button',{name:'無料でアカウントを作成する'}).click();
    const signupRedirect=validateClientAuthRedirect((await signupRequest).url(),signupCallback.toString(),supabaseUrl); emit({state:'RELEASE_CRITICAL_SIGNUP_REDIRECT_REQUEST_PASS',redirect_origin:signupRedirect.origin,redirect_path:signupRedirect.path,localhost:false});
    const authResponse=await signupResponse; const authDetail=await authResponse.json().catch(()=>null); const [localPart,domain]=session.emailAddress.split('@');
    emit({state:'RELEASE_CRITICAL_SIGNUP_PROVIDER_DIAGNOSTIC',http_status:authResponse.status(),provider_error_code:safeProviderCode(authDetail?.code??authDetail?.error_code??authResponse.status()),email_local_length:localPart?.length??0,email_domain_length:domain?.length??0,email_total_length:session.emailAddress.length,run_marker_length:run.emailMarker.length});
    const signupOutcome=await signupSubmitOutcome(page);
    if(signupOutcome.kind==='alert'){
      const alertText=await page.locator('form').getByRole('alert').textContent();
      fail(`RELEASE_CRITICAL_SIGNUP_SUBMIT_ALERT:${signupAlertClassification(alertText)}:${safeSignupAlertDetail(alertText)}`);
    }
    if(signupOutcome.kind==='onboarding'){
      user=await findUser(admin,session.emailAddress);
      user=await bindSyntheticIdentity(admin,user,run);
      const owner=await activeOwner({baseUrl,supabaseUrl,serviceRole,email:session.emailAddress,password:initialPassword,tenantNamePrefix:run.marker,bypassSecret,runId:run.runId});
      await adoptLifecycleFixture(life,run,{...owner,userId:user.id});
      adopted=true;
      fail('RELEASE_CRITICAL_SIGNUP_AUTO_CONFIRMED');
    }
    if(!/確認メールを送信しました/.test(await page.getByRole('status').textContent()??''))fail('RELEASE_CRITICAL_CONFIRMATION_REQUIRED_NOT_PROVEN');
    user=await findUser(admin,session.emailAddress);
    user=await bindSyntheticIdentity(admin,user,run); results.J2='CHECKPOINT'; emit({...manualGmailCheckpoint(session,'signup'),operator_action:'Open the newest Staging-only Gmail confirmation message, verify its redirect target is the Staging HTTPS origin, click it, then complete the displayed store-creation and onboarding flow through the dashboard in that same browser session. A reset message will follow in this same Gmail session; click it and set the synthetic password GL-Release-Reset-8!.'});
    await pollManualGmailConfirmation({admin,userId:user.id,session,purpose:'signup',timeoutMs:CHECKPOINT_TIMEOUT_MS});
    await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'signup',requireStoreCreated:true,requireOnboardingCompleted:true}); results.J1='PASS';
    const owner=await activeOwner({baseUrl,supabaseUrl,serviceRole,email:session.emailAddress,password:initialPassword,tenantNamePrefix:run.marker,bypassSecret,runId:run.runId}); if(!owner.tenantName.startsWith(run.marker))fail('RELEASE_CRITICAL_MARKER_TENANT_MISMATCH');
    await adoptLifecycleFixture(life,run,{...owner,userId:user.id}); adopted=true; results.J2='PASS';
    await page.getByRole('link',{name:'ログイン',exact:true}).last().click(); await page.waitForURL(/\/login/,{timeout:30_000}); await login(page,session.emailAddress,initialPassword,/\/dashboard/);
    const invalid=await context.newPage(); await invalid.goto(baseUrl,{waitUntil:'domcontentloaded'}); await clickAndWait(invalid,invalid.getByRole('link',{name:'無料で始める'}).first(),/\/signup/);
    // The separate page keeps the main owner session intact; fill by concrete UI locators.
    await invalid.getByLabel('店舗名').fill(`${run.marker} Reject`); await invalid.getByLabel('担当者名').fill(`${run.marker} Reject`); await invalid.getByLabel('メールアドレス').fill(session.emailAddress); await invalid.locator('#password').fill('short1'); await invalid.locator('#passwordConfirmation').fill('short1'); await invalid.getByRole('checkbox').check();
    const invalidSignupButton=invalid.getByRole('button',{name:'無料でアカウントを作成する'}); if(!(await invalidSignupButton.isDisabled()))fail('RELEASE_CRITICAL_PASSWORD_6_NOT_REJECTED'); await invalid.locator('#password').fill('short12'); await invalid.locator('#passwordConfirmation').fill('short12'); if(!(await invalidSignupButton.isDisabled()))fail('RELEASE_CRITICAL_PASSWORD_7_NOT_REJECTED'); await invalid.close(); results.J3='PASS';
    await page.getByRole('link',{name:'ログアウト'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); await login(page,session.emailAddress,initialPassword,/\/dashboard/); await page.getByRole('link',{name:'ログアウト'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); await page.getByRole('link',{name:'忘れた方はこちら'}).click(); await page.waitForURL(/\/forgot-password/,{timeout:30_000}); await page.getByLabel('メールアドレス').fill(session.emailAddress); const recoveryCallback=new URL('/auth/callback',baseUrl); recoveryCallback.searchParams.set('next',releaseQaNextPathForRunner('/auth/reset-password',run.runId)); recoveryCallback.searchParams.set('qa_run',run.runId); const recoveryRequest=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/auth/v1/recover',{timeout:30_000}); await page.getByRole('button',{name:'メールを送る'}).click(); const recoveryRedirect=validateClientAuthRedirect((await recoveryRequest).url(),recoveryCallback.toString(),supabaseUrl); emit({state:'RELEASE_CRITICAL_RECOVERY_REDIRECT_REQUEST_PASS',redirect_origin:recoveryRedirect.origin,redirect_path:recoveryRedirect.path,localhost:false}); await page.getByText('再設定メールを送りました。').waitFor({timeout:30_000}); emit({...manualGmailCheckpoint(session,'recovery'),operator_action:'Use the already-open Staging-only Gmail session: click the matching reset link and set the synthetic password GL-Release-Reset-8!.'}); await pollCallbackEvidence({admin,userId:user.id,run,baseUrl,purpose:'recovery',requirePasswordUpdate:true}); await page.getByRole('link',{name:'ログインへ戻る'}).click(); await page.waitForURL(/\/login/,{timeout:30_000}); await login(page,session.emailAddress,resetPassword,/\/dashboard/); results.J4='PASS';
    await clickAndWait(page,page.getByRole('link',{name:'車両',exact:true}).first(),/\/vehicles(?:\?|$)/);
    await tracePointerCta(page,{baseUrl,label:'VEHICLE_CREATE',locator:page.getByRole('link',{name:'車両を登録',exact:true}),expectedPath:'/vehicles/new',accountState:owner.accountState});
    await page.getByText('車両登録',{exact:true}).waitFor({timeout:30_000});
    await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/vehicles(?:\?|$)/,{timeout:30_000});
    await verifyVehicleAccountStateGate({browser,sourceContext:context,baseUrl,bypassSecret,accountState:owner.accountState});
    await clickAndWait(page,page.getByRole('link',{name:'顧客',exact:true}).first(),/\/customers(?:\?|$)/);
    await tracePointerCta(page,{baseUrl,label:'CUSTOMER_CREATE',locator:page.getByRole('link',{name:'顧客を登録',exact:true}),expectedPath:'/customers/new',accountState:owner.accountState});
    await page.getByText('顧客登録',{exact:true}).waitFor({timeout:30_000});
    await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/customers(?:\?|$)/,{timeout:30_000});
    await clickAndWait(page,page.getByRole('link',{name:'商談',exact:true}).first(),/\/deals(?:\?|$)/);
    await tracePointerCta(page,{baseUrl,label:'DEAL_CREATE',locator:page.getByRole('link',{name:'商談を登録',exact:true}),expectedPath:'/deals/new',accountState:owner.accountState});
    await page.getByText('商談登録',{exact:true}).waitFor({timeout:30_000});
    await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(/\/deals(?:\?|$)/,{timeout:30_000});
    results.J5='PASS';
    await clickAndWait(page,page.getByRole('link',{name:'車両',exact:true}).first(),/\/vehicles(?:\?|$)/);
    await tracePointerCta(page,{baseUrl,label:'VEHICLE_FIRST_VALUE',locator:page.getByRole('link',{name:'車両を登録',exact:true}),expectedPath:'/vehicles/new',accountState:owner.accountState});
    await page.getByLabel('車台No').fill(`${run.emailMarker.slice(-12).toUpperCase()}-QA`); await page.getByLabel('メーカー名').fill(`${run.marker} Make`); await page.getByLabel('車名').fill(`${run.marker} Vehicle`); await page.getByRole('button',{name:'車両を登録する'}).click(); await page.waitForURL(/\/vehicles(?:\?|$)/,{timeout:30_000});
    const vehicleRow=page.getByRole('button').filter({hasText:`${run.marker} Vehicle`}); await vehicleRow.click();
    await tracePointerCta(page,{baseUrl,label:'VEHICLE_DETAIL',locator:page.getByRole('link',{name:'車両詳細を開く',exact:true}),expectedPath:'/vehicles/',accountState:owner.accountState});
    // The detail route is the vehicle's edit surface. Save a synthetic-only
    // field through its real button to prove the existing record remains editable.
    await page.getByLabel('メーカー').fill(`${run.marker} Edited`); await page.getByRole('button',{name:'保存する',exact:true}).click(); await page.getByText('車両情報を保存しました。').waitFor({timeout:30_000});
    await page.getByRole('link',{name:'車両一覧に戻る',exact:true}).click(); await page.waitForURL(/\/vehicles(?:\?|$)/,{timeout:30_000});
    await clickAndWait(page,page.getByRole('link',{name:'顧客',exact:true}).first(),/\/customers(?:\?|$)/); await tracePointerCta(page,{baseUrl,label:'CUSTOMER_FIRST_VALUE',locator:page.getByRole('link',{name:'顧客を登録',exact:true}),expectedPath:'/customers/new',accountState:owner.accountState}); await page.getByLabel('顧客/会社名').fill(`${run.marker} First Value`); await page.getByRole('button',{name:'顧客を登録する'}).click(); await page.waitForURL(/\/customers/,{timeout:30_000}); await page.getByText(`${run.marker} First Value`).waitFor({timeout:30_000}); results.J6='PASS';
    await page.getByRole('link',{name:'メニュー',exact:true}).first().click(); await page.getByRole('link',{name:'プラン・契約',exact:true}).click(); await page.getByText('Free',{exact:true}).first().waitFor(); await page.getByText('無料プラン',{exact:true}).waitFor(); if(await page.getByRole('button',{name:'支払方法・契約を管理'}).count())fail('RELEASE_CRITICAL_FREE_CARDLESS_FAILED'); results.J7='PASS';
    let deferredFailure=null;
    try {
      const inquiry=await context.newPage(); await inquiry.goto(baseUrl,{waitUntil:'domcontentloaded'}); await inquiry.keyboard.press('End');
      await clickAndWait(inquiry,inquiry.getByRole('link',{name:'ヘルプ',exact:true}),/\/help/);
      const formalContact=inquiry.getByRole('link',{name:'正式窓口へ問い合わせる'}); const href=await formalContact.getAttribute('href');
      if(!href?.startsWith('mailto:'))fail('RELEASE_CRITICAL_INQUIRY_ROUTE_UNAVAILABLE'); await formalContact.click(); await inquiry.close(); results.J8='PASS';
    } catch(error) {results.J8=`FAIL:${safeErrorCode(error)}`;deferredFailure=error;emit({journey:'J8',status:'FAIL',code:safeErrorCode(error)});}
    if(!(await page.getByText('提供準備中').count())||await page.getByText('L-LINK 利用可').count())fail('RELEASE_CRITICAL_LLINK_BOUNDARY_FAILED'); results.J9='PASS';
    await runMobileSmoke(baseUrl,chromium,'chromium-mobile',bypassSecret); await runMobileSmoke(baseUrl,webkit,'webkit-mobile',bypassSecret); results.J10='PASS';
    if(deferredFailure)throw deferredFailure;
    emit({state:'RELEASE_CRITICAL_JOURNEYS_PASS',journeys:results,run_marker:run.emailMarker});
  } finally {
    try {
      if(!adopted&&life){
        user??=await maybeFindUser(admin,session.emailAddress);
        if(user?.id){
          const owner=await maybeActiveOwner({baseUrl,supabaseUrl,serviceRole,email:session.emailAddress,password:initialPassword,tenantNamePrefix:run.marker,bypassSecret,runId:run.runId});
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
