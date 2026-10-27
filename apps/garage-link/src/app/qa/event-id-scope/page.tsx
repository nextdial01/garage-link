import 'server-only';
import {headers} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
const ACTOR='14cbd9ff-779e-4893-8ca8-5a0ce73e66fb',STORE='45d624bb-37ca-4183-a5c4-8ed932a69616',TENANT='4f2c6f87-524c-4b50-9b22-48928603c24c';
const bindings={A:'e2e0fbf6-09df-4dc8-b182-293ab464b868',B:'c5ec554e-f07c-5aaf-a47f-449c92bb0938',C:'20e30d7a-c277-5340-9acd-3566612544af',MISSING:'be77fd63-c9a2-5d16-b305-b0d8e12a1c8f'} as const;
type MemberRow={tenant_id:string;store_id:string;role:string};
type EventRow={id:string;store_id:string;status:string};
const used=new Set<string>();let busy=false,stopped=false;
async function observe(params:Record<string,string|string[]|undefined>){
 const key=params.case;
 if(key===undefined&&Object.keys(params).length===0)return {code:'NO_CASE_REQUESTED',caseConsumed:false};
 if(Object.keys(params).length!==1||typeof key!=='string'||!Object.hasOwn(bindings,key))return {code:'INVALID_FIXED_CASE',caseConsumed:false};
 const id=bindings[key as keyof typeof bindings];
 let claimed=false;
 try{
  const h=await headers(),site=h.get('sec-fetch-site'),now=Date.now(),end=Number(process.env.GARAGE_QA_S2S_BOUNDARY_EXPIRES_AT??'0');
  // Ordinary top-level GET has no Origin. Host, optional FetchSite, cookie identity and current scope bind this read.
  if(h.get('host')!=='garage-link.tech'||(site!==null&&!['none','same-origin','same-site'].includes(site))||process.env.GARAGE_QA_S2S_BOUNDARY_ENABLED!=='1'||!Number.isSafeInteger(end)||end<=now||end>now+600000)return {code:'DENIED_NO_CASE_CONSUMED',caseConsumed:false};
  const user=await createClient(),auth=await user.auth.getUser();
  if(auth.error||auth.data.user?.id!==ACTOR)return {code:'DENIED_NO_CASE_CONSUMED',caseConsumed:false};
  const member=await user.from<MemberRow>('current_user_active_store_membership').select('tenant_id,store_id,role').eq('user_id',ACTOR).eq('status','active').single();
  if(member.error||member.data?.tenant_id!==TENANT||member.data.store_id!==STORE||member.data.role!=='owner')return {code:'DENIED_NO_CASE_CONSUMED',caseConsumed:false};
  if(Date.now()>=end)return {code:'DENIED_NO_CASE_CONSUMED',caseConsumed:false};
  if(busy||stopped||used.has(key))return {code:'STOP_USED_OR_BUSY',caseConsumed:false};
  busy=true;claimed=true;used.add(key);
  // Parent durable ONCE/order is mandatory: this Set is not a cross-instance lock.
  // Same normal authenticated Supabase read/filter as prior terminal-state caller; project fields limited to non-PII.
  const response=await user.from<EventRow>('inspection_reminder_events').select('id,store_id,status').eq('store_id',STORE).eq('id',id);
  const validRows=Array.isArray(response.data),rows=response.data??[],rowCount=Array.isArray(rows)?rows.length:0;
  const httpStatus='status' in response&&typeof response.status==='number'?response.status:null;
  const exactRow=Array.isArray(rows)&&rows.length===1&&rows[0]?.id===id&&rows[0]?.store_id===STORE;
  const matched=validRows&&!response.error&&httpStatus===200&&(key==='A'?exactRow:rowCount===0);
  if(!matched)stopped=true;
  return {code:matched?'EXPECTED_SCOPED_READ':'UNEXPECTED_STOP_NO_RETRY',caseID:key,caseConsumed:true,supabaseHTTPStatus:httpStatus,rowCount,exactFixedRowAndStoreMatch:exactRow,expectedMatched:matched,evidenceClass:'normal_cookie_user_RLS_fixed_event_ID_read_QA_carrier_no_mutation'};
 }catch{if(claimed)stopped=true;return {code:claimed?'UNKNOWN_STOP_NO_RETRY':'DENIED_NO_CASE_CONSUMED',caseConsumed:claimed};}
 finally{if(claimed)busy=false;}
}
export default async function EventIdScopePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const result=await observe(await searchParams);
 return <main><h1>QA 固定イベントIDの読取スコープ</h1><p>親の永続原簿でA陽性からB・C・不存在を各1回管理します。通常cookieのユーザーRLSで読み取り、データ本文は表示しません。再読込・戻るによる再実行は禁止です。</p><form method="GET"><label>固定ケース<select name="case" defaultValue="A">{Object.keys(bindings).map(key=><option key={key}>{key}</option>)}</select></label><button>固定ケースを1回読む</button></form><pre>{JSON.stringify(result,null,2)}</pre></main>;
}
