import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../scripts/qa/lifecycle.mjs',import.meta.url),'utf8');
const abort=source.slice(source.indexOf('async function abortSafe(){'),source.indexOf('async function dispatch('));
test('failed TEST_RUNNING can enter marked safe cleanup without rerunning tests',async()=>{
  let state='FAILED_RECOVERABLE';const calls=[];
  const dependencies={status:async()=>({state,last_successful_state:'TEST_RUNNING',fixtures:[{}]}),
    transition:async(from,to,action,failure,detail)=>{assert.equal(state,from);state=to;calls.push({from,to,detail});},
    teardownDryRun:async()=>{assert.equal(state,'TEST_COMPLETE');calls.push('dry-run');},
    teardown:async()=>calls.push('teardown'),verifyClean:async()=>({clean:true}),
    revokeBypass:async()=>assert.fail(),removeCheckpoint:async()=>assert.fail(),rpc:async()=>assert.fail()};
  const fn=new Function('d','const {status,transition,teardownDryRun,teardown,verifyClean,revokeBypass,removeCheckpoint,rpc}=d;'+abort+';return abortSafe;')(dependencies);
  assert.deepEqual(await fn(),{clean:true});
  assert.deepEqual(calls.map(c=>typeof c==='string'?c:c.to),['TEST_RUNNING','TEST_COMPLETE','dry-run','teardown']);
  assert.equal(calls[0].detail.recovered_failed_test_for_cleanup,true);
  assert.equal(calls[1].detail.safe_abort,true);
});
