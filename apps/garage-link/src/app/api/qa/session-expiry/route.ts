import {sessionExpiryReadiness, probeGarageExpiredBusinessRoutes} from '@/app/qa/session-expiry/actions';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=45;
const ORIGIN='https://garage-link.tech';
const MAX_BYTES=20000;
const noStore={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store'};
async function identityHeaders(){
 const identity=await sessionExpiryReadiness();
 return {identity,headers:{...noStore,...(identity?{'x-qa-expiry-deployment-id':identity.deployment_id,'x-qa-expiry-release-sha':identity.release_sha}:{})}};
}
export async function GET(){
 const {identity,headers}=await identityHeaders();
 return Response.json(identity?{kind:'QA_SESSION_EXPIRY_READINESS',...identity}:{code:'DEPENDENCY_RUNTIME_IDENTITY'},{status:identity?200:503,headers});
}
export async function POST(request:Request){
 const {identity,headers}=await identityHeaders();
 const fail=(code:string,status:number)=>Response.json({code},{status,headers});
 if(!identity)return fail('DEPENDENCY_RUNTIME_IDENTITY',503);
 // Public version headers only: no token is used as routing or URL metadata.
 if(request.headers.get('origin')!==ORIGIN||request.headers.get('sec-fetch-site')!=='same-origin')return fail('DENIED',403);
 if(request.headers.get('x-deployment-id')!==identity.deployment_id||request.headers.get('x-qa-expiry-release-sha')!==identity.release_sha)return fail('DEPLOYMENT_MISMATCH_NO_CASE',409);
 if((request.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()!=='application/json')return fail('INVALID_MEDIA_TYPE',415);
 const declared=request.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_BYTES))return fail('INVALID_BODY_SIZE',413);
 let input:unknown;
 try{
  const reader=request.body?.getReader();if(!reader)return fail('INVALID_BODY',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return fail('INVALID_BODY_SIZE',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }catch{return fail('INVALID_BODY',400);}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='receipt,token')return fail('INVALID_BODY',400);
 const {token,receipt}=input as Record<string,unknown>;
 if(typeof token!=='string'||!token||token.length>16384||typeof receipt!=='string'||!receipt||receipt.length>2048)return fail('INVALID_BODY',400);
 try{
  // Reuses exact cookie actor/workspace/role, Origin, ten-minute gate, signed
  // receipt, real-expiry, once and fixed business resource checks unchanged.
  const observed=await probeGarageExpiredBusinessRoutes(token,receipt);
  return Response.json(observed,{headers});
 }catch{return fail('UNKNOWN_BUSINESS_OUTCOME_NO_RETRY',500);}
}
