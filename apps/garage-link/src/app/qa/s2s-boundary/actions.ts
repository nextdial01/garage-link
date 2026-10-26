'use server';
import 'server-only';
import crypto from 'node:crypto';
import {headers} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {verifyLLinkS2SRequest,buildS2SSignature} from '@/lib/line-link/s2sAuth';
import {CASES,expectedForOffset} from './cases.mjs';
const OWNER='14cbd9ff-779e-4893-8ca8-5a0ce73e66fb',STORE='45d624bb-37ca-4183-a5c4-8ed932a69616',TENANT='4f2c6f87-524c-4b50-9b22-48928603c24c';
let busy=false,stopped=false;const used=new Set<string>();
export async function runBoundary(_previous:unknown,form:FormData){
 const entries=Array.from(form.entries()).filter(([k])=>!k.startsWith('$ACTION_'));
 const key=entries[0]?.[1];const deny=()=>({caseID:null,status:null,code:'QA_DENIED',match:false});
 if(entries.length!==1||entries[0][0]!=='caseID'||typeof key!=='string'||!Object.hasOwn(CASES,key))return deny();
 const h=await headers();if(h.get('origin')!=='https://garage-link.tech'||h.get('sec-fetch-site')!=='same-origin')return deny();
 const expiry=Number(process.env.GARAGE_QA_S2S_BOUNDARY_EXPIRES_AT??'0'),realNow=Date.now();
 if(process.env.GARAGE_QA_S2S_BOUNDARY_ENABLED!=='1'||!Number.isSafeInteger(expiry)||expiry<=realNow||expiry>realNow+600000)return deny();
 const user=await createClient();const{data,error}=await user.auth.getUser();if(error||data.user?.id!==OWNER)return deny();
 const{data:member,error:me}=await user.from('current_user_active_store_membership').select('tenant_id,store_id,role').eq('user_id',OWNER).eq('status','active').single();
 if(me||!member||typeof member!=='object'||!('tenant_id'in member)||!('store_id'in member)||!('role'in member)||member.tenant_id!==TENANT||member.store_id!==STORE||member.role!=='owner')return deny();
 if(busy||stopped||used.has(key)||Date.now()>=expiry)return deny();
 const secret=process.env.LL_INBOUND_S2S_SECRET__DEFAULT;if(!secret||secret.length<32)return deny();
 busy=true;used.add(key);
 try{
  // Clock is fixed for this invocation only; never mutates Date.now/env. Secret/nonce/signature stay memory only.
  const fixedNow=Date.now(),offset=CASES[key as keyof typeof CASES],timestamp=Math.floor(fixedNow/1000)+offset,nonce=crypto.randomBytes(24).toString('base64url');
  const path='/api/s2s/line-link/delivery-candidates',body='{}';
  const signature=buildS2SSignature({method:'POST',path,timestamp,nonce,storeId:STORE,body,secret});
  const result=await verifyLLinkS2SRequest({method:'POST',path,body,headers:new Headers({'x-ll-key-id':'default','x-ll-store-id':STORE,'x-ll-timestamp':String(timestamp),'x-ll-nonce':nonce,'x-ll-signature':signature})},()=>fixedNow);
  const expected=expectedForOffset(offset);const match=expected?result.ok&&result.tenantId===TENANT&&result.storeId===STORE:!result.ok&&result.status===401&&result.code==='expired_timestamp';
  if(!match)stopped=true;
  return {caseID:key,status:result.ok?200:result.status,code:result.ok?'authenticated':result.code,match,evidenceClass:'normal_auth_helper_live_nonce_DB_request_scoped_fixed_clock_not_HTTP_boundary'};
 }catch{stopped=true;return {caseID:key,status:null,code:'QA_UNKNOWN_OUTCOME',match:false};}finally{busy=false;}
}
