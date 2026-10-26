'use server';
import 'server-only';
import {headers} from 'next/headers';
import {createClient} from '@/lib/supabase/server';
import {runInspectionJobGET,runInspectionJobPOST,type InspectionJobServiceFactory} from '@/lib/jobs/inspectionReminderHandlers';
const OWNER='14cbd9ff-779e-4893-8ca8-5a0ce73e66fb';
const STORE='45d624bb-37ca-4183-a5c4-8ed932a69616';
const TENANT='4f2c6f87-524c-4b50-9b22-48928603c24c';
export async function runJobDiagnostic(_previous:unknown,form:FormData) {
 const entries=Array.from(form.entries()).filter(([k])=>!k.startsWith('$ACTION_'));
 const caseID=entries[0]?.[1];
 const deny=()=>({caseID:null,status:null,code:'QA_DIAGNOSTIC_DENIED',rpcCalls:0});
 if(entries.length!==1||entries[0][0]!=='caseID'||!['config_missing','enumeration_failure'].includes(String(caseID)))return deny();
 const h=await headers();if(h.get('origin')!=='https://garage-link.tech'||h.get('sec-fetch-site')!=='same-origin')return deny();
 const now=Date.now(),expiry=Number(process.env.GARAGE_QA_JOB_DIAGNOSTIC_EXPIRES_AT??'0');
 if(process.env.GARAGE_QA_JOB_DIAGNOSTIC_ENABLED!=='1'||!Number.isFinite(expiry)||expiry<=now||expiry>now+600000)return deny();
 const client=await createClient();const {data,error}=await client.auth.getUser();
 if(error||data.user?.id!==OWNER)return deny();
 const {data:member,error:memberError}=await client.from('current_user_active_store_membership').select('tenant_id,store_id,role').eq('user_id',OWNER).eq('status','active').single();
 if(memberError||!member||typeof member!=='object'||!('tenant_id' in member)||!('store_id' in member)||!('role' in member)||member.tenant_id!==TENANT||member.store_id!==STORE||member.role!=='owner')return deny();
 let calls=0;
 const request=new Request('https://garage-link.tech/api/jobs/inspection-reminders',{method:'POST',headers:{'x-garage-store-id':STORE}});
 let response:Response;
 if(caseID==='config_missing')response=await runInspectionJobPOST(request,()=>null);
 else {
  // Existing configured secret stays server memory only. Never returned or logged.
  const cronSecret=process.env.CRON_SECRET;if(!cronSecret)return {caseID:String(caseID),status:null,code:'QA_EXISTING_CRON_CONFIG_UNAVAILABLE',rpcCalls:0};
  const fakeService=new Proxy({rpc:async(name:string)=>{calls++;if(name!=='service_list_eligible_garage_stores'||calls!==1)throw Error('QA_UNPLANNED_RPC');return {data:null,error:{code:'QA_CONTROLLED',message:'QA_SYNTHETIC_EXCEPTION_NOT_REAL'}};}},{get(target,key){if(key!=='rpc')throw Error('QA_UNPLANNED_SERVICE_ACCESS');return Reflect.get(target,key);}});
  const factory=(()=>fakeService) as unknown as InspectionJobServiceFactory;
  // Normal GET keeps its real automation and existing cron checks. Controlled enumeration probe has a permanently failing in-memory service; no automation is enabled.
  response=await runInspectionJobGET(new Request(request.url,{method:'GET',headers:{authorization:`Bearer ${cronSecret}`}}),factory,true);
 }
 const body=await response.json();
 const safeCodes=new Set(['config_missing','inspection_job_failed','automation_disabled','unauthorized']);
 return {caseID:String(caseID),status:response.status,code:safeCodes.has(body?.code)?body.code:'QA_UNKNOWN_OUTCOME',rpcCalls:caseID==='enumeration_failure'?body?.qa_controlled_enumeration_calls??0:calls,
  evidenceClass:'deployed_normal_handler_controlled_request_scoped_service_failure_not_real_DB_outage'};
}
