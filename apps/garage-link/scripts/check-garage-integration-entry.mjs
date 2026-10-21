import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
async function render(path,{contract=true,role='owner'}={}){
 const values=[],effects=[],queries=[];let index=0;
 const client={auth:{getUser:async()=>({data:{user:{id:'synthetic-owner'}}})},from(table){queries.push(table);const q={select(){return q},eq(){return q},single:async()=>table==='memberships'?{data:null,error:{message:'multiple memberships'}}:{data:table==='stores'?{id:'synthetic-store',name:'Review'}:{store_id:'synthetic-store',role,status:'active'},error:null}};return q}};
 const exports={};const source=readFileSync(new URL(path,root),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const context={exports,process:{env:{}},require:id=>{
  if(id==='react')return{useState:initial=>{const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>values[i]=v]},useEffect:fn=>effects.push(fn),useMemo:fn=>fn()};
  if(id==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(id==='@/lib/supabase/client')return{createClient:()=>client};
  if(id==='@/lib/billing/garageSubscription')return{getActiveCompanySubscription:async()=>({company_id:'synthetic-store',plan:'pro',status:'active',l_link_integration_enabled:contract})};
  if(id==='@/lib/billing/garagePlans')return{GARAGE_PLAN_ORDER:['pro'],GARAGE_PLANS:{pro:{name:'Pro',lLinkAvailability:'preparing'}},getGaragePlan:()=>({name:'Pro',lLinkAvailability:'preparing'}),normalizeGaragePlanCode:()=> 'pro',formatGarageYen:()=> '0',canUseLLinkIntegration:()=>false};
  if(id==='@/lib/auth/permissions')return{canManageMembers:r=>r==='owner',canImportExportSettings:r=>r==='owner',getRoleLabel:r=>r};
  if(id==='@/lib/errors/user-error')return{toUserErrorMessage:()=> 'error'};
  return{default:id};
 }};
 vm.runInNewContext(code,context);exports.default();for(const effect of effects)effect();for(let n=0;n<20;n++)await new Promise(resolve=>setImmediate(resolve));index=0;return{values,queries,tree:exports.default()};
}
let r=await render('src/app/settings/page.tsx');assert.equal(r.values[0],'owner','active store owner must not be denied due to unrelated memberships');assert.ok(!r.queries.includes('memberships'));
function allNodes(node,out=[]){if(!node||typeof node!=='object')return out;if(node.props)out.push(node);for(const v of Object.values(node.props??{})){if(Array.isArray(v))v.forEach(x=>allNodes(x,out));else allNodes(v,out)}return out}
assert.ok(allNodes(r.tree).some(n=>n.props.href==='/settings/l-link'),'settings must expose L-LINK entry');
r=await render('src/app/settings/l-link/page.tsx');assert.ok(allNodes(r.tree).some(n=>n.props.href==='https://llink.tech'&&!n.props['aria-disabled']),'explicit active review contract should enable link even while global catalog preparing');
r=await render('src/app/settings/l-link/page.tsx',{contract:false});assert.ok(allNodes(r.tree).some(n=>n.props.href===undefined&&n.props.tabIndex===-1&&n.props['aria-disabled']===true));
console.log('PASS Garage active-store role, entry navigation, private contract flag and disabled-contract denial');
