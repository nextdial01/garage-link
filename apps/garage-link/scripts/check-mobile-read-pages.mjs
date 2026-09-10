import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const root = new URL('../',import.meta.url);
const fixture={denied:false,fail:false,calls:[],rows:Array.from({length:205},(_,i)=>({id:String(i),store_id:'review-store'}))};
globalThis.__garagePages=fixture;
registerHooks({
 resolve(s,c,n){
  if(s==='server-only')return {url:'data:text/javascript,export {};',shortCircuit:true};
  if(s==='@/lib/mobile/bearerAuth') return {url:'fixture:auth',shortCircuit:true};
  if(['@/lib/mobile/quoteService','@/lib/audit/logAudit','@/lib/supabase/admin'].includes(s))return {url:'fixture:unused',shortCircuit:true};
  if(s.startsWith('@/'))return n(new URL('src/'+s.slice(2)+'.ts',root).href,c);
  return n(s,c);
 },
 load(u,c,n){
  if(u==='fixture:unused')return {format:'module',shortCircuit:true,source:'export const readMobileQuote=()=>{};export const logAudit=()=>{};export const createAdminClient=()=>{};'};
  if(u==='fixture:auth')return {format:'module',shortCircuit:true,source:`export async function getGarageMobileBearerContext(){
   const f=globalThis.__garagePages;
   if(f.denied)return {ok:false,response:Response.json({code:'denied'},{status:403})};
   return {ok:true,member:{storeId:'review-store'},service:{from(table){
    f.calls.push({table});let rows=[...f.rows];
    const q={select(){return q},eq(k,v){f.calls.push({eq:[k,v]});rows=rows.filter(r=>r[k]===v);return q},is(){return q},neq(){return q},order(k){f.calls.push({order:k});return q},or(v){f.calls.push({or:v});return q},limit(n){rows=rows.slice(0,n);return q},range(a,b){f.calls.push({range:[a,b]});rows=rows.slice(a,b+1);return q},then(a,b){return Promise.resolve({data:rows,error:f.fail?{}:null}).then(a,b)}};return q;
   }}};
  }`};
  return n(u,c);
 }
});
for(const [name,key]of [['vehicles','vehicles'],['customers','customers'],['maintenance','jobs'],['quotes','quotes']]){
 const {GET}=await import(new URL('src/app/api/mobile/'+name+'/route.ts',root));
 const get=(q='')=>GET(new Request('https://synthetic.invalid/api/mobile/'+name+q));
 fixture.calls=[];
 let r=await get('?offset=100&limit=100');let b=await r.json();
 assert.equal(r.status,200);assert.equal(b[key][0].id,'100',name+' must reach record101');assert.equal(b[key].length,100);assert.equal(b.nextOffset,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert(fixture.calls.some(c=>c.eq?.[0]==='store_id'&&c.eq[1]==='review-store'));assert(fixture.calls.some(c=>c.order==='id'));
 b=await(await get('?offset=200&limit=100')).json();assert.equal(b[key].length,5);assert.equal(b.nextOffset,null);
 for(const q of ['?offset=-1','?limit=101','?offset=foo','?limit=0']){fixture.calls=[];assert.equal((await get(q)).status,400);assert.equal(fixture.calls.length,0);}
 fixture.denied=true;fixture.calls=[];assert.equal((await get()).status,403);assert.equal(fixture.calls.length,0);fixture.denied=false;
 fixture.fail=true;assert.equal((await get()).status,500);fixture.fail=false;
 console.log('PASS: '+name+' pagination, scope, invalid inputs, provider failure, private cache');
}
delete globalThis.__garagePages;
