import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../',import.meta.url),store='11111111-1111-4111-8111-111111111111';
function compile(file){return ts.transpileModule(readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}
const shared={};vm.runInNewContext(compile('src/lib/inspection-reminders/shared.ts'),{exports:shared});
const code=compile('src/app/api/customer-follow-up/inspection-reminders/settings/route.ts');
const valid={expected_store_id:store,enabled:true,exclude_sold:true,exclude_scrapped:true,exclude_reserved_or_in_service:true,require_customer_link:true,timings:[{offset_days:60,enabled:true}]};
function setup({rpcError={message:'synthetic timing write failure'},settingsRow={enabled:false},timings=[],role='owner'}={}){
 const saved={settings:{enabled:false},timings:[{offset_days:30,enabled:true}]},calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'synthetic-owner'}},error:null})},from(table){const q={select(){return q},eq(){return q},single:async()=>({data:{store_id:store,role},error:null}),maybeSingle:async()=>({data:settingsRow,error:null}),order:async()=>({data:timings,error:null}),upsert:async value=>{saved.settings=value;return{error:null}},delete(){saved.timings=[];return q},then(resolve){resolve({error:null})},insert:async()=>({error:{message:'synthetic timing write failure'}})};return q},rpc:async(name,args)=>{calls.push({name,args});return{data:null,error:rpcError}}};
 const exports={};vm.runInNewContext(code,{exports,require:id=>{if(id==='next/server')return{NextResponse:{json:(body,{status=200}={})=>({body,status})}};if(id==='@/lib/supabase/server')return{createClient:async()=>client};if(id==='@/lib/observability/logServerError')return{logServerError:()=>{}};if(id==='@/lib/inspection-reminders/shared')return shared;throw Error(id)}});
 return{saved,calls,GET:exports.GET,PUT:body=>exports.PUT(new Request('https://example.test/settings',{method:'PUT',body:JSON.stringify(body)}))};
}
let h=setup(),before=JSON.stringify(h.saved);assert.equal((await h.PUT(valid)).status,500);assert.equal(JSON.stringify(h.saved),before,'failed timing write preserves both settings and timings');assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'save_inspection_reminder_settings');
for(const body of [null,[],{...valid,timings:[null]},{...valid,enabled:'true'},{...valid,timings:[{offset_days:0,enabled:true}]},{...valid,timings:[]},{...valid,timings:[{offset_days:60,enabled:true},{offset_days:60,enabled:true}]}]){h=setup();assert.equal((await h.PUT(body)).status,400);assert.equal(h.calls.length,0)}
h=setup();assert.equal((await h.PUT({...valid,expected_store_id:'other-store'})).status,409);assert.equal(h.calls.length,0);
h=setup({role:'staff'});assert.equal((await h.PUT(valid)).status,403);assert.equal(h.calls.length,0);
for(const [code,status]of [['22023',400],['42501',403]]){h=setup({rpcError:{code}});assert.equal((await h.PUT(valid)).status,status)}
h=setup({rpcError:null});assert.equal((await h.PUT(valid)).status,200);assert.equal(h.calls.length,1);
h=setup({settingsRow:null});let r=await h.GET();assert.equal(r.body.settings.timings.length,3);assert.equal(r.body.store_id,store);
h=setup();r=await h.GET();assert.equal(r.body.settings.timings.length,0,'saved empty timings must not reappear as defaults');
console.log('PASS actual route atomic failure, invalid input, changed store, staff denial, error classes, success, default vs saved-empty');
