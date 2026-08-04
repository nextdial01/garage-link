import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertRunId,assertSafeContract,classifyFailure,fixtureIdentity,nextAfter,removeCheckpoint,transitionAllowed,validateServiceKey,writeCheckpoint } from '../../scripts/qa/lifecycle-core.mjs';

const runId='11111111-1111-4111-8111-111111111111';
test('run id is mandatory and UUIDv4',()=>{assert.equal(assertRunId(runId),runId);assert.throws(()=>assertRunId('missing'))});
test('production project and domain are denied',()=>{assert.throws(()=>assertSafeContract({projectRef:'wmlpuzuskfiwdipluglz'}));assert.throws(()=>assertSafeContract({canonical:'https://garage-link.tech'}))});
test('invalid key and wrong role are credential failures',()=>{assert.throws(()=>validateServiceKey('invalid'));const payload=Buffer.from(JSON.stringify({role:'anon'})).toString('base64url');assert.throws(()=>validateServiceKey(`x.${payload}.y`))});
test('invalid transition and state skipping are rejected',()=>{assert.equal(transitionAllowed('CREATED','PREFLIGHT_RUNNING'),true);assert.equal(transitionAllowed('CREATED','PROVISIONED'),false);assert.equal(transitionAllowed('TEARDOWN_READY','COMPLETE'),false)});
test('recoverable state resumes at the next incomplete action',()=>{assert.equal(nextAfter('TEST_COMPLETE'),'teardown-dry-run');assert.equal(nextAfter('DB_CLEANED'),'teardown')});
test('checkpoint rejects secret and PII fields',async()=>{const root=await mkdtemp(join(tmpdir(),'qa-lifecycle-'));await assert.rejects(()=>writeCheckpoint(root,runId,{password:'secret'}));await assert.rejects(()=>writeCheckpoint(root,runId,{email:'qa@example.invalid'}));await writeCheckpoint(root,runId,{state:'PREFLIGHT_READY',next_action:'provision'});const saved=JSON.parse(await readFile(join(root,'.qa-runs',`${runId}.json`),'utf8'));assert.equal(saved.state,'PREFLIGHT_READY');await removeCheckpoint(root,runId)});
test('fixture identities contain no credentials',()=>{const value=fixtureIdentity(runId);assert.match(value.marker,/^\[CANARY QA \d{8}\]$/);assert.equal(JSON.stringify(value).includes('@'),false)});

for(const [name,message,expected] of [
  ['missing Keychain','KEYCHAIN_ITEM_UNAVAILABLE','CREDENTIAL'],['wrong project','PROJECT_MISMATCH','CREDENTIAL'],
  ['OTP rejection','OTP_REQUEST_FAILED','AUTHENTICATION'],['cookie missing','TRUSTED_SESSION_COOKIE_MISSING','AUTHENTICATION'],
  ['host mismatch','CANONICAL_HOST_MISMATCH','VERCEL_PROTECTION'],['staff limit','CAPACITY_LIMIT','CAPACITY'],
  ['duplicate fixture','DUPLICATE_FIXTURE','CAPACITY'],['browser binary missing','WEBKIT_EXECUTABLE_MISSING','BROWSER'],
  ['protection without bypass','VERCEL_BYPASS_FAILED','VERCEL_PROTECTION'],['last owner','LAST_OWNER_REJECTED','FIXTURE_LIFECYCLE'],
  ['unregistered registry','FIXTURE_NOT_REGISTERED','FIXTURE_LIFECYCLE'],['marker mismatch','MARKER_MISMATCH','FIXTURE_LIFECYCLE'],
  ['expired run','QA_RUN_EXPIRED','FIXTURE_LIFECYCLE'],['business residual','ZERO_RESIDUAL_FAILED','FIXTURE_LIFECYCLE'],
  ['Stripe residual','STRIPE_ID_PRESENT','FIXTURE_LIFECYCLE'],['LINE residual','LINE_CONNECTION_PRESENT','FIXTURE_LIFECYCLE'],
  ['uploaded file residual','UPLOADED_FILE_PRESENT','FIXTURE_LIFECYCLE'],['FK residual','FOREIGN KEY BLOCKED','FIXTURE_LIFECYCLE'],
  ['Auth hard-delete','AUTH_HARD_DELETE_FAILED','AUTHENTICATION'],['runner interruption','RUNNER_INTERRUPTION','EXECUTION_LIFECYCLE'],
]) test(`failure injection classification: ${name}`,()=>assert.equal(classifyFailure(new Error(message)),expected));
