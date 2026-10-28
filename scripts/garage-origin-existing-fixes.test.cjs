const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const deps=path.resolve(root,'../closure-final-QA-G/apps/garage-link/node_modules');
const ts=require(path.join(deps,'typescript'));
const inquiry=fs.readFileSync(path.join(root,'apps/garage-link/src/app/inquiries/page.tsx'),'utf8');
const start=inquiry.indexOf('  async function verifyCurrentWriteContext()');
const guard=inquiry.slice(start,inquiry.indexOf('  async function applyRefresh()',start));
const saveStart=inquiry.indexOf('  async function saveResponseManagement(');
const save=inquiry.slice(saveStart,inquiry.indexOf('\n  return (',saveStart));
let checks=0;
(async()=>{
 for(const scenario of ['inactive','foreign','viewer','contextfailure','no-row','success','write-error']){
  let writes=0,finished=0,error='',conflict='',updated=false,canWrite=true;
  const context={state:'active',storeId:'A',role:'staff'};
  if(scenario==='inactive')context.state='none';if(scenario==='foreign')context.storeId='B';if(scenario==='viewer')context.role='viewer';
  const chain={eq(){return this},select(){return this},async maybeSingle(){return {data:scenario==='success'?{id:'fixed'}:null,error:scenario==='write-error'?{}:null}}};
  const sandbox={storeId:'A',canWrite:true,editingNextActionAt:'',editingStatus:'unhandled',editingAssignee:'',getGarageUiContext:async(o)=>{assert.equal(o.force,true);if(scenario==='contextfailure')throw Error('context unavailable');return context},setCanWrite:v=>canWrite=v,setErrorMessage:v=>error=v,setConflictMessage:v=>conflict=v,setPendingRefresh:()=>{},beginInquirySave:()=>true,finishInquirySave:()=>finished++,createClient:()=>({from:()=>({update:()=>{writes++;return chain}})}),setInquiries:()=>updated=true,toUserErrorMessage:e=>e.message};
  const js=ts.transpileModule(guard+save+';globalThis.save=saveResponseManagement',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,sandbox);await sandbox.save({id:'fixed',updated_at:'v1'});
  assert.equal(finished,1);assert.equal(writes,['inactive','foreign','viewer','contextfailure'].includes(scenario)?0:1);
  if(['inactive','foreign','viewer'].includes(scenario)){assert.equal(canWrite,false);assert(error.includes('権限'));assert.equal(conflict,'');}
  if(scenario==='no-row'){assert(conflict.includes('可能性'));assert(!conflict.startsWith('ほかの更新が入ったため'));}
  if(scenario==='success'){assert(updated);assert.equal(error,'');}checks++;
 }
 // Stable onClose prevents Modal's focus effect dependency from changing while typing.
 assert(inquiry.includes('const closeInquiryDetail = useCallback('));assert(inquiry.includes('onClose={closeInquiryDetail}'));assert(inquiry.includes('<p role="alert"'));checks++;
 const history=fs.readFileSync(path.join(root,'apps/garage-link/src/app/customer-follow-up/inspection-reminders/page.tsx'),'utf8');
 const expr=history.match(/\{(errorMessage \? '履歴を確認[^\n]+)\}/)[1];
 const label=new Function('errorMessage','statusFilter','fromDate','toDate','appliedKeyword','return '+expr);
 assert(label('failed','','','','').includes('確認できません'));assert(label('','pending','','','').includes('検索条件'));assert(label('','','','','').includes('履歴はまだ'));checks+=3;
 const billing=fs.readFileSync(path.join(root,'apps/garage-link/src/app/settings/billing/page.tsx'),'utf8');const bexpr=billing.match(/\{(subscription\?\.status === 'active' && subscription\.l_link_integration_enabled \?[^}]+)\}/)[1];const badge=new Function('subscription','return '+bexpr);
 assert.equal(badge({status:'active',l_link_integration_enabled:true}),'利用可');assert.equal(badge({status:'inactive',l_link_integration_enabled:true}),'契約停止中');assert.equal(badge(null),'対象外');checks+=3;
 for(const name of ['inquiries/page.tsx','customer-follow-up/inspection-reminders/page.tsx','settings/billing/page.tsx']){const result=ts.transpileModule(fs.readFileSync(path.join(root,'apps/garage-link/src/app',name),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);checks++;}
 console.log(JSON.stringify({status:'PASS',checks,network:0,scope:'actual extracted save/guard mocked local data; UI focus wiring static not browser proof'}));
})().catch(e=>{console.error(e);process.exitCode=1});
