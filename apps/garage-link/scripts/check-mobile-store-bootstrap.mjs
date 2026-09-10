// Real bearer boundary with synthetic provider responses; never calls a network.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const root = new URL('../', import.meta.url);
const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_A = 'bbbbbbbb-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const STORE_A = 'cccccccc-0000-4000-8000-000000000001';
const STORE_B = 'cccccccc-0000-4000-8000-000000000002';
const fixture = { calls: [], memberships: [], context: null, authError: false, rpcError: null };
globalThis.__garageBootstrapFixture = fixture;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (specifier === '@/lib/supabase/admin') return { url: 'fixture:admin', shortCircuit: true };
    if (specifier === '@/lib/security/garageTenantContext') return { url: 'fixture:tenant', shortCircuit: true };
    if (specifier.startsWith('@/')) return next(new URL(`src/${specifier.slice(2)}.ts`, root).href, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'fixture:admin') return { format: 'module', shortCircuit: true, source: `
      const f = globalThis.__garageBootstrapFixture;
      export function createBearerAuthClient() { return {auth:{getUser:async()=>({data:{user:f.authError?null:{id:'${USER}'}},error:f.authError})}}; }
      export function createBearerClient(token) { return {from(table) {
        f.calls.push({table,token});
        let rows = [...f.memberships];
        const q = { select(){return q}, eq(k,v){rows=rows.filter(r=>r[k]===v);return q}, is(k,v){rows=rows.filter(r=>r[k]===v);return q},
          then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject)} };
        return q;
      }}; }
    ` };
    if (url === 'fixture:tenant') return { format: 'module', shortCircuit: true, source: `
      export async function resolveStoreTenantContext(service,input) {
        globalThis.__garageBootstrapFixture.calls.push({resolved:input});
        return {tenantId:input.expectedTenantId,storeId:input.storeId,actorRole:input.actorRole};
      }
    ` };
    return next(url, context);
  },
});
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-public-key';
globalThis.fetch = async (url, options) => {
  assert.equal(new URL(url).origin, 'https://synthetic.invalid');
  assert.equal(options.headers.authorization, 'Bearer synthetic-token');
  fixture.calls.push({rpc: new URL(url).pathname, body: JSON.parse(options.body)});
  if (new URL(url).pathname.endsWith('/switch_active_garage_store')) {
    if (fixture.switchError) return Response.json(fixture.switchError,{status:403});
    const body = JSON.parse(options.body);
    const membership = fixture.memberships.find(m=>m.tenant_id===body.p_tenant_id);
    if (!fixture.skipSwitch) fixture.context={...fixture.context,state:'active',tenant_id:body.p_tenant_id,store_id:body.p_store_id,role:membership.role};
    return Response.json({ok:true,tenant_id:body.p_tenant_id,store_id:body.p_store_id,role:membership.role});
  }
  return fixture.rpcError
    ? Response.json(fixture.rpcError, {status:403})
    : Response.json(fixture.context);
};
const api = await import(new URL('src/lib/mobile/bearerAuth.ts', root));
const request = (storeId) => new Request('https://app.invalid/api/mobile/stores', {
  headers: {authorization:'Bearer synthetic-token', ...(storeId ? {'x-garage-store-id':storeId} : {})},
});
function reset() {
  fixture.calls=[]; fixture.authError=false; fixture.rpcError=null; fixture.switchError=null; fixture.skipSwitch=false;
  fixture.memberships=[TENANT_A,TENANT_B].map((tenant_id,i)=>({tenant_id,user_id:USER,role:i?'viewer':'staff',display_name:'Synthetic',status:'active',disabled_at:null,deleted_at:null,joined_at:'2026-01-01',invite_accepted_at:null}));
  fixture.context={state:'selection_required',tenant_id:'',store_id:'',role:'staff',display_name:'Synthetic',stores:[{id:STORE_A,tenant_id:TENANT_A,name:'Synthetic A'},{id:STORE_B,tenant_id:TENANT_B,name:'Synthetic B'}]};
}
reset();
const listing = await api.listGarageMobileStores(request());
assert.equal(listing.ok,true,'first selection must list accessible stores');
assert.deepEqual(listing.stores.map(s=>[s.tenantId,s.role]),[[TENANT_A,'staff'],[TENANT_B,'viewer']], 'never copy one tenant role to another');
console.log('PASS: selection_required lists tenant-specific roles');
reset();
assert.equal((await api.getGarageMobileBearerContext(request())).response.status,400);
assert.equal((await api.getGarageMobileBearerContext(request(STORE_A))).ok,false,'unselected store must not enter business operations');
assert.equal(fixture.calls.some(c=>c.resolved),false);
reset(); fixture.context.state='no_access';
assert.equal((await api.listGarageMobileStores(request())).ok,false);
reset(); fixture.memberships[0].disabled_at='2026-01-01';
assert.deepEqual((await api.listGarageMobileStores(request())).stores.map(s=>s.id),[STORE_B]);
reset(); fixture.memberships[0].status='inactive';
assert.deepEqual((await api.listGarageMobileStores(request())).stores.map(s=>s.id),[STORE_B]);
reset(); fixture.memberships[0].user_id='foreign-user';
assert.deepEqual((await api.listGarageMobileStores(request())).stores.map(s=>s.id),[STORE_B]);
reset(); fixture.context={...fixture.context,state:'active',tenant_id:TENANT_A,store_id:STORE_A};
assert.equal((await api.getGarageMobileBearerContext(request(STORE_A))).ok,true);
assert.equal((await api.getGarageMobileBearerContext(request(STORE_B))).ok,false,'different active store must be explicitly selected first');
reset(); fixture.authError=true;
assert.equal((await api.listGarageMobileStores(request())).response.status,401);
assert.equal(fixture.calls.length,0,'expired auth must not call data providers');
reset(); fixture.rpcError={code:'42501',message:'Email OTP verification is required for administrator access'};
assert.equal((await (await api.listGarageMobileStores(request())).response.json()).code,'admin_security_required');
console.log('PASS: active scope, membership, foreign user, expired auth and OTP denials');

