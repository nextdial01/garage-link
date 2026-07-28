import { buildGaragePlanSubscriptionUpdate, parseGaragePlanCodeFromStripeMetadata } from '@/lib/stripe/garageBilling';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDefaultFreeSubscription } from '@/lib/billing/garageSubscription';

type ApplyResult =
  | { ok: true; companyId: string; plan: string }
  | { ok: false; reason: string };

export async function applyGaragePlanFromStripe(input: {
  companyId: string;
  planCode: string | null | undefined;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'suspended';
  stripeEvent?: { id: string; created: number };
}): Promise<ApplyResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, reason: 'admin_client_unavailable' };
  }

  const orderedPlan = parseGaragePlanCodeFromStripeMetadata(input.planCode) ?? 'starter';
  if (input.stripeEvent) {
    const { data, error } = await admin.rpc('apply_ordered_stripe_subscription_event', {
      p_company_id: input.companyId,
      p_plan: orderedPlan,
      p_status: input.status ?? 'active',
      p_customer_id: input.stripeCustomerId ?? null,
      p_subscription_id: input.stripeSubscriptionId ?? null,
      p_event_id: input.stripeEvent.id,
      p_event_created: input.stripeEvent.created,
    });
    if (error) return { ok: false, reason: error.message };
    const applied = data as { ok?: boolean } | null;
    if (!applied?.ok) return { ok: false, reason: 'ordered_subscription_apply_failed' };
    return { ok: true, companyId: input.companyId, plan: orderedPlan };
  }

  if (input.status === 'cancelled') {
    const { error } = await admin.rpc('mark_company_subscription_cancelled', {
      p_company_id: input.companyId,
    });

    if (error) {
      return { ok: false, reason: error.message };
    }

    return { ok: true, companyId: input.companyId, plan: orderedPlan };
  }

  const plan = parseGaragePlanCodeFromStripeMetadata(input.planCode);

  if (!plan) {
    return { ok: false, reason: 'invalid_plan' };
  }

  const { error: reactivateError } = await admin.rpc('reactivate_company_subscription', {
    p_company_id: input.companyId,
  });
  if (reactivateError) return { ok: false, reason: 'subscription_reactivation_failed' };

  const patch = buildGaragePlanSubscriptionUpdate(plan, {
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    status: input.status,
  });

  const { data: companyStore, error: storeError } = await admin
    .from('stores')
    .select('tenant_id')
    .eq('id', input.companyId)
    .single();
  if (storeError) return { ok: false, reason: 'subscription_store_lookup_failed' };
  const tenantId = (companyStore as { tenant_id: string | null } | null)?.tenant_id ?? null;

  const { data: existing, error: existingError } = await admin
    .from('company_subscriptions')
    .select('id')
    .eq(tenantId ? 'tenant_id' : 'company_id', tenantId ?? input.companyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false, reason: 'subscription_lookup_failed' };

  if (existing?.id) {
    const { error } = await admin.from('company_subscriptions').update(patch).eq('id', existing.id);
    if (error) {
      return { ok: false, reason: error.message };
    }
  } else {
    const fallback = createDefaultFreeSubscription(input.companyId);
    const { error } = await admin.from('company_subscriptions').insert({
      ...fallback,
      ...patch,
      tenant_id: tenantId,
    });
    if (error) {
      return { ok: false, reason: error.message };
    }
  }

  return { ok: true, companyId: input.companyId, plan };
}

export async function recordStripeCheckoutCompletion(input: {
  companyId: string;
  requestedBy: string;
  planCode: string;
  stripeSessionId: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('admin_client_unavailable');
  }

  const { data: companyStore, error: storeError } = await admin
    .from('stores')
    .select('tenant_id')
    .eq('id', input.companyId)
    .single();
  if (storeError || !companyStore) throw new Error('checkout_store_lookup_failed');

  const { error: insertError } = await admin.from('plan_change_requests').upsert({
    company_id: input.companyId,
    tenant_id: (companyStore as { tenant_id: string | null } | null)?.tenant_id ?? null,
    requested_by: input.requestedBy,
    request_type: 'plan_change',
    current_plan: null,
    requested_plan: input.planCode,
    message: `Stripe Checkout 完了 (${input.stripeSessionId})`,
    stripe_session_id: input.stripeSessionId,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });
  if (insertError) throw new Error('checkout_completion_record_failed');
}
