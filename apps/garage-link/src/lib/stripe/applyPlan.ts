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
}): Promise<ApplyResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, reason: 'admin_client_unavailable' };
  }

  if (input.status === 'cancelled') {
    const { error } = await admin.rpc('mark_company_subscription_cancelled', {
      p_company_id: input.companyId,
    });

    if (error) {
      return { ok: false, reason: error.message };
    }

    const plan = parseGaragePlanCodeFromStripeMetadata(input.planCode) ?? 'starter';
    return { ok: true, companyId: input.companyId, plan };
  }

  const plan = parseGaragePlanCodeFromStripeMetadata(input.planCode);

  if (!plan) {
    return { ok: false, reason: 'invalid_plan' };
  }

  await admin.rpc('reactivate_company_subscription', {
    p_company_id: input.companyId,
  });

  const patch = buildGaragePlanSubscriptionUpdate(plan, {
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    status: input.status,
  });

  const { data: existing } = await admin
    .from('company_subscriptions')
    .select('id')
    .eq('company_id', input.companyId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
    return;
  }

  await admin.from('plan_change_requests').insert({
    company_id: input.companyId,
    requested_by: input.requestedBy,
    request_type: 'plan_change',
    current_plan: null,
    requested_plan: input.planCode,
    message: `Stripe Checkout 完了 (${input.stripeSessionId})`,
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}
