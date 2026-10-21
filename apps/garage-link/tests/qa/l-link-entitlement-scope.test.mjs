import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const file=new URL('../../src/lib/billing/lLinkContract.ts',import.meta.url);
const source=stripTypeScriptTypes(readFileSync(file,'utf8').replace(/^import[^;]*;\s*$/gm,''),{mode:'strip'}).replace(/export /g,'');
const store='11111111-1111-4111-8111-111111111111',tenant='22222222-2222-4222-8222-222222222222';
function setup({scope=[{store_id:store,tenant_id:tenant,store_status:'active'}],scopeError=null,enabled=true,clientMissing=false}={}) {
  const calls=[];
  const client={async rpc(name,args){calls.push({name,args});return{data:scope,error:scopeError};},from(table){assert.equal(table,'company_subscriptions','service role cannot SELECT stores directly');calls.push({table});const q={select(){return q},eq(key,value){calls.push({key,value});return q},maybeSingle(){return Promise.resolve({data:{l_link_integration_enabled:enabled},error:null})}};return q}};
  const fn=new Function('createAdminClient',source+';return canStoreUseLLink;')(()=>clientMissing?null:client);
  return{fn,calls};
}
test('L-LINK entitlement uses granted scoped RPC rather than forbidden stores SELECT',async()=>{
  const h=setup();assert.equal(await h.fn({tenantId:tenant,storeId:store}),true);
  assert.deepEqual(h.calls[0],{name:'service_resolve_garage_store_scope',args:{p_store_id:store}});
});
test('wrong tenant and wrong store fail closed before subscription access',async()=>{
  for(const scope of [[{store_id:store,tenant_id:'other',store_status:'active'}],[{store_id:'other',tenant_id:tenant,store_status:'active'}]]){
    const h=setup({scope});assert.equal(await h.fn({tenantId:tenant,storeId:store}),false);assert.equal(h.calls.some(c=>c.table),false);
  }
});
test('trial and inactive stores remain denied',async()=>{
  for(const status of ['trial','inactive',null]){const h=setup({scope:[{store_id:store,tenant_id:tenant,store_status:status}]});assert.equal(await h.fn({tenantId:tenant,storeId:store}),false);}
});
test('missing or ambiguous scoped result and RPC failure deny',async()=>{
  for(const config of [{scope:[]},{scope:null},{scope:[{},{}]},{scopeError:{code:'42501'}}]){const h=setup(config);assert.equal(await h.fn({tenantId:tenant,storeId:store}),false);}
});
test('entitlement flag still required and query remains tenant/active scoped',async()=>{
  const h=setup({enabled:false});assert.equal(await h.fn({tenantId:tenant,storeId:store}),false);
  assert.ok(h.calls.some(c=>c.key==='tenant_id'&&c.value===tenant));assert.ok(h.calls.some(c=>c.key==='status'&&c.value==='active'));
});
test('missing client or store cannot grant entitlement',async()=>{
  assert.equal(await setup({clientMissing:true}).fn({tenantId:tenant,storeId:store}),false);
  assert.equal(await setup().fn({tenantId:tenant}),false);
});
