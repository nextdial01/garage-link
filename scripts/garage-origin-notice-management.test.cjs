const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'apps/garage-link/node_modules/typescript'));let checks=0;
const transpile=p=>ts.transpileModule(fs.readFileSync(path.join(root,'apps/garage-link/src',p),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const json=(body,opts)=>({body,status:opts?.status??200});
(async()=>{
for(const scenario of ['unauth','staff','contract','owner','admin']){
 let contractCalls=0;const q={select(){return this},eq(){return this},single:async()=>({data:{store_id:'current',tenant_id:'tenant',role:scenario==='staff'?'staff':scenario==='admin'?'admin':'owner'}})};
 const db={auth:{getUser:async()=>({data:{user:scenario==='unauth'?null:{id:'actor'}}})},from:()=>q};const ex={};
 vm.runInNewContext(transpile('lib/line-link/noticeManagementContext.ts'),{exports:ex,require:n=>n==='next/server'?{NextResponse:{json}}:n.includes('supabase')?{createClient:async()=>db}:{canStoreUseLLink:async x=>{contractCalls++;assert.equal(x.storeId,'current');return scenario!=='contract'}}});
 const ctx=await ex.noticeManagementContext();if(['owner','admin'].includes(scenario))assert.equal(ctx.storeId,'current');else assert(ctx.response.status>=400);if(['unauth','staff'].includes(scenario))assert.equal(contractCalls,0);checks++;
}
for(const scenario of ['list','listerror','generate','badcount','rpcerror','crossorigin','bodyoverride','deny']){
 let calls=0;const eqs=[];const q={select(s){assert(!s.includes('payload'));return this},eq(k,v){eqs.push([k,v]);return this},order(){return this},limit:async n=>{assert.equal(n,100);return {data:[],error:scenario==='listerror'?{}:null}}};
 const db={from:n=>{assert.equal(n,'garage_link_handoffs');return q},rpc:async(n,a)=>{calls++;assert.equal(n,'garage_link_generate_repurchase');assert.equal(a.p_store_id,'current');return {data:scenario==='badcount'?'1':2,error:scenario==='rpcerror'?{}:null}}};
 const ex={};const list=scenario.startsWith('list');vm.runInNewContext(transpile(list?'app/api/line-link/handoffs/list.ts':'app/api/line-link/repurchase-generate/route.ts'),{exports:ex,URL,require:n=>n==='next/server'?{NextResponse:{json}}:{noticeManagementContext:async()=>scenario==='deny'?{response:json({}, {status:403})}:{db,storeId:'current'}}});
 const result=list?await ex.GET():await ex.POST(new Request('https://qa.invalid/api/line-link/repurchase-generate',{method:'POST',headers:{origin:scenario==='crossorigin'?'https://other.invalid':'https://qa.invalid'},...(scenario==='bodyoverride'?{body:'{"store_id":"other"}'}:{})}));
 if(scenario==='list'){assert.equal(result.status,200);assert.deepEqual(eqs,[['store_id','current']]);}else if(scenario==='generate'){assert.equal(result.body.generated_count,2);assert.equal(calls,1);}else assert(result.status>=400);
 if(['crossorigin','bodyoverride','deny'].includes(scenario))assert.equal(calls,0);checks++;
}
const ui=fs.readFileSync(path.join(root,'apps/garage-link/src/app/customer-follow-up/line-notices/page.tsx'),'utf8');assert(ui.includes('attempted.current = true'));assert(ui.includes('取込済みはLINE送信完了を意味しません'));assert(!ui.includes('/line/send'));assert(ui.includes('/settings/l-link/notices'));checks++;
console.log(JSON.stringify({status:'PASS',checks,network:0}));
})().catch(e=>{console.error(e);process.exitCode=1});
