import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createMailSlurpRunInbox, deleteMailSlurpRunInbox, waitForMailSlurpAction, withMailSlurpRunInbox } from '../../scripts/qa/release-critical-preflight.mjs';

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
  assert.match(runner,/MAILSLURP_API_KEY_INVALID_OR_UNAVAILABLE/);
  assert.match(runner,/\/userInfo/);
  assert.match(runner,/\/inboxes\/withDefaults/);
  assert.match(runner,/\/waitFor/);
  assert.match(runner,/MAILSLURP_INBOX_DELETE_FAILED/);
  assert.match(runner,/MAILSLURP_ACTION_LINK_AMBIGUOUS_OR_MISSING/);
  assert.match(runner,/MAILSLURP_EMAIL_RECIPIENT_OR_MARKER_MISMATCH/);
  assert.doesNotMatch(runner,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(runner,/method:'PATCH'/);
  assert.doesNotMatch(runner,/STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(workflow,/environment: garage-link-commercial-staging/);
  assert.match(workflow,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  assert.match(workflow,/GARAGE_STAGING_MAILSLURP_API_KEY/);
  assert.doesNotMatch(workflow,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(workflow,/STRIPE_SECRET_KEY|E2E_ALLOW_BILLING_MUTATIONS|STRIPE_WEBHOOK_SECRET/);
});

test('MailSlurp run inbox binds the synthetic recipient, extracts one matching action link, and deletes in finally',async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/inboxes/withDefaults'))return Response.json({id:'inbox-1',name:'garage-link-12345678',emailAddress:'qa-run@mailslurp.test'});
    if(url.endsWith('/waitFor'))return Response.json([{to:['qa-run@mailslurp.test'],body:'Confirm <https://gaytoojzwqkpuvfofeql.supabase.co/auth/v1/verify?token=opaque&type=signup&redirect_to=https%3A%2F%2Fgarage-link-staging.vercel.app%2Fsignup%3Fresume%3D1>'}]);
    if(url.endsWith('/inboxes/inbox-1'))return new Response(null,{status:204});
    throw new Error(`unexpected:${url}`);
  };
  const marker='garage-link-12345678';
  const inbox=await createMailSlurpRunInbox('secret',marker,fetchImpl);
  const link=await waitForMailSlurpAction({apiKey:'secret',inbox,runMarker:marker,expectedType:'signup',baseUrl:new URL('https://garage-link-staging.vercel.app'),fetchImpl});
  assert.match(link,/type=signup/);
  await deleteMailSlurpRunInbox('secret',inbox,marker,fetchImpl);
  assert.equal(calls[0].options.headers['x-api-key'],'secret');
  assert.equal(calls.at(-1).options.method,'DELETE');

  await assert.rejects(()=>createMailSlurpRunInbox('secret',marker,async()=>Response.json({id:'inbox-3',name:'other-run',emailAddress:'qa-run-3@mailslurp.test'})),/MAILSLURP_INBOX_MARKER_MISMATCH/);

  const cleanupCalls=[];
  await assert.rejects(()=>withMailSlurpRunInbox({apiKey:'secret',runMarker:marker,run:async()=>{throw new Error('journey failed')},fetchImpl:async(url,options={})=>{cleanupCalls.push(options.method);if(options.method==='POST')return Response.json({id:'inbox-2',name:marker,emailAddress:'qa-run-2@mailslurp.test'});return new Response(null,{status:204})}}),/journey failed/);
  assert.deepEqual(cleanupCalls,['POST','DELETE']);
});
