// Exercises the actual mobile re-exports, shared storage handlers and context selector.
// Provider side effects are synthetic and process-only.
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
const root=new URL('../',import.meta.url);
const tenant='aaaaaaaa-0000-4000-8000-000000000001',store='bbbbbbbb-0000-4000-8000-000000000001';
const fileId='cccccccc-0000-4000-8000-000000000001';
const f={role:'staff',cookieCalls:0,bearerCalls:0,uploadCalls:0,signCalls:0,filters:[],badTenant:false,insert:null};
globalThis.__mobileStorage=f;
const record=()=>({id:fileId,tenant_id:f.badTenant?'foreign':tenant,store_id:store,bucket:'company-assets',path:`tenants/${tenant}/stores/${store}/vehicles/unassigned/${fileId}.png`,purpose:'vehicle_image',file_type:'image',size_bytes:3,deleted_at:null});
f.service={from(table){assert.equal(table,'uploaded_files');const q={select(){return q},eq(k,v){f.filters.push([k,v]);return q},is(){return q},insert(value){f.insert=value;return q},async maybeSingle(){return {data:record(),error:null}},async single(){return {data:{...record(),...f.insert},error:null}}};return q},storage:{from(bucket){assert.equal(bucket,'company-assets');return {async createSignedUrl(p,expires){f.signCalls++;assert.ok(p.startsWith(`tenants/${tenant}/stores/${store}/`));assert.equal(expires,300);return {data:{signedUrl:'https://example.invalid/synthetic.png'},error:null}},async upload(p){f.uploadCalls++;assert.ok(p.startsWith(`tenants/${tenant}/stores/${store}/`));return {error:null}},async remove(){return {error:null}}}}}};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-nonsecret';
registerHooks({resolve(s,c,next){
 if(s==='server-only')return {url:'data:text/javascript,export {};',shortCircuit:true};
 if(s==='@supabase/supabase-js')return {url:'fixture:provider',shortCircuit:true};
 if(s==='@/lib/supabase/server')return {url:'fixture:cookie',shortCircuit:true};
 if(s==='@/lib/mobile/bearerAuth')return {url:'fixture:bearer',shortCircuit:true};
 if(['@/lib/security/garageTenantContext','@/lib/storage/audit','@/lib/security/rateLimit','@/lib/observability/logServerError'].includes(s))return {url:'fixture:noop',shortCircuit:true};
 if(s.startsWith('@/'))return next(new URL('src/'+s.slice(2)+'.ts',root).href,c);return next(s,c);
},load(u,c,next){
 if(process.env.GARAGE_TEST_BASELINE === '1' && u.endsWith('/src/lib/storage/auth.ts')) {
  const original=execFileSync('git',['show','be6fe4643f1faa17755280b6012c7b53afa65085:apps/garage-link/src/lib/storage/auth.ts'],{encoding:'utf8'});
  return {format:'module',source:stripTypeScriptTypes(original),shortCircuit:true};
 }
 const sources={
  'fixture:provider':`export const createClient=()=>globalThis.__mobileStorage.service;`,
  'fixture:cookie':`export async function createClient(){globalThis.__mobileStorage.cookieCalls++;return {auth:{getUser:async()=>({data:{user:null},error:null})}};}`,
  'fixture:bearer':`export async function getGarageMobileBearerContext(request){const f=globalThis.__mobileStorage;f.bearerCalls++;if(request.headers.get('authorization')!=='Bearer synthetic')return {ok:false,response:Response.json({code:'unauthorized'},{status:401})};if(request.headers.get('x-garage-store-id')!=='${store}')return {ok:false,response:Response.json({code:'forbidden_store'},{status:403})};return {ok:true,service:f.service,user:{id:'synthetic-user'},tenantContext:{tenantId:'${tenant}',storeId:'${store}'},member:{storeId:'${store}',tenantId:'${tenant}',role:f.role,displayName:null,email:null},ipAddress:null,userAgent:null};}`,
  'fixture:noop':`export const resolveStoreTenantContext=()=>{};export const logStorageAudit=async()=>{};export const logStorageSecurityEvent=async()=>{};export const enforceSecurityRateLimit=async()=>{};export const logServerError=()=>{};export const apiError=({code,status})=>Response.json({code},{status});`
 };if(sources[u])return {format:'module',source:sources[u],shortCircuit:true};return next(u,c);
}});
const {POST:read}=await import(new URL('src/app/api/mobile/storage/signed-url/route.ts',root));
const {POST:upload}=await import(new URL('src/app/api/mobile/storage/upload/route.ts',root));
const {getStorageAuthContext}=await import(new URL('src/lib/storage/auth.ts',root));
const req=(endpoint='signed-url',headers={authorization:'Bearer synthetic','x-garage-store-id':store},body=JSON.stringify({fileId}))=>new Request('https://example.invalid/api/mobile/storage/'+endpoint,{method:'POST',headers,body});
assert.equal((await read(req('signed-url',{}))).status,401);
assert.equal((await read(req('signed-url',{authorization:'Bearer synthetic','x-garage-store-id':'foreign'}))).status,403);
assert.equal(f.signCalls,0);assert.equal(f.cookieCalls,0,'native never falls back to cookie identity');
assert.equal((await read(req())).status,200);assert.ok(f.filters.some(([k,v])=>k==='store_id'&&v===store));
f.badTenant=true;assert.equal((await read(req())).status,403);assert.equal(f.signCalls,1,'cross-tenant record is never signed');f.badTenant=false;
f.role='viewer';assert.equal((await read(req())).status,200);
const form=()=>{const fd=new FormData();fd.set('purpose','vehicle_image');fd.set('file',new File(['PNG'],'fixture.png',{type:'image/png'}));return fd};
assert.equal((await upload(req('upload',undefined,form()))).status,403);assert.equal(f.uploadCalls,0,'viewer cannot upload');
f.role='staff';assert.equal((await upload(req('upload',undefined,form()))).status,200);assert.equal(f.uploadCalls,1);assert.equal(f.insert.tenant_id,tenant);assert.equal(f.insert.store_id,store);
const web=await getStorageAuthContext(new Request('https://example.invalid/api/storage/signed-url',{headers:{authorization:'Bearer synthetic'}}));
assert.equal(web.ok,false);assert.equal(web.response.status,401);assert.equal(f.cookieCalls,1,'existing web path still uses cookie auth');
console.log('GARAGE_MOBILE_STORAGE_BOUNDARY=PASS');
