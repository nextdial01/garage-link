import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTRACT,coded,selectGeneratedBypass,assertBypassAbsent} from '../../scripts/qa/lifecycle-core.mjs';

const source=readFileSync(new URL('../../scripts/qa/lifecycle.mjs',import.meta.url),'utf8');
const start=source.indexOf('async function ensureBypass()');
const end=source.indexOf('async function launchProbe',start);
assert.ok(start>=0&&end>start);
const functions=source.slice(start,end);
const runId='11111111-1111-4111-8111-111111111111';
const note=`GARAGE LINK QA ${runId}`;
const old='A'.repeat(32),owned='B'.repeat(32);

function harness({writeFails=false,existingOwned=false,wrongProject=false}={}) {
  const entries={[old]:{scope:'automation-bypass',note:'unrelated'}};
  if(existingOwned)entries[owned]={scope:'automation-bypass',note};
  const calls=[],storage=new Map();
  const dependencies={CONTRACT,coded,selectGeneratedBypass,assertBypassAbsent,
    keychainRead(service){if(!storage.has(service))throw Error('ABSENT');return storage.get(service);},
    keychainWrite(service,value){if(writeFails)throw Error('WRITE_FAILED');storage.set(service,value);},
    keychainDelete(service){storage.delete(service);},
    async vercelApi(path,options={}){
      calls.push({path,method:options.method??'GET',body:options.body?JSON.parse(options.body):null});
      if(!options.method)return{id:CONTRACT.vercelProjectId,accountId:wrongProject?'other':CONTRACT.vercelTeamId,protectionBypass:{...entries}};
      const body=JSON.parse(options.body);
      if(body.generate){assert.equal(body.generate.secret,undefined);entries[owned]={scope:'automation-bypass',note:body.generate.note};}
      if(body.revoke){assert.equal(body.revoke.regenerate,false);delete entries[body.revoke.secret];}
      return{protectionBypass:{...entries}};
    }};
  const execute=new Function('dependencies','const {CONTRACT,coded,selectGeneratedBypass,assertBypassAbsent,keychainRead,keychainWrite,keychainDelete,vercelApi}=dependencies;let bypassSecret="";const bypassService="test-only",runId='+JSON.stringify(runId)+';'+functions+';return {ensureBypass,revokeBypass};');
  return{...execute(dependencies),calls,entries,storage};
}

test('actual bypass functions use server generation and remove only own entry',async()=>{
  const h=harness();
  assert.equal((await h.ensureBypass()).reused,false);
  assert.ok(h.storage.has('test-only'));
  assert.equal((await h.revokeBypass()).verified_absent,true);
  assert.deepEqual(Object.keys(h.entries),[old]);
  assert.equal(h.storage.size,0);
  assert.equal(h.calls.some(c=>c.method==='GET'&&c.path.endsWith('/protection-bypass')),false);
});
test('failed Keychain write rolls back newly created access without touching existing access',async()=>{
  const h=harness({writeFails:true});
  await assert.rejects(()=>h.ensureBypass(),/WRITE_FAILED/);
  assert.deepEqual(Object.keys(h.entries),[old]);
});
test('interrupted exact-run generation is recovered without creating another bypass',async()=>{
  const h=harness({existingOwned:true});
  assert.equal((await h.ensureBypass()).recovered_exact_run,true);
  assert.equal(h.calls.filter(c=>c.body?.generate).length,0);
});
test('cleanup recovers own remote entry when no local Keychain item exists',async()=>{
  const h=harness({existingOwned:true});
  assert.equal((await h.revokeBypass()).verified_absent,true);
  assert.deepEqual(Object.keys(h.entries),[old]);
});
test('wrong project account refuses generation before any mutation',async()=>{
  const h=harness({wrongProject:true});
  await assert.rejects(()=>h.ensureBypass(),/PROJECT_IDENTITY_MISMATCH/);
  assert.equal(h.calls.some(c=>c.method!=='GET'),false);
});
test('cached entry does not hide another exact-run bypass during cleanup',async()=>{
  const h=harness({existingOwned:true}),duplicate='C'.repeat(32);
  h.storage.set('test-only',owned);
  h.entries[duplicate]={scope:'automation-bypass',note};
  await h.revokeBypass();
  assert.deepEqual(Object.keys(h.entries),[old]);
});
