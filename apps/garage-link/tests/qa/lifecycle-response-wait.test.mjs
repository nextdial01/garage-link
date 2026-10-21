import test from 'node:test';
import assert from 'node:assert/strict';
import {armResponseWait} from '../../scripts/qa/lifecycle-core.mjs';
import {readFileSync} from 'node:fs';

test('lifecycle login matches the retired OTP page and current password-session contract', () => {
  const runner=readFileSync(new URL('../../scripts/qa/lifecycle.mjs',import.meta.url),'utf8');
  const auth=runner.slice(runner.indexOf('async function auth(){'),runner.indexOf('async function verifySidebarLayout'));
  const otpPage=readFileSync(new URL('../../src/app/security/email-otp/page.tsx',import.meta.url),'utf8');
  assert.match(otpPage,/redirect\('\/dashboard'\)/);
  assert.doesNotMatch(runner,/admin-email-otp|garage_admin_email_verified|Preview QA/);
  const stale=runner.slice(runner.indexOf('async function verifyStaleSessionRecovery(){'),runner.indexOf('async function runTests()'));
  assert.match(stale,/waitForURL\(\/\\\/dashboard/);
  assert.match(stale,/STALE_SESSION_FRESH_COOKIE_MISSING/);
  assert.match(auth,/PASSWORD_LOGIN_FAILED/);
  assert.match(auth,/DASHBOARD_NOT_REACHED/);
  assert.match(auth,/TRUSTED_SESSION_COOKIE_MISSING/);
  assert.match(auth,/auth_contract:'password-session-dashboard'/);
});

test('response timeout is handled immediately even when consumed later', async () => {
  const unhandled=[];
  const listener=error=>unhandled.push(error);
  process.on('unhandledRejection',listener);
  try {
    const wait=armResponseWait({waitForResponse:()=>Promise.reject(Error('private diagnostic'))},'/login','LOGIN_MISSING');
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(unhandled,[]);
    await assert.rejects(wait(),error=>error.failureClass==='AUTHENTICATION'&&error.message==='LOGIN_MISSING'&&!error.cause);
  } finally {process.off('unhandledRejection',listener);}
});

test('armed response preserves exact pathname predicate and actual response', async () => {
  const response={status:()=>200};
  const wait=armResponseWait({waitForResponse(predicate){
    assert.equal(predicate({url:()=> 'https://staging.garage-link.tech/api/login?x=1'}),true);
    assert.equal(predicate({url:()=> 'https://staging.garage-link.tech/api/login-other'}),false);
    return Promise.resolve(response);
  }},'/api/login','LOGIN_MISSING');
  assert.equal(await wait(),response);
});