const {POST} = await import(new URL('src/app/api/mobile/stores/active/route.ts',root));
const select = (body={tenantId:TENANT_B,storeId:STORE_B}, headers={authorization:'Bearer synthetic-token','content-type':'application/json'}) => POST(new Request('https://app.invalid/api/mobile/stores/active',{method:'POST',headers,body:JSON.stringify(body)}));
reset();
assert.equal((await select()).status,200);
assert.equal(fixture.context.store_id,STORE_B);
assert.equal(fixture.calls.filter(c=>c.rpc?.endsWith('/switch_active_garage_store')).length,1);
assert.equal(fixture.calls.at(-1).resolved.actorRole,'viewer','selected tenant role reaches final scope validation');
reset();
assert.equal((await select(undefined,{'content-type':'application/json',cookie:'session=synthetic'})).status,401);
assert.equal(fixture.calls.length,0,'cookie-only POST must not reach provider');
assert.equal((await select(undefined,{authorization:'Bearer synthetic-token','content-type':'text/plain'})).status,415);
assert.equal((await select({tenantId:TENANT_B,storeId:'bad'})).status,400);
assert.equal(fixture.calls.length,0);
reset();
assert.equal((await select({tenantId:TENANT_A,storeId:STORE_B})).status,403);
assert.equal(fixture.calls.some(c=>c.rpc?.endsWith('/switch_active_garage_store')),false,'foreign tenant/store pairing never mutates');
reset(); fixture.switchError={code:'42501',message:'Email OTP verification is required for administrator access'};
assert.equal((await (await select()).json()).code,'admin_security_required');
reset(); fixture.skipSwitch=true;
assert.equal((await select()).status,409,'switch acknowledgement is insufficient without matching readback');
reset(); fixture.memberships[0].joined_at=null;
assert.deepEqual((await api.listGarageMobileStores(request())).stores.map(s=>s.id),[STORE_B]);
reset(); fixture.memberships.push({...fixture.memberships[0],role:'owner'});
assert.deepEqual((await api.listGarageMobileStores(request())).stores.map(s=>s.id),[STORE_B],'ambiguous membership must not elevate');
reset(); fixture.context.stores=[];
assert.equal((await api.listGarageMobileStores(request())).ok,false,'provider excludes inactive/unassigned stores');
console.log('PASS: explicit selection, Bearer-only CSRF boundary, OTP, scope and readback');
delete globalThis.__garageBootstrapFixture;
