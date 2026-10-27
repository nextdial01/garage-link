'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {captureGarageExpiry} from './actions';
type HeldExpiryCapture={token:string;receipt:string;releaseSha:string};
// Native fetch deliberately avoids Next Server Action's old deployment header.
// Readiness omits cookies; POST explicitly pins the returned public deployment.
async function probeCurrentExpiryDeployment(held:HeldExpiryCapture,fetcher:typeof fetch=fetch){
 let postAttempted=false;
 try{
  if(!held.token||held.token.length>16384||!held.receipt||held.receipt.length>2048||!/^[0-9a-f]{40}$/.test(held.releaseSha))return {code:'STOP_INVALID_HELD_METADATA_NO_RETRY',probe_request_started:false};
  const ready=await fetcher(`/api/qa/session-expiry?_qa_readiness=${Date.now().toString(36)}`,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(ready.status!==200)return {code:'STOP_READINESS_HTTP_STATUS_NO_RETRY',status:ready.status,probe_request_started:false};
  const identity:unknown=await ready.json();
  if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).sort().join(',')!=='deployment_id,kind,release_sha')return {code:'STOP_READINESS_SHAPE_NO_RETRY',probe_request_started:false};
  const r=identity as Record<string,unknown>;
  if(r.kind!=='QA_SESSION_EXPIRY_READINESS'||typeof r.deployment_id!=='string'||!/^dpl_[A-Za-z0-9]+$/.test(r.deployment_id)||r.release_sha!==held.releaseSha)return {code:'STOP_READINESS_IDENTITY_NO_RETRY',probe_request_started:false};
  postAttempted=true;
  const response=await fetcher('/api/qa/session-expiry',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/json','Content-Type':'application/json','x-deployment-id':r.deployment_id,'x-qa-expiry-expected-deployment-id':r.deployment_id,'x-qa-expiry-release-sha':held.releaseSha},body:JSON.stringify({token:held.token,receipt:held.receipt}),signal:AbortSignal.timeout(45000)});
  if(response.headers.get('x-qa-expiry-deployment-id')!==r.deployment_id||response.headers.get('x-qa-expiry-release-sha')!==held.releaseSha)return {code:'STOP_DEPLOYMENT_RESPONSE_MISMATCH_NO_RETRY',probe_request_started:true};
  if(response.status!==200)return {code:'STOP_QA_PROBE_HTTP_STATUS_NO_RETRY',status:response.status,probe_request_started:true};
  const value:unknown=await response.json();
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='code,evidence_class,get_status,patch_status')return {code:'STOP_QA_PROBE_SHAPE_NO_RETRY',probe_request_started:true};
  const result=value as Record<string,unknown>;
  const allowed=new Set(['DENIED','DEPENDENCY_RUNTIME_IDENTITY','DEPENDENCY_REAL_EXPIRY_OR_RECEIPT','BUSINESS_CASE_ALREADY_CONSUMED','STOP_UNEXPECTED_BUSINESS_READ_STATUS','STOP_UNEXPECTED_BUSINESS_WRITE_STATUS','UNKNOWN_BUSINESS_OUTCOME_NO_RETRY','BUSINESS_READ_WRITE_REJECTED_AFTER_REAL_EXPIRY']);
  const status=(n:unknown)=>n===null||(typeof n==='number'&&Number.isInteger(n)&&n>=100&&n<=599);
  if(typeof result.code!=='string'||!allowed.has(result.code)||result.evidence_class!=='real_expired_token_normal_Garage_mobile_business_routes'||!status(result.get_status)||!status(result.patch_status))return {code:'STOP_QA_PROBE_SHAPE_NO_RETRY',probe_request_started:true};
  return {code:result.code,get_status:result.get_status,patch_status:result.patch_status,evidence_class:result.evidence_class,probe_deployment_id:r.deployment_id,release_sha:held.releaseSha,probe_request_started:true};
 }catch{return {code:'UNKNOWN_QA_PROBE_TRANSPORT_NO_RETRY',probe_request_started:postAttempted};}
}

