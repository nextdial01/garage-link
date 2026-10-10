// Server-only GL/Stripe binding used by the addon purchase route.
import 'server-only';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {getStripeClient} from '../../src/lib/stripe/client';
import {withGarageSubscriptionMutationLease} from '../../src/lib/stripe/garageSubscriptionSync';
import {createTermsConsentMetadata} from '../../src/lib/legal/termsConsent';
import {optionConfig,type OptionPrice,type OptionSubscription} from '../../src/lib/billing/garageOptionChange';
import type {OptionPorts} from './optionPurchase';
export function createCommercialOptionPorts():OptionPorts{
 if(!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')||process.env.VERCEL_ENV!=='production'||process.env.GARAGE_STRIPE_MOCK_MODE==='true')throw Error('commercial_provider_mode_invalid');
 const admin=createAdminClient(),stripe=getStripeClient();if(!admin||!stripe)throw Error('commercial_clients_missing');
 return createOptionPortBinding(admin,stripe,process.env,withGarageSubscriptionMutationLease);
}
// Same DB/provider binding consumed by the isolated TEST adapter; no environment spoof.
export function createOptionPortBinding(admin:NonNullable<ReturnType<typeof createAdminClient>>,stripe:NonNullable<ReturnType<typeof getStripeClient>>,env:Record<string,string|undefined>,lease:typeof withGarageSubscriptionMutationLease):OptionPorts{
 return{
  schemaReady:async()=>{const r=await admin.rpc('garage_addon_release_ready');return !r.error&&r.data===true;},
  row:async tenant=>{const r=await admin.from('company_subscriptions').select('company_id,tenant_id,plan,stripe_subscription_id,stripe_customer_id,extra_staff_count,extra_store_count,extra_storage_gb').eq('tenant_id',tenant).eq('status','active').maybeSingle();if(r.error)throw Error('subscription_lookup_failed');return r.data;},
  priceId:type=>env[optionConfig[type].env]?.trim()??'',basePriceId:plan=>env[`STRIPE_PRICE_${plan.toUpperCase()}`]?.trim()??'',
  price:async type=>await stripe.prices.retrieve(env[optionConfig[type].env]?.trim()??'') as OptionPrice,
  previous:async(tenant,key)=>{const r=await admin.from('billing_sync_operations').select('id,status,requested_options').eq('tenant_id',tenant).eq('idempotency_key',key).maybeSingle();if(r.error)throw Error('operation_lookup_failed');return r.data;},
  lease,subscription:async id=>await stripe.subscriptions.retrieve(id) as OptionSubscription,
  begin:async(row,actor,key,input)=>{const r=await admin.rpc('begin_garage_billing_operation',{p_tenant_id:row.tenant_id,p_company_id:row.company_id,p_actor_user_id:actor,p_operation_type:'change_option',p_idempotency_key:key,p_target_plan:row.plan,p_target_options:{type:input.type,action:input.action,amount:input.amount},p_stripe_subscription_id:row.stripe_subscription_id});if(r.error||!r.data?.ok||!r.data.id)throw Error('option_operation_conflict');return r.data.id;},
  checkpoint:async(id,target)=>{const r=await admin.from('billing_sync_operations').update({target_options:target,status:'reconciliation_required',next_retry_at:new Date(Date.now()+60_000).toISOString()}).eq('id',id).eq('status','started').select('id').maybeSingle();if(r.error||!r.data?.id)throw Error('option_checkpoint_failed');},
  mutate:async(id,items,key,metadata,policy)=>{await stripe.subscriptions.update(id,{items:[...items],metadata,...policy},{idempotencyKey:key});},
  applied:async id=>{const r=await admin.from('billing_sync_operations').update({status:'stripe_applied'}).eq('id',id).eq('status','reconciliation_required').select('id').maybeSingle();if(r.error)throw Error('option_checkpoint_failed');if(!r.data){const read=await admin.from('billing_sync_operations').select('status').eq('id',id).single();if(read.error||read.data?.status!=='completed')throw Error('option_checkpoint_failed');}},
  failure:async(id,uncertain)=>{const r=await admin.from('billing_sync_operations').update({status:uncertain?'reconciliation_required':'failed',diagnostic_code:'commercial_option_change_failed',next_retry_at:uncertain?new Date(Date.now()+60_000).toISOString():null}).eq('id',id).in('status',['started','reconciliation_required','stripe_applied']);if(r.error)throw Error('option_recovery_checkpoint_failed');},
  consentMetadata:createTermsConsentMetadata,
 };
}
