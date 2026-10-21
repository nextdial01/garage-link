import test from 'node:test';
import assert from 'node:assert/strict';
import {armResponseWait} from '../../scripts/qa/lifecycle-core.mjs';

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
