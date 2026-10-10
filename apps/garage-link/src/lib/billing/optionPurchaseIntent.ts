import type {OptionRequest} from './garageOptionChange';
export type OptionIntent={key:string;payload:OptionRequest;state:'uncertain'|'pending'|'completed'};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'>;
type Transport=(url:string,init:RequestInit)=>Promise<Pick<Response,'ok'|'status'|'json'>>;
// One unresolved intent per active store. Payload identity is never a purchase identity.
export function createOptionPurchaseIntent(storage:Storage,storeId:string,transport:Transport,newKey:()=>string,onChange:(intent:OptionIntent|null)=>void){
 const slot=`garage-option-intent-v2:${storeId}`;let intent:OptionIntent|null=null,busy=false;
 try{const saved=JSON.parse(storage.getItem(slot)??'null') as OptionIntent|null;
  if(saved&&/^[a-zA-Z0-9_-]{8,100}$/.test(saved.key)&&saved.payload?.termsAccepted===true&&['uncertain','pending','completed'].includes(saved.state))intent=saved;
 }catch{}
 function save(){storage.setItem(slot,JSON.stringify(intent));onChange(intent?{...intent}:null);}
 async function send(current:OptionIntent){
  try{
   const response=await transport('/api/billing/change-options',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':current.key},body:JSON.stringify(current.payload)});
   const result=await response.json() as {ok?:boolean;pending?:boolean;error?:string};
   if(response.status===409&&result.pending){intent={...current,state:'pending'};save();return {pending:true};}
   if(!response.ok||!result.ok)throw Error(result.error??'追加オプションの申込結果を確認してください。');
   intent={...current,state:result.pending?'pending':'completed'};save();return {pending:!!result.pending};
  }catch(error){intent={...current,state:'uncertain'};save();throw error;}
 }
 async function run(current:OptionIntent){if(busy)throw Error('申込処理中です。');busy=true;try{return await send(current);}finally{busy=false;}}
 return {
  current:()=>intent?{...intent}:null,
  async recover(){
   if(!intent||busy)return;const current=intent;busy=true;
   try{const response=await transport('/api/billing/change-options',{method:'GET',headers:{'Idempotency-Key':current.key},cache:'no-store'});
    if(!response.ok)throw Error('前回申込の確認ができませんでした。');
    const result=await response.json() as {ok?:boolean;found?:boolean;status?:string};if(!result.ok)throw Error('前回申込の確認ができませんでした。');
    // Only authoritative completion permits a distinct new purchase.
    intent={...current,state:result.found&&result.status==='completed'?'completed':result.found?'pending':'uncertain'};save();
   }finally{busy=false;}
  },
  start(payload:OptionRequest){
   if(busy)throw Error('申込処理中です。');
   if(intent&&intent.state!=='completed')throw Error('前回申込を確認・再試行してください。');
   intent={key:newKey(),payload:{...payload},state:'uncertain'};save();return run(intent);
  },
  retry(){if(!intent)throw Error('再試行する申込がありません。');return run(intent);},
 };
}
