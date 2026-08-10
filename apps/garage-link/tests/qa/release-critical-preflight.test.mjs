import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createManualGmailSession, manualGmailCheckpoint, manualGmailWorkflowInput, pollManualGmailConfirmation } from '../../scripts/qa/release-critical-preflight.mjs';

const appRoot=resolve(import.meta.dirname,'../..');

test('remote release-critical preflight is Staging-only and non-billing',async()=>{
  const [runner,workflow]=await Promise.all([
    readFile(resolve(appRoot,'scripts/qa/release-critical-preflight.mjs'),'utf8'),
    readFile(resolve(appRoot,'../../.github/workflows/garage-link-release-critical.yml'),'utf8'),
  ]);
  assert.match(runner,/gaytoojzwqkpuvfofeql/);
  assert.match(runner,/wmlpuzuskfiwdipluglz/);
  assert.match(runner,/auth\.admin\.listUsers/);
  assert.match(runner,/config\/auth/);
  assert.match(runner,/x-vercel-protection-bypass/);
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
  assert.match(runner,/VERCEL_DEPLOYMENT_PROVENANCE_INVALID/);
  assert.match(runner,/deployment\.meta\?\.githubCommitSha/);
  assert.match(runner,/VERCEL_DEPLOYMENT_READ_FAILED/);
  assert.doesNotMatch(runner,/\/v9\/projects\//);
  assert.doesNotMatch(runner,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(runner,/method:'PATCH'/);
  assert.doesNotMatch(runner,/STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(workflow,/environment: garage-link-commercial-staging/);
  assert.match(workflow,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  assert.match(workflow,/manual_gmail_address/);
  assert.doesNotMatch(workflow,/MANUAL_GMAIL_ADDRESS/);
  assert.doesNotMatch(workflow,/release_sha|release_branch|EXPECTED_RELEASE_SHA|EXPECTED_RELEASE_BRANCH/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_MAILSLURP_API_KEY/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(workflow,/STRIPE_SECRET_KEY|E2E_ALLOW_BILLING_MUTATIONS|STRIPE_WEBHOOK_SECRET/);
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
});
