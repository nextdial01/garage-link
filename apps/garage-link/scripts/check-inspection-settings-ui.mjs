import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
function compile(path){return ts.transpileModule(readFileSync(new URL(path,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText}
const shared={};vm.runInNewContext(compile('src/lib/inspection-reminders/shared.ts'),{exports:shared});
const code=compile('src/app/settings/customer-follow-up/inspection-reminders/page.tsx');
const initial={enabled:false,exclude_sold:true,exclude_scrapped:true,exclude_reserved_or_in_service:true,require_customer_link:true,timings:[{offset_days:30,enabled:true}]};
function nodes(node,out=[]){if(!node||typeof node!=='object')return out;if(node.props)out.push(node);for(const value of Object.values(node.props??{})){if(Array.isArray(value))value.forEach(v=>nodes(v,out));else nodes(value,out)}return out}
async function setup(saveFails=false){
 let index=0;const values=[],effects=[],requests=[],exports={};
 const client={auth:{getUser:async()=>({data:{user:{id:'synthetic-owner'}}})},from(){const q={select(){return q},eq(){return q},single:async()=>({data:{role:'owner'}})};return q}};
 vm.runInNewContext(code,{exports,fetch:async(url,options={})=>{requests.push({url,options});if(options.method==='PUT'){const settings=JSON.parse(options.body);delete settings.expected_store_id;return{ok:!saveFails,json:async()=>saveFails?{ok:false,error:'synthetic failure'}:{ok:true,settings}}}return{ok:true,json:async()=>url.includes('/settings')?{ok:true,settings:structuredClone(initial),store_id:'synthetic-store'}:{ok:true,created:0}}},require:id=>{
  if(id==='react')return{useState:initial=>{const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},useEffect:fn=>effects.push(fn),useMemo:fn=>fn()};
  if(id==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(id==='@/lib/supabase/client')return{createClient:()=>client};
  if(id==='@/lib/inspection-reminders/shared')return shared;
  if(id==='@/lib/errors/user-error')return{toUserErrorMessage:()=> 'error'};
  return{default:id};
 }});
 const render=()=>{index=0;return nodes(exports.default())};render();effects.forEach(fn=>fn());for(let n=0;n<20;n++)await new Promise(resolve=>setImmediate(resolve));return{render,requests};
}
for(const fails of [false,true]){
 const h=await setup(fails);let tree=h.render();let run=tree.find(n=>n.type==='button'&&String(n.props.children).includes('今すぐ'));assert.equal(run.props.disabled,false);
 const toggle=tree.find(n=>n.props.label==='車検案内を有効にする');toggle.props.onChange(true);tree=h.render();run=tree.find(n=>n.type==='button'&&String(n.props.children).includes('今すぐ'));assert.equal(run.props.disabled,true);await run.props.onClick();assert.equal(h.requests.filter(r=>r.options.method==='POST').length,0);
 let save=tree.find(n=>n.type==='button'&&n.props.children==='保存する');await save.props.onClick();tree=h.render();run=tree.find(n=>n.type==='button'&&String(n.props.children).includes('今すぐ'));assert.equal(run.props.disabled,fails);
 assert.equal(JSON.parse(h.requests.find(r=>r.options.method==='PUT').options.body).expected_store_id,'synthetic-store');
 if(!fails){await run.props.onClick();assert.equal(h.requests.find(r=>r.options.method==='POST').options.headers['X-Garage-Store-Id'],'synthetic-store')}
}
console.log('PASS actual UI dirty blocks generation, save success enables, save failure stays blocked, expected store preserved');
