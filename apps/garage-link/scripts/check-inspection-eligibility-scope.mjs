import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/app/api/customer-follow-up/inspection-reminders/eligibility/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run({user='actor',role='owner',store='own-store',memberError=null,rpcError=null}={}){const calls=[],filters=[],exports={};const query={select(){return this},eq(k,v){filters.push([k,v]);return this},single:async()=>({data:store?{store_id:store,role}:null,error:memberError})};const client={auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:null})},from(name){assert.equal(name,'current_user_active_store_membership');return query},rpc:async(name,args)=>{calls.push({name,args});return{data:{today:'synthetic'},error:rpcError}}};vm.runInNewContext(code,{exports,require:id=>id==='next/server'?{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}}:id==='@/lib/supabase/server'?{createClient:async()=>client}:{logServerError(){}}});const result=await exports.GET();return{result,calls,filters}}
for(const role of ['owner','admin']){const r=await run({role});assert.equal(r.result.status,200);assert.equal(r.calls[0].name,'get_inspection_reminder_eligibility_summary_scoped');assert.equal(r.calls[0].args.p_store_id,'own-store');assert.deepEqual(r.filters,[['user_id','actor'],['status','active']])}
for(const role of ['staff','viewer',null]){const r=await run({role});assert.equal(r.result.status,403);assert.equal(r.calls.length,0)}
for(const opts of [{user:null},{store:null},{memberError:{message:'ambiguous'}}]){const r=await run(opts);assert.ok([401,403].includes(r.result.status));assert.equal(r.calls.length,0)}
assert.equal((await run({rpcError:{code:'42501',message:'internal synthetic'}})).result.status,403);
const fail=await run({rpcError:{code:'XX000',message:'internal synthetic'}});assert.equal(fail.result.status,500);assert.ok(!JSON.stringify(fail.result).includes('internal synthetic'));
console.log('PASS actual eligibility GET: canonical owner/admin only, no RPC on forbidden/ambiguous auth, exact derived store, 42501=403, sanitized failures');
