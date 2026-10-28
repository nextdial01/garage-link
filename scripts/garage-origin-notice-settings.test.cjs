const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.resolve(root,'apps/garage-link/node_modules/typescript'));
function transpile(p){return ts.transpileModule(fs.readFileSync(path.join(root,p),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});}
const rules={exports:{}};vm.runInNewContext(transpile('apps/garage-link/src/lib/line-link/noticeRules.ts').outputText,{exports:rules.exports});const r=rules.exports;
let checks=0;
assert(!r.validNoticeTemplate('repurchase','{{document_url}}'));assert(!r.validNoticeTemplate('repurchase','{{old_price}}'));assert(r.validNoticeTemplate('repurchase','{{inspection_expiry_date}} {{customer_name}}'));assert(r.validNoticeTemplate('quote_notice','{{document_url}}'));checks+=4;

for(const [date,months,expected]of [['2024-05-31',3,'2024-02-29'],['2025-05-31',3,'2025-02-28'],['2026-01-31',1,'2025-12-31'],['2026-01-31',0,'2026-01-31']]){assert.equal(r.subtractCalendarMonths(date,months),expected);checks++;}
for(const date of ['2026-02-30','2025-02-29','notdate']){assert.throws(()=>r.subtractCalendarMonths(date,3));checks++;}
for(const n of [-1,61,1.5]){assert.throws(()=>r.subtractCalendarMonths('2026-01-31',n));checks++;}
assert(r.validateNoticeSettings(r.defaultNoticeSettings()));assert(!r.validateNoticeSettings({...r.defaultNoticeSettings(),store_id:'other'}));assert(!r.validTemplate('{{unknown}}'));assert(!r.validTemplate('{{customer_name}'));assert(!r.validTemplate('x'.repeat(4001)));assert.equal(r.renderNoticeTemplate('Hi {{customer_name}}',{customer_name:'QA'}),'Hi QA');assert.throws(()=>r.renderNoticeTemplate('{{document_url}}',{}));checks+=7;
(async()=>{for(const scenario of ['deny','gate','getempty','geterror','insert','cas','conflict','extra']){
 let writes=0,eqs=[],inserted;
 const chain={select(){return this},eq(k,v){eqs.push([k,v]);return this},single:async()=>({data:{tenant_id:'tenant',store_id:'current',role:scenario==='deny'?'staff':'owner'}}),maybeSingle:async()=>scenario==='geterror'?{error:{}}:{data:scenario==='getempty'?null:scenario==='conflict'?null:{...r.defaultNoticeSettings(),updated_at:'2026-10-28T00:00:00Z'}},insert(v){writes++;inserted=v;return this},update(){writes++;return this}};
 const db={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:()=>chain};const ex={};
 vm.runInNewContext(transpile('apps/garage-link/src/app/api/line-link/notice-settings/route.ts').outputText,{exports:ex,require:n=>n==='next/server'?{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}}:n.includes('supabase/server')?{createClient:async()=>db}:n.includes('lLinkContract')?{canStoreUseLLink:async()=>scenario!=='gate'}:r,crypto:{randomUUID:()=> 'offline'},TextDecoder,Uint8Array});
 let result;
 if(scenario.startsWith('get')||scenario==='deny'||scenario==='gate')result=await ex.GET();else {const input=r.defaultNoticeSettings();if(scenario==='cas'||scenario==='conflict')input.updated_at='2026-10-27T00:00:00Z';if(scenario==='extra')input.store_id='other';result=await ex.PUT(new Request('https://qa.invalid',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));}
 if(['deny','gate'].includes(scenario)){assert.equal(result.status,403);assert.equal(writes,0);}
 if(scenario==='getempty')assert.equal(result.body.settings.updated_at,null);
 if(scenario==='geterror')assert.equal(result.status,500);
 if(scenario==='insert'){assert.equal(writes,1);assert.equal(inserted.store_id,'current');}
 if(scenario==='cas'){assert(eqs.some(([k,v])=>k==='updated_at'&&v==='2026-10-27T00:00:00Z'));assert(eqs.some(([k,v])=>k==='store_id'&&v==='current'));}
 if(scenario==='conflict')assert.equal(result.status,409);
 if(scenario==='extra'){assert.equal(result.status,400);assert.equal(writes,0);}checks++;
}
console.log(JSON.stringify({status:'PASS',checks,network:0,scope:'pure calendar/template plus actual API with mocked auth/db/contract'}));})().catch(e=>{console.error(e);process.exitCode=1});
