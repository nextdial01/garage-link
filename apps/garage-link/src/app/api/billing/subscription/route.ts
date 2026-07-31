import { NextResponse } from 'next/server';
import { createDefaultFreeSubscription } from '@/lib/billing/garageSubscription';
import {
  resolveGarageBillingState,
  type GarageStripeSubscriptionStatus,
} from '@/lib/billing/garageCommercial';
import { translateDbError } from '@/lib/errors/translate-db-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  tenant_id: string;
  store_id: string;
  role: string | null;
};

const subscriptionColumns =
  'id, company_id, tenant_id, plan, status, billing_state, stripe_status, grace_ends_at, cancel_at_period_end, current_period_end, restoration_state, included_staff_count, extra_staff_count, included_store_count, extra_store_count, storage_limit_mb, extra_storage_gb, current_inventory_limit, l_link_integration_enabled, started_at, updated_at, stripe_customer_id, stripe_subscription_id, pending_plan, pending_plan_effective_at, cancelled_at, data_delete_scheduled_at, data_deleted_at';

function withEffectiveBillingState<T extends Record<string, unknown>>(subscription: T) {
  const stripeStatus = subscription.stripe_status;
  if (typeof stripeStatus !== 'string') return subscription;
  return {
    ...subscription,
    billing_state: resolveGarageBillingState({
      stripeStatus: stripeStatus as GarageStripeSubscriptionStatus,
      graceEndsAt: typeof subscription.grace_ends_at === 'string' ? subscription.grace_ends_at : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      currentPeriodEnd: typeof subscription.current_period_end === 'string' ? subscription.current_period_end : null,
      canceledAt: typeof subscription.cancelled_at === 'string' ? subscription.cancelled_at : null,
      restorationState: subscription.restoration_state === 'pending'
        ? 'pending'
        : subscription.restoration_state === 'restored'
          ? 'restored'
          : subscription.restoration_state === 'failed'
            ? 'failed'
            : 'none',
    }),
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('current_user_active_store_membership')
    .select('tenant_id, store_id, role')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .single();

  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗が見つかりません。' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: true, subscription: createDefaultFreeSubscription(member.store_id), source: 'fallback' },
      { status: 200 },
    );
  }

  const tenantId = member.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: '契約会社を特定できません。' }, { status: 500 });
  }

  const { data: existing, error: readError } = await admin
    .from('company_subscriptions')
    .select(subscriptionColumns)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: translateDbError(readError.message) }, { status: 500 });
  }

  if (existing) {
    const effective = withEffectiveBillingState(existing as Record<string, unknown>);
    return NextResponse.json({
      ok: true,
      subscription: effective,
      source: (effective as { billing_state?: string }).billing_state === 'canceled'
        ? 'cancelled_retention'
        : 'database',
    });
  }

  const fallback = createDefaultFreeSubscription(member.store_id);
  const { data: inserted, error: insertError } = await admin
    .from('company_subscriptions')
    .insert({
      company_id: fallback.company_id,
      tenant_id: tenantId,
      plan: fallback.plan,
      status: fallback.status,
      included_staff_count: fallback.included_staff_count,
      extra_staff_count: fallback.extra_staff_count,
      included_store_count: fallback.included_store_count,
      extra_store_count: fallback.extra_store_count,
      storage_limit_mb: fallback.storage_limit_mb,
      extra_storage_gb: fallback.extra_storage_gb,
      current_inventory_limit: fallback.current_inventory_limit,
      l_link_integration_enabled: fallback.l_link_integration_enabled,
    })
    .select(subscriptionColumns)
    .single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: translateDbError(insertError.message) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subscription: inserted, source: 'created' });
}
