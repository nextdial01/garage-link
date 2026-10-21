import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source=readFileSync(new URL('../src/app/customer-follow-up/inspection-reminders/page.tsx',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function scenario({oldFails=false,newFails=false,unmount=false,pagination=false,skipOutcome=true}={}) {
const values=[],effects=[],timers=[],pending=[],rpcCalls=[],exports={};let index=0;
const nodes=(n,o=[])=>{if(!n||typeof n!=='object')return o;if(n.props)o.push(n);for(const v of Object.values(n.props??{})){if(Array.isArray(v))v.forEach(x=>nodes(x,o));else nodes(v,o)}return o};
vm.runInNewContext(code,{exports,URLSearchParams,window:{setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}},fetch:url=>new Promise(resolve=>pending.push({url,resolve})),require:id=>{
 if(id==='react')return{useState:initial=>{const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},useRef:initial=>{const i=index++;return values[i]??(values[i]={current:initial})},useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useMemo:fn=>fn()};
 if(id==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(id==='@/lib/supabase/client')return{createClient:()=>({rpc:async(name,args)=>{rpcCalls.push({name,args});return{data:{ok:skipOutcome},error:null}}})};
 if(id==='@/lib/store/garageUiContext')return{requireActiveGarageStore:async()=>({storeId:'synthetic-store',role:'owner'})};
 if(id==='@/lib/inspection-reminders/shared')return{REMINDER_STATUSES:['pending'],REMINDER_STATUS_LABELS:{pending:'連携待ち'}};
 if(id==='@/lib/line-link/deliveryCandidates')return{CANDIDATE_EVENT_TYPES:['inspection_reminder'],CANDIDATE_EVENT_TYPE_LABELS:{inspection_reminder:'車検案内'}};
 if(id==='@/lib/errors/user-error')return{toUserErrorMessage:()=> 'error'};return{default:id};
}});
function render(){index=0;return nodes(exports.default())}let tree=render();const cleanup=effects.at(-1)();timers.at(-1)();for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,1);
tree.find(n=>n.type==='select').props.onChange({target:{value:'pending'}});cleanup();render();const cleanupNew=effects.at(-1)();timers.at(-1)();assert.equal(pending.length,2);
if(unmount)cleanupNew();
pending[1].resolve({ok:!newFails,json:async()=>newFails?({ok:false,error:'current failure'}):({ok:true,rows:[],total:pagination?21:0})});for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
const before=JSON.stringify(values);
pending[0].resolve({ok:!oldFails,json:async()=>oldFails?({ok:false,error:'stale failure'}):({ok:true,rows:[{id:'old',event_type:'periodic_inspection'}],total:1})});for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
assert.equal(values[1].length,0,'late response from old filter must not overwrite current empty result');assert.equal(values[2],pagination?21:0);assert.equal(JSON.stringify(values),before,'stale result must not change rows, errors or loading');
if(pagination){
 let nodesNow=render();let buttons=nodesNow.filter(n=>n.type==='button' && ['前へ','次へ'].includes(n.props.children));assert.equal(buttons[0].props.disabled,true);assert.equal(buttons[1].props.disabled,false);buttons[1].props.onClick();assert.equal(values[3],1);
 cleanupNew();render();const cleanPage=effects.at(-1)();timers.at(-1)();assert.match(pending.at(-1).url,/page=1/);pending.at(-1).resolve({ok:true,json:async()=>({ok:true,rows:[{id:'last',event_type:'inspection_reminder',status:'pending'}],total:21})});for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
 buttons=render().filter(n=>n.type==='button' && ['前へ','次へ'].includes(n.props.children));assert.equal(buttons[0].props.disabled,false);assert.equal(buttons[1].props.disabled,true);buttons[0].props.onClick();assert.equal(values[3],0);values[3]=1;render().find(n=>n.type==='select').props.onChange({target:{value:''}});assert.equal(values[3],0);render().find(n=>n.type==='button'&&n.props.children==='詳細').props.onClick();let expanded=render();assert.ok(expanded.some(n=>n.type==='button'&&n.props.children==='この対象をスキップ'));const beforeFetches=pending.length;expanded.find(n=>n.type==='button'&&n.props.children==='この対象をスキップ').props.onClick();for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls)),[{name:'skip_inspection_reminder_event',args:{p_store_id:'synthetic-store',p_event_id:'last'}}]);if(skipOutcome)assert.equal(pending.length,beforeFetches+1);else{assert.equal(pending.length,beforeFetches);assert.ok(values[5].includes('状態が更新'))}cleanPage();
}
}
for(const options of [{},{oldFails:true},{newFails:true},{unmount:true},{pagination:true},{pagination:true,skipOutcome:false}])await scenario(options);
console.log('PASS real inspection history component ignores stale success/error, preserves current failure and ignores unmounted responses');