async function probeTokenlessExpiryTransport(fetcher:typeof fetch=fetch){
 let started=false;
 try{
  const ready=await fetcher(`/api/qa/session-expiry?_qa_transport=${Date.now().toString(36)}`,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(ready.status!==200)return {code:'STOP_TRANSPORT_READINESS_NO_RETRY',status:ready.status};
  const identity:unknown=await ready.json();
  if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).sort().join(',')!=='deployment_id,kind,release_sha')return {code:'STOP_TRANSPORT_IDENTITY_NO_RETRY'};
  const r=identity as Record<string,unknown>;
  if(r.kind!=='QA_SESSION_EXPIRY_READINESS'||typeof r.deployment_id!=='string'||!/^dpl_[A-Za-z0-9]+$/.test(r.deployment_id)||typeof r.release_sha!=='string'||!/^[0-9a-f]{40}$/.test(r.release_sha))return {code:'STOP_TRANSPORT_IDENTITY_NO_RETRY'};
  started=true;
  const response=await fetcher('/api/qa/session-expiry',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/json','Content-Type':'application/json','x-deployment-id':r.deployment_id,'x-qa-expiry-expected-deployment-id':r.deployment_id,'x-qa-expiry-release-sha':r.release_sha},body:'{}',signal:AbortSignal.timeout(10000)});
  if(response.headers.get('x-qa-expiry-deployment-id')!==r.deployment_id||response.headers.get('x-qa-expiry-release-sha')!==r.release_sha)return {code:'STOP_TRANSPORT_RESPONSE_IDENTITY_NO_RETRY',status:response.status};
  if(response.status!==400)return {code:'STOP_TRANSPORT_STATUS_NO_RETRY',status:response.status};
  const value:unknown=await response.json();
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).join(',')!=='code'||(value as Record<string,unknown>).code!=='INVALID_BODY')return {code:'STOP_TRANSPORT_BODY_NO_RETRY',status:400};
  return {code:'TOKENLESS_TRANSPORT_INVALID_BODY_CONFIRMED',status:400};
 }catch{return {code:started?'UNKNOWN_TRANSPORT_POST_NO_RETRY':'UNKNOWN_TRANSPORT_READINESS_NO_RETRY'};}
}

export default function GarageSessionExpiryPage(){
 const transportAttempted=useRef(false);
 const [transportConsumed,setTransportConsumed]=useState(false);
 const held=useRef<HeldExpiryCapture|null>(null),captureAttempted=useRef(false),businessAttempted=useRef(false);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[captureConsumed,setCaptureConsumed]=useState(false),[businessConsumed,setBusinessConsumed]=useState(false);
 useEffect(()=>()=>{held.current=null;},[]);
 return <main className="mx-auto max-w-2xl space-y-4 p-6">
  <h1>QA genuine GARAGE session expiry</h1>
  <button disabled={busy||!!held.current||captureConsumed||transportConsumed} onClick={async()=>{
   if(transportAttempted.current||captureAttempted.current||held.current)return;
   transportAttempted.current=true;setTransportConsumed(true);setBusy(true);
   try{setMessage(JSON.stringify(await probeTokenlessExpiryTransport()));}finally{setBusy(false);}
  }}>Before capture: tokenless transport preflight once</button>
  <p>Parent must reserve this product's one transport attempt in the durable ledger before clicking. No reload or retry. This preflight sends only an empty object and does not capture or test an access token.</p>
  <button disabled={busy||!!held.current||captureConsumed} onClick={async()=>{
   if(captureAttempted.current)return;captureAttempted.current=true;setCaptureConsumed(true);setBusy(true);
   try{
    const s=await createClient().auth.getSession(),token=s.data.session?.access_token;
    if(s.error||!token){setMessage('CURRENT_SESSION_UNAVAILABLE');return;}
    const r=await captureGarageExpiry(token);
    if(r.receipt&&r.capture_runtime)held.current={token,receipt:r.receipt,releaseSha:r.capture_runtime.release_sha};
    setMessage(JSON.stringify({code:r.code,seconds_until_expiry:r.seconds_until_expiry,valid_get_status:r.valid_get_status,capture_runtime:r.capture_runtime}));
   }catch{setMessage('UNKNOWN_CAPTURE');}finally{setBusy(false);}
  }}>Capture genuine session and fixed business read once</button>
  <button disabled={busy||!held.current||businessConsumed} onClick={async()=>{
   if(businessAttempted.current)return;businessAttempted.current=true;setBusinessConsumed(true);setBusy(true);
   try{
    const capture=held.current;if(!capture){setMessage('CURRENT_HELD_SESSION_UNAVAILABLE_NO_RETRY');return;}
    const result=await probeCurrentExpiryDeployment(capture);setMessage(JSON.stringify(result));
   }catch{setMessage('UNKNOWN_BUSINESS_OUTCOME_NO_RETRY');}finally{held.current=null;setBusy(false);}
  }}>After real expiry: fixed business GET/PATCH once</button>
  <button disabled={busy} onClick={()=>{held.current=null;setMessage('MEMORY_DISCARDED');}}>Discard held memory</button>
  <pre className="whitespace-pre-wrap">{message}</pre>
  <p>Capture performs one fixed normal business GET 200. Keep this page in memory, wait for real expiry, then activate a new ten-minute window and probe within five minutes of expiry. The probe discovers the current alias deployment without cookies and pins only its public deployment ID. Source release, exact Owner/store and signed receipt must still match. No reload, retry, token extraction, or persistent token storage. Older already-open capture pages cannot use this recovery path. Parent durable once and before/after checks remain required.</p>
 </main>;
}
