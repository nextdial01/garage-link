// Local-only SSR fixture harness. Never imported by the application entry point.
// Hooks are seeded in this process only; no authentication or network API runs.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const states = [...source.matchAll(/const \[(\w+)(?:,\s*\w+)?\] = useState/g)].map((match) => match[1]);
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
const font = fs.readFileSync(require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')).toString('base64');
let seed = {}, index = 0, collecting = false, width = 390;
const fakeReact = { ...React, useState(value) { if (!collecting) return React.useState(value); const name = states[index++]; return [Object.hasOwn(seed, name) ? seed[name] : (typeof value === 'function' ? value() : value), () => {}]; }, useRef(value) { return collecting ? {current:value} : React.useRef(value); }, useEffect(fn, deps) { if (!collecting) React.useEffect(fn, deps); }, useEffectEvent(fn) { return fn; }, useMemo(fn, deps) { return collecting ? fn() : React.useMemo(fn, deps); } };
const filename = path.join(root, 'App.quality-preview.cjs');
const compiled = new Module(filename, module);compiled.filename=filename;compiled.paths=Module._nodeModulePaths(root);
compiled.require=(id)=>{
  if(id==='react')return fakeReact;
  if(id==='react-native')return {...RN,useWindowDimensions:()=>({width,height:844,scale:1,fontScale:1})};
  if(id==='react-native-safe-area-context')return {SafeAreaProvider:({children})=>children,SafeAreaView:({edges,children,...props})=>React.createElement(RN.View,props,children)};
  if(id==='@expo/vector-icons/Ionicons')return ({name,size,color})=>React.createElement('span',{'aria-hidden':true,style:{fontFamily:'Ionicons',fontSize:size,color,lineHeight:1}},String.fromCodePoint(glyphs[name]));
  if(id==='./src/mobileApi')return {mobileApi:new Proxy({}, {get(){return ()=>{throw Error('Network disabled in local fixture');};}}),MobileApiError:class extends Error{}};
  if(id==='./src/supabase')return {mobileConfigurationError:null,supabase:{}};
  if(id.startsWith('expo-'))return {};
  if(id.endsWith('.png'))return {uri:'data:image/png;base64,'+fs.readFileSync(path.resolve(root,id)).toString('base64')};
  if(id.startsWith('./src/'))return require(path.resolve(root,id+'.ts'));
  return require(id);
};
compiled._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const store={id:'fixture-store',tenantId:'fixture-tenant',name:'審査用デモ店舗',role:'staff'};
const vehicle={id:'fixture-vehicle',managementNo:'DEMO-001',maker:'デモ自動車',modelName:'サンプルワゴン',grade:'標準',registrationNo:'デモ 100 あ 0001',mileageKm:28000,color:'ホワイト',totalPrice:1480000,status:'在庫中',locationName:'展示場 A',description:'合成データ'};
const job={id:'fixture-job',job_no:'M-DEMO-001',job_type:'定期点検',status:'working',scheduled_in_at:'2026-09-10T00:00:00Z',scheduled_delivery_at:'2026-09-10T07:00:00Z',assigned_user_name:'デモ担当',estimated_total_amount:55000};
const customer={id:'fixture-customer',name:'デモ顧客 株式会社',kana:'デモコキャク',phone:'000-0000-0000',mobile_phone:null,email:'demo@example.invalid',address:'架空市 デモ町 1-2-3',customer_status:'active',assigned_user_name:'デモ担当',next_action_date:null,updated_at:null};
const quote={id:'fixture-quote',quoteNo:'Q-DEMO-001',title:'定期点検のお見積',status:'draft',issueDate:'2026-09-10',expiryDate:'2026-09-30',customerId:customer.id,vehicleId:vehicle.id,customerName:customer.name,customerPhone:customer.phone,customerEmail:customer.email,customerAddress:customer.address,customerHonorific:'御中',vehicleLabel:'DEMO-001 サンプルワゴン',subtotalAmount:50000,taxAmount:5000,discountAmount:0,tradeInAmount:0,totalAmount:55000,customerNote:null,updatedAt:null,items:[{id:'fixture-item',itemType:'service',name:'定期点検・整備一式',quantity:1,unitPrice:50000,taxRate:0.1,taxAmount:5000,amount:50000}]};
const pages=['login','stores','today','vehicles','vehicleDetail','maintenance','maintenanceDetail','customers','customerDetail','quotes','quoteCreate','quotePreview'];
function render(url){
 width=Math.min(1024,Math.max(320,Number(url.searchParams.get('width'))||390));const page=url.searchParams.get('screen')||'today';
 seed={session:page==='login'?null:{user:{id:'fixture-user'}},authResolved:true,stores:[store],store,page:page==='login'?'stores':page,vehicles:[vehicle],vehicle:{vehicle,imageFiles:[]},today:{appointments:[],deliveries:[job],incompleteWork:[job],assignedWork:[job]},jobs:[job],job,customers:[customer],customer:{customer,vehicles:[vehicle],maintenance:[job],deals:[],quotes:[quote]},quotes:[quote],quote,email:'',password:'',vehicleSearch:url.searchParams.get('search')||'',customerSearch:url.searchParams.get('search')||'',error:url.searchParams.has('error')?'通信に時間がかかっています。接続を確認して再試行してください。':null,loading:url.searchParams.has('loading')};
 for(const name of ['vehicleOffset','customerOffset','maintenanceOffset','quoteOffset'])seed[name]=url.searchParams.has('more')?100:null;
 if(url.searchParams.has('empty'))Object.assign(seed,{stores:[],vehicles:[],jobs:[],customers:[],quotes:[],today:{appointments:[],deliveries:[],incompleteWork:[],assignedWork:[]}});
 collecting=true;index=0;const tree=compiled.exports.GarageMobileApp();collecting=false;
 const html=renderToStaticMarkup(tree);const sheet=RN.StyleSheet.getSheet();
 const links=pages.map(p=>`<a href="/?screen=${p}&width=${width}">${p}</a>`).join(' ');
 return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GARAGE internal synthetic UI</title><style>${sheet.textContent}\n@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})}body{margin:0;background:#e9eef4;font-family:system-ui}aside{padding:10px;font-size:12px;line-height:2}a{padding:4px;color:#124a79}.phone{width:${width}px;height:844px;display:flex;flex-direction:column;margin:0 auto;background:white;overflow:hidden;border:1px solid #abb6c0}.phone>div{min-height:0}</style><aside>内部合成データ・RN Web SSR・実機版ではありません。操作は画面リンクのみ。<br>${links}<br><a href="/?screen=${page}&width=${width}&error=1">error</a> <a href="/?screen=${page}&width=${width}&empty=1">empty</a> <a href="/?screen=${page}&width=${width}&loading=1">loading</a> <a href="/?screen=${page}&width=320">320</a> <a href="/?screen=${page}&width=820">820</a></aside><main class="phone">${html}</main>`;
}
module.exports={render};
if(require.main === module) http.createServer((req,res)=>{try{const html=render(new URL(req.url,'http://127.0.0.1'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);}catch(error){res.writeHead(500);res.end('Local fixture render failed');console.error(error.message);}}).listen(8793,'127.0.0.1',()=>console.log('GARAGE_SYNTHETIC_PREVIEW=http://127.0.0.1:8793'));
