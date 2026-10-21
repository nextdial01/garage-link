import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source=readFileSync(new URL('../src/app/customer-follow-up/delivery-candidates/page.tsx',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function scenario({oldFails=false,newFails=false,unmount=false}={}) {
const values=[],effects=[],timers=[],pending=[],exports={};let index=0;
const nodes=(n,o=[])=>{if(!n||typeof n!=='object')return o;if(n.props)o.push(n);for(const v of Object.values(n.props??{})){if(Array.isArray(v))v.forEach(x=>nodes(x,o));else nodes(v,o)}return o};
vm.runInNewContext(code,{exports,URLSearchParams,window:{setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}},fetch:url=>new Promise(resolve=>pending.push({url,resolve})),require:id=>{
 if(id==='react')return{useState:initial=>{const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},useRef:initial=>{const i=index++;return values[i]??(values[i]={current:initial})},useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useMemo:fn=>fn()};
 if(id==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(id==='@/lib/inspection-reminders/shared')return{REMINDER_STATUSES:['pending'],REMINDER_STATUS_LABELS:{pending:'連携待ち'}};
 if(id==='@/lib/line-link/deliveryCandidates')return{CANDIDATE_EVENT_TYPES:['inspection_reminder'],CANDIDATE_EVENT_TYPE_LABELS:{inspection_reminder:'車検案内'}};
 if(id==='@/lib/errors/user-error')return{toUserErrorMessage:()=> 'error'};return{default:id};
}});
function render(){index=0;return nodes(exports.default())}let tree=render();const cleanup=effects.at(-1)();timers.at(-1)();assert.equal(pending.length,1);
tree.find(n=>n.type==='select').props.onChange({target:{value:'inspection_reminder'}});cleanup();render();const cleanupNew=effects.at(-1)();timers.at(-1)();assert.equal(pending.length,2);
if(unmount)cleanupNew();
pending[1].resolve({ok:!newFails,json:async()=>newFails?({ok:false,error:'current failure'}):({ok:true,rows:[],total:0})});for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
const before=JSON.stringify(values);
pending[0].resolve({ok:!oldFails,json:async()=>oldFails?({ok:false,error:'stale failure'}):({ok:true,rows:[{id:'old',event_type:'periodic_inspection'}],total:1})});for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
assert.equal(values[0].length,0,'late response from old filter must not overwrite current empty result');assert.equal(values[1],0);assert.equal(JSON.stringify(values),before,'stale result must not change rows, errors or loading');
}
for(const options of [{},{oldFails:true},{newFails:true},{unmount:true}])await scenario(options);
console.log('PASS real candidate component ignores stale success/error, preserves current failure and ignores unmounted responses');
