// Request-scoped QA marker-RPC fault. Call only AFTER normal HMAC/context/body validation.
// No keys, DB/network, env access, global hooks, or automatic execution in this module.
const TENANT='4f2c6f87-524c-4b50-9b22-48928603c24c';
const STORE='45d624bb-37ca-4183-a5c4-8ed932a69616';
const RESPONSE='ddae9494-b274-41c1-a490-b2dedd46fb10';
const FORM='c2e93210-15ca-4cbb-af8c-05694b261cd4';
const SOURCE='qa_receiver_only_11c8de37-e099-4d2f-b5fe-659a9fda14f5';
const MARKER='qa-all55-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createInquiryMarkerFault({bodyText,validatedBody,context,keyId,enabled,expiresAt,now=Date.now()}){
 if(enabled!=='1'||!Number.isSafeInteger(expiresAt)||!Number.isSafeInteger(now)||expiresAt<=now||expiresAt>now+600000)return null;
 if(context?.tenantId!==TENANT||context?.storeId!==STORE||keyId!=='default'||validatedBody?.response_id!==RESPONSE||validatedBody?.form_id!==FORM||validatedBody?.source!==SOURCE)return null;
 let raw;try{raw=JSON.parse(bodyText);}catch{return null;}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw._qa_marker_failure!==MARKER||raw.source!==SOURCE||typeof raw.response_id!=='string'||typeof raw.form_id!=='string'||raw.response_id.toLowerCase()!==RESPONSE||raw.form_id.toLowerCase()!==FORM)return null;
 let applied=0;
 return Object.freeze({
  get observed(){return applied>0;},
  decorate(client,expectedInquiryId){
   if(!UUID.test(expectedInquiryId))throw Error('QA_MARKER_SCOPE_REFUSED');
   return new Proxy(client,{get(target,key){
    if(key!=='rpc'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}
    return(name,params,...options)=>{
     if(name!=='mark_verified_llink_inquiry_connected')return target.rpc(name,params,...options);
     if(Date.now()>=expiresAt)throw Error('QA_MARKER_WINDOW_EXPIRED');
     if(options.length||!params||Object.keys(params).sort().join(',')!=='p_inquiry_id,p_key_id,p_response_id,p_store_id,p_tenant_id'||params.p_tenant_id!==TENANT||params.p_store_id!==STORE||params.p_key_id!=='default'||params.p_inquiry_id!==expectedInquiryId||params.p_response_id!==RESPONSE)throw Error('QA_MARKER_SCOPE_REFUSED');
     // Refuse only this exact marker call; every other SDK method stays real.
     applied++;
     return Promise.resolve({data:null,error:{code:'QA_CONTROLLED_MARKER_FAILURE',message:'QA controlled marker dependency failure'}});
    };
   }});
  },
 });
}
