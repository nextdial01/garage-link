import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createManualGmailSession, fetchVerifiedVercelRequest, manualGmailCheckpoint, manualGmailWorkflowInput, pollManualGmailConfirmation, readAuthConfig, readManagementProfile, releaseCriticalBaseUrl } from '../../scripts/qa/release-critical-preflight.mjs';
import { createReleaseCriticalRun, releaseCriticalSyntheticPassword, validateReleaseCriticalProvenance } from '../../scripts/qa/release-critical-journeys.mjs';
import { applyStagingPasswordMinimum } from '../../scripts/qa/release-critical-stage-auth.mjs';

const appRoot=resolve(import.meta.dirname,'../..');

test('remote release-critical preflight is Staging-only and non-billing',async()=>{
  const [runner,journeys,workflow]=await Promise.all([
    readFile(resolve(appRoot,'scripts/qa/release-critical-preflight.mjs'),'utf8'),
    readFile(resolve(appRoot,'scripts/qa/release-critical-journeys.mjs'),'utf8'),
    readFile(resolve(appRoot,'../../.github/workflows/garage-link-release-critical.yml'),'utf8'),
  ]);
  assert.match(runner,/gaytoojzwqkpuvfofeql/);
  assert.match(runner,/wmlpuzuskfiwdipluglz/);
  assert.match(runner,/auth\.admin\.listUsers/);
  assert.match(runner,/config\/auth/);
  assert.match(runner,/x-vercel-protection-bypass/);
  assert.doesNotMatch(runner,/const bypassHeaders=\{'x-vercel-protection-bypass':bypassSecret,'x-vercel-set-bypass-cookie'/);
  assert.match(runner,/\/api\/health/);
  assert.match(runner,/bypass\.status<200\|\|bypass\.status>=300/);
  assert.match(runner,/VERCEL_AUTOMATION_BYPASS_PASS/);
  assert.match(runner,/manual_gmail/);
  assert.match(runner,/MANUAL_GMAIL_CHECKPOINT_SIGNUP/);
  assert.match(runner,/MANUAL_GMAIL_CHECKPOINT_RESET/);
  assert.match(runner,/MANUAL_GMAIL_CHECKPOINT_TIMEOUT/);
  assert.match(runner,/auth\.admin\.getUserById/);
  assert.match(runner,/REDACTED_MANUAL_GMAIL_ADDRESS/);
  assert.match(runner,/GITHUB_EVENT_PATH/);
  assert.match(runner,/event\?\.inputs\?\.manual_gmail_address/);
  assert.match(runner,/RUNTIME_PROVENANCE_ACCESS_FAILED/);
  assert.match(runner,/PREFLIGHT_VERCEL_REDIRECT_DIAGNOSTIC/);
  assert.match(runner,/fetchVerifiedVercelRequest/);
  assert.match(runner,/\/api\/qa\/provenance/);
  assert.match(runner,/RUNTIME_PROVENANCE_RESPONSE_SHAPE_INVALID/);
  assert.match(runner,/readManagementProfile/);
  assert.match(runner,/redirect:'manual'/);
  assert.match(runner,/SUPABASE_MANAGEMENT_REDIRECT_UNSAFE/);
  assert.match(runner,/provenance\.git_commit_sha/);
  assert.doesNotMatch(runner,/\/v9\/projects\//);
  assert.doesNotMatch(runner,/api\.vercel\.com\/v13\/deployments/);
  assert.doesNotMatch(runner,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(runner,/method:'PATCH'/);
  assert.doesNotMatch(runner,/STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(journeys,/qa_lifecycle_adopt_fixture/);
  assert.match(journeys,/qa_lifecycle_verify_clean/);
  assert.match(journeys,/manualGmailCheckpoint\(session,'signup'\)/);
  assert.match(journeys,/manualGmailCheckpoint\(session,'recovery'\)/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_SUBMIT_ALERT/);
  assert.match(journeys,/REDIRECT_URL_NOT_ALLOWED/);
  assert.match(journeys,/UNKNOWN_MESSAGE_SHA256/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_AUTO_CONFIRMED/);
  assert.match(journeys,/RELEASE_CRITICAL_SIGNUP_OUTCOME_UNOBSERVED/);
  assert.match(journeys,/RELEASE_CRITICAL_INQUIRY_ROUTE_UNAVAILABLE/);
  assert.doesNotMatch(journeys,/STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(workflow,/environment: garage-link-commercial-staging/);
  assert.match(workflow,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  assert.match(workflow,/manual_gmail_address/);
  assert.match(workflow,/staging_base_url/);
  assert.doesNotMatch(workflow,/MANUAL_GMAIL_ADDRESS/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_VERCEL_READ_TOKEN|GARAGE_STAGING_VERCEL_PROJECT_ID|GARAGE_STAGING_VERCEL_TEAM_ID/);
  assert.doesNotMatch(workflow,/release_sha|release_branch|EXPECTED_RELEASE_SHA|EXPECTED_RELEASE_BRANCH/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_MAILSLURP_API_KEY/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(workflow,/STRIPE_SECRET_KEY|E2E_ALLOW_BILLING_MUTATIONS|STRIPE_WEBHOOK_SECRET/);
  assert.match(workflow,/Release-critical acquisition journeys/);
  assert.match(workflow,/release-critical-journeys\.mjs/);
});

test('Vercel bypass carries the issued cookie once for a same-origin same-path redirect',async()=>{
  const calls=[];
  const url=new URL('https://garage-link-staging.example.vercel.app/api/qa/provenance');
  const headers={'x-vercel-protection-bypass':'secret'};
  const result=await fetchVerifiedVercelRequest(url,headers,async(requestUrl,requestOptions)=>{
    calls.push({url:String(requestUrl),options:requestOptions});
    if(calls.length===1)return new Response(null,{status:307,headers:{location:`${url}?__vercel_retry=1`,'set-cookie':'__vercel_bypass=issued; Path=/; HttpOnly'}});
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(result.initial.same_origin,true);
  assert.equal(result.initial.same_path,true);
  assert.equal(result.response.status,200);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers,headers);
  assert.equal(calls[1].options.headers['x-vercel-protection-bypass'],'secret');
  assert.equal(calls[1].options.headers.cookie,'__vercel_bypass=issued');
  assert.ok(calls.every(call=>call.options.redirect==='manual'));
});

test('Vercel bypass does not follow a cross-origin redirect',async()=>{
  const calls=[];
  const result=await fetchVerifiedVercelRequest(new URL('https://garage-link-staging.example.vercel.app/api/qa/provenance'),{},async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response(null,{status:307,headers:{location:'https://vercel.com/login'}});
  });
  assert.equal(result.initial.same_origin,false);
  assert.equal(calls.length,1);
  assert.equal(result.response.status,307);
});

test('Management API diagnosis reads profile once and follows only a same-origin canonical Auth redirect',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('/v1/profile'))return new Response('{}',{status:200});
    if(String(url).endsWith('/config/auth'))return new Response(null,{status:307,headers:{location:`${String(url)}/`}});
    if(String(url).endsWith('/config/auth/'))return new Response(JSON.stringify({password_min_length:6}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected request');
  };
  const profile=await readManagementProfile('secret',fetchImpl);
  assert.equal(profile.status,200);
  const auth=await readAuthConfig('gaytoojzwqkpuvfofeql','secret',fetchImpl);
  assert.equal(auth.initial.status,307);
  assert.deepEqual(auth.initial.location,{origin:'https://api.supabase.com',pathname:'/v1/projects/gaytoojzwqkpuvfofeql/config/auth/'});
  assert.equal(auth.initial.same_origin,true);
  assert.equal(auth.initial.same_path,false);
  assert.equal(auth.config.password_min_length,6);
  assert.equal(calls.length,3);
  assert.ok(calls.every(call=>call.options.redirect==='manual'));
  assert.ok(calls.every(call=>call.options.headers.authorization==='Bearer secret'));
});

test('Management API diagnosis fails closed without forwarding Authorization across origins',async()=>{
  const calls=[];
  await assert.rejects(()=>readAuthConfig('gaytoojzwqkpuvfofeql','secret',async(url,options)=>{
    calls.push({url:String(url),options});
    return new Response(null,{status:307,headers:{location:'https://example.invalid/config/auth'}});
  }),/SUPABASE_MANAGEMENT_REDIRECT_UNSAFE/);
  assert.equal(calls.length,1);
});

test('Manual Gmail Bridge creates a plus address, redacts checkpoints, and polls Auth confirmation',async()=>{
  const marker='garage-link-12345678';
  const session=createManualGmailSession('Owner.Name+old@kannagi-co.com',marker);
  assert.equal(session.emailAddress,'owner.name+garage-link-12345678@kannagi-co.com');
  assert.deepEqual(manualGmailCheckpoint(session,'signup'),{state:'MANUAL_GMAIL_CHECKPOINT_SIGNUP',email_mode:'manual_gmail',run_marker:marker,recipient:'REDACTED_MANUAL_GMAIL_ADDRESS',operator_action:'Open the matching Staging-only Gmail message and click its Supabase confirmation link.'});
  assert.equal(manualGmailCheckpoint(session,'recovery').state,'MANUAL_GMAIL_CHECKPOINT_RESET');
  const admin={auth:{admin:{getUserById:async()=>({data:{user:{email:session.emailAddress,email_confirmed_at:'2026-08-10T00:00:00.000Z'}},error:null})}}};
  assert.deepEqual(await pollManualGmailConfirmation({admin,userId:'staging-user',session,purpose:'signup'}),{state:'MANUAL_GMAIL_CONFIRMED',email_mode:'manual_gmail',run_marker:marker,purpose:'signup'});
  const requestedAt='2026-08-10T00:00:00.000Z';
  const resetAdmin={auth:{admin:{getUserById:async()=>({data:{user:{email:session.emailAddress,email_confirmed_at:'2026-08-10T00:00:00.000Z',updated_at:'2026-08-10T00:00:01.000Z'}},error:null})}}};
  assert.deepEqual(await pollManualGmailConfirmation({admin:resetAdmin,userId:'staging-user',session,purpose:'recovery',requestedAt}),{state:'MANUAL_GMAIL_CONFIRMED',email_mode:'manual_gmail',run_marker:marker,purpose:'recovery'});
  await assert.rejects(()=>pollManualGmailConfirmation({admin:{auth:{admin:{getUserById:async()=>({data:{user:{email:session.emailAddress,email_confirmed_at:'2026-08-10T00:00:00.000Z',updated_at:requestedAt}},error:null})}}},userId:'staging-user',session,purpose:'recovery',requestedAt,timeoutMs:0}),/MANUAL_GMAIL_CHECKPOINT_TIMEOUT:recovery/);
  assert.throws(()=>createManualGmailSession('not an email',marker),/MANUAL_GMAIL_PLUS_ADDRESS_UNAVAILABLE/);
  assert.equal(await manualGmailWorkflowInput('/github/event.json',async()=>JSON.stringify({inputs:{manual_gmail_address:'Owner.Name@kannagi-co.com'}})),'Owner.Name@kannagi-co.com');
  await assert.rejects(()=>manualGmailWorkflowInput('/github/event.json',async()=>JSON.stringify({inputs:{}})),/MANUAL_GMAIL_WORKFLOW_INPUT_MISSING/);
  assert.equal(await releaseCriticalBaseUrl('/github/event.json','https://fallback.invalid',async()=>JSON.stringify({inputs:{staging_base_url:'https://garage-link-staging-3ilbylboz-altos-projects-fa55063c.vercel.app'}})),'https://garage-link-staging-3ilbylboz-altos-projects-fa55063c.vercel.app/');
  await assert.rejects(()=>releaseCriticalBaseUrl('/github/event.json','https://fallback.invalid',async()=>JSON.stringify({inputs:{staging_base_url:'https://example.invalid'}})),/RELEASE_CRITICAL_STAGING_BASE_URL_DENIED/);
});

test('release-critical journeys accept only the Staging runtime and marker-bound synthetic fixtures',()=>{
  const run=createReleaseCriticalRun('550e8400-e29b-41d4-a716-446655440000');
  assert.equal(run.marker,'[RELEASE QA 20260811]');
  assert.match(run.emailMarker,/^garage-link-[a-z0-9-]{8,}$/);
  assert.match(releaseCriticalSyntheticPassword(run.emailMarker),/^GL-[a-z0-9-]+-8!$/);
  assert.deepEqual(validateReleaseCriticalProvenance({
    project_id:'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3',deployment_id:'dpl_Abc123',git_commit_sha:'d7974d6b9adc78064010cc6b4502f54adbc39ba5',git_commit_ref:'codex/garage-link-supabase-redirect-rca',deployment_url:'https://garage-link-staging-test.vercel.app',environment:'preview',
  },'https://garage-link-staging-test.vercel.app'),{
    projectId:'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3',deploymentId:'dpl_Abc123',sourceSha:'d7974d6b9adc78064010cc6b4502f54adbc39ba5',branch:'codex/garage-link-supabase-redirect-rca',deploymentUrl:'https://garage-link-staging-test.vercel.app',
  });
  assert.throws(()=>validateReleaseCriticalProvenance({
    project_id:'prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64',deployment_id:'dpl_Abc123',git_commit_sha:'d7974d6b9adc78064010cc6b4502f54adbc39ba5',git_commit_ref:'main',deployment_url:'https://garage-link.tech',environment:'production',
  },'https://garage-link.tech'),/RELEASE_CRITICAL_PROVENANCE_DENIED/);
});

test('hosted Auth password update is Staging-only and requires an 8-character read-back',async()=>{
  const calls=[];
  await applyStagingPasswordMinimum('token',async(url,options)=>{
    calls.push({url:String(url),options});
    if(options.method==='PATCH')return new Response('{}',{status:200});
    return new Response(JSON.stringify({password_min_length:8}),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.method,'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body),{password_min_length:8});
  assert.ok(calls.every(call=>call.url.includes('gaytoojzwqkpuvfofeql')));
  await assert.rejects(()=>applyStagingPasswordMinimum('token',async()=>new Response(JSON.stringify({password_min_length:6}),{status:200,headers:{'content-type':'application/json'}})),/STAGING_PASSWORD_MINIMUM_READBACK_FAILED/);
});
