import {optionOperationRecovery,type RecoveryOperation} from './optionOperationRecovery';
// Addon-only command, wired through authenticated addonWiring.
import {assertOptionPlan,nextOptionQuantity,optionConfig,parseOptionRequest,type OptionPrice,type OptionSubscription,type OptionType} from '../../src/lib/billing/garageOptionChange';
import {requireAddonScope,type AddonRelease} from './addonContract';
type Row={company_id:string;tenant_id:string;plan:string;stripe_subscription_id:string;stripe_customer_id:string|null;extra_staff_count:number;extra_store_count:number;extra_storage_gb:number};
type Auth={userId:string;tenantId:string;storeId:string;role:string;aal:string};
type Input=ReturnType<typeof parseOptionRequest>;
type Operation=RecoveryOperation&{id:string;requested_options:{type:string;action:string;amount:number}};
export type OptionPorts={
 recoveryBlock(tenant:string):Promise<RecoveryOperation|null>;schemaReady():Promise<boolean>;row(tenant:string):Promise<Row|null>;price(type:OptionType):Promise<OptionPrice>;
 priceId(type:OptionType):string;basePriceId(plan:string):string;previous(tenant:string,key:string):Promise<Operation|null>;
 lease<T>(subscription:string,run:()=>Promise<T>):Promise<T>;subscription(id:string):Promise<OptionSubscription>;
 begin(row:Row,actor:string,key:string,input:Input):Promise<string>;checkpoint(id:string,target:Record<string,unknown>):Promise<void>;
 mutate(id:string,items:ReadonlyArray<Record<string,unknown>>,key:string,metadata:Record<string,string>,policy:{proration_behavior:'none';payment_behavior:'error_if_incomplete'}):Promise<void>;
 applied(id:string):Promise<void>;failure(id:string,uncertain:boolean):Promise<void>;consentMetadata():Record<string,string>;
};
export function assertLivePrice(p:OptionPrice,type:OptionType,id:string){return assertProviderPrice(p,type,id,'live');}
function assertProviderPrice(p:OptionPrice,type:OptionType,id:string,mode:'live'|'test'){
 if(p.id!==id||p.livemode!==(mode==='live')||!p.active||p.currency!=='jpy'||p.unit_amount!==optionConfig[type].price
  ||p.recurring?.interval!=='month'||p.recurring.interval_count!==1||p.recurring.usage_type!=='licensed'
  ||!['inclusive','unspecified'].includes(p.tax_behavior??''))throw Error('commercial_price_contract_mismatch');
}
function assertProviderSubscription(s:OptionSubscription,r:Row,price:string,base:string,mode:'live'|'test'){
 const customer=typeof s.customer==='string'?s.customer:s.customer.id;
 if(s.livemode!==(mode==='live')||s.status!=='active'||s.cancel_at_period_end||s.metadata.company_id!==r.company_id
  ||s.metadata.plan_code!==r.plan||(s.metadata.tenant_id&&s.metadata.tenant_id!==r.tenant_id)
  ||s.automatic_tax?.enabled!==false||(s.default_tax_rates?.length??0)>0||s.items.data.some(i=>(i.tax_rates?.length??0)>0)
  ||!r.stripe_customer_id||customer!==r.stripe_customer_id)throw Error('commercial_subscription_scope_mismatch');
 if(!base||s.items.data.filter(i=>i.price.id===base&&i.quantity===1).length!==1)throw Error('commercial_base_plan_mismatch');
 const matches=s.items.data.filter(i=>i.price.id===price);
 if(matches.length>1||!Number.isSafeInteger(matches[0]?.quantity??0)||(matches[0]?.quantity??0)<0||(matches[0]?.quantity??0)>10000)throw Error('commercial_provider_quantity_invalid');return matches[0];
}
export async function executeCommercialOptionCandidate(release:AddonRelease,auth:Auth,key:string,payload:unknown,p:OptionPorts){
 requireAddonScope(release,auth.tenantId,auth.storeId);
 return executeOptionCommand(auth,key,payload,p,{mode:'live',assertScope:()=>requireAddonScope(release,auth.tenantId,auth.storeId)});
}
// Explicit dependency boundary for isolated TEST acceptance; deployed caller remains LIVE-only.
export async function executeOptionCommand(auth:Auth,key:string,payload:unknown,p:OptionPorts,boundary:{mode:'live'|'test';assertScope():unknown}){
 boundary.assertScope();
 if(!auth.userId||auth.aal!=='aal2'||!['owner','admin'].includes(auth.role))throw Error('commercial_actor_forbidden');
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(key))throw Error('idempotency_key_required');const input=parseOptionRequest(payload);
 if(!await p.schemaReady())throw Error('commercial_schema_not_ready');const row=await p.row(auth.tenantId);
 if(!row?.stripe_subscription_id||row.tenant_id!==auth.tenantId)throw Error('paid_subscription_required');assertOptionPlan(row.plan,input.type);
 const priceIds=Object.keys(optionConfig).map(type=>p.priceId(type as OptionType));
 if(priceIds.some(id=>!/^price_[A-Za-z0-9_]+$/.test(id))||new Set(priceIds).size!==3)throw Error('commercial_catalog_missing');
 for(const type of Object.keys(optionConfig) as OptionType[])assertProviderPrice(await p.price(type),type,p.priceId(type),boundary.mode);
 const prior=await p.previous(auth.tenantId,key);
 if(prior){if(prior.requested_options.type!==input.type||prior.requested_options.action!==input.action||prior.requested_options.amount!==input.amount)throw Error('idempotency_payload_conflict');return{...optionOperationRecovery(prior),status:optionOperationRecovery(prior).status==='completed'?200:409,recovery:optionOperationRecovery(prior).status,duplicate:true};}
 let operation:string|null=null,attempted=false;
 try{return await p.lease(row.stripe_subscription_id,async()=>{
  const c=optionConfig[input.type],stored=row[c.field];if(!Number.isSafeInteger(stored)||stored<0||stored%c.unit!==0)throw Error('invalid_stored_quantity');
  // Recheck under the lease: a concurrent retry may have completed since the fast path.
  const existing=await p.previous(auth.tenantId,key);
  if(existing){if(existing.requested_options.type!==input.type||existing.requested_options.action!==input.action||existing.requested_options.amount!==input.amount)throw Error('idempotency_payload_conflict');return {...optionOperationRecovery(existing),status:optionOperationRecovery(existing).status==='completed'?200:409,recovery:optionOperationRecovery(existing).status,duplicate:true};}
  const blocked=await p.recoveryBlock(auth.tenantId);
  if(blocked){const recovery=optionOperationRecovery(blocked);return {...recovery,status:409,recovery:recovery.status,duplicate:false};}
  const authoritative=await p.subscription(row.stripe_subscription_id),price=p.priceId(input.type);
  const item=assertProviderSubscription(authoritative,row,price,p.basePriceId(row.plan),boundary.mode);
  // DB extra_* are retained entitlements, not billable quantities. Stripe is authoritative.
  const current=item?.quantity??0,quantity=nextOptionQuantity(input,current);
  operation=await p.begin(row,auth.userId,key,input);if(!operation)throw Error('option_operation_conflict');
  await p.checkpoint(operation,{type:input.type,action:input.action,amount:input.amount,expected_quantity:quantity,price_id:price});
  attempted=true;await p.mutate(row.stripe_subscription_id,item?quantity===0?[{id:item.id,deleted:true}]:[{id:item.id,quantity}]:[{price,quantity}],`garage-option:${auth.tenantId}:${key}`,{...authoritative.metadata,...p.consentMetadata()},{proration_behavior:'none',payment_behavior:'error_if_incomplete'});
  await p.applied(operation);return{status:202,duplicate:false,pending:true,quantity};
 });}catch(e){if(operation)await p.failure(operation,attempted);throw e;}
}
// Binding contract: mutate must use proration_behavior='none', payment_behavior='error_if_incomplete';
// webhook alone applies entitlements; failure persists an absolute target, never a relative increment.
