import { NextResponse } from 'next/server';
import {
  GARAGE_PLAN_ORDER,
  getGaragePlan,
  normalizeGaragePlanCode,
  type GaragePlanCode,
} from '@/lib/billing/garagePlans';
import { buildGaragePlanSubscriptionUpdate } from '@/lib/stripe/garageBilling';
import { assertStripePriceId, getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type MemberRow = { store_id: string; role: string | null };
type StoreRow = { tenant_id: string | null };
type SubscriptionRow = {
  id: string;
  company_id: string;
  tenant_id: string;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function isUpgrade(current: GaragePlanCode, requested: GaragePlanCode) {
  return GARAGE_PLAN_ORDER.indexOf(requested) > GARAGE_PLAN_ORDER.indexOf(current);
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const admin = createAdminClient();
  if (!stripe || !admin) {
    return NextResponse.json({ ok: false, error: 'Stripeの契約変更設定が未完了です。' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  const { data: member } = await supabase
    .from<MemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();
  if (!member?.store_id || !['owner', 'admin'].includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '契約を変更する権限がありません。' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { plan?: string } | null;
  const requestedPlan = normalizeGaragePlanCode(body?.plan);
  if (requestedPlan === 'free') {
    return NextResponse.json({ ok: false, error: 'Freeプランへの変更はできません。' }, { status: 400 });
  }

  const { data: store } = await admin.from('stores').select('tenant_id').eq('id', member.store_id).single();
  const tenantId = (store as StoreRow | null)?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: '契約会社を特定できません。' }, { status: 400 });
  }

  const { data: row } = await admin
    .from('company_subscriptions')
    .select('id, company_id, tenant_id, plan, stripe_customer_id, stripe_subscription_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  const subscription = row as SubscriptionRow | null;
  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ ok: false, error: '既存の有料契約が見つかりません。' }, { status: 409 });
  }

  const currentPlan = normalizeGaragePlanCode(subscription.plan);
  if (currentPlan === requestedPlan) {
    return NextResponse.json({ ok: false, error: '現在と同じプランです。' }, { status: 400 });
  }

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    const baseItem = stripeSubscription.items.data[0];
    if (!baseItem) {
      return NextResponse.json({ ok: false, error: 'Stripeの契約明細が見つかりません。' }, { status: 409 });
    }
    const nextPriceId = assertStripePriceId(requestedPlan);
    const currentPeriodEnd = Number(
      (baseItem as typeof baseItem & { current_period_end?: number }).current_period_end ??
      (stripeSubscription as typeof stripeSubscription & { current_period_end?: number }).current_period_end,
    );
    if (!Number.isFinite(currentPeriodEnd)) {
      return NextResponse.json({ ok: false, error: '次回請求日を取得できません。' }, { status: 502 });
    }

    const upgrade = isUpgrade(currentPlan, requestedPlan);
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: [{ id: baseItem.id, price: nextPriceId }],
      proration_behavior: 'none',
      metadata: {
        ...stripeSubscription.metadata,
        company_id: subscription.company_id,
        plan_code: upgrade ? requestedPlan : currentPlan,
        pending_plan: upgrade ? '' : requestedPlan,
      },
    });

    if (upgrade) {
      const planPatch = buildGaragePlanSubscriptionUpdate(requestedPlan, {
        stripeCustomerId: subscription.stripe_customer_id,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        status: 'active',
      });
      await admin
        .from('company_subscriptions')
        .update({ ...planPatch, pending_plan: null, pending_plan_effective_at: null })
        .eq('id', subscription.id);
    } else {
      await admin
        .from('company_subscriptions')
        .update({
          pending_plan: requestedPlan,
          pending_plan_effective_at: new Date(currentPeriodEnd * 1000).toISOString(),
        })
        .eq('id', subscription.id);
    }

    await admin.from('plan_change_requests').insert({
      company_id: subscription.company_id,
      tenant_id: subscription.tenant_id,
      requested_by: userData.user.id,
      request_type: 'plan_change',
      current_plan: currentPlan,
      requested_plan: requestedPlan,
      message: upgrade
        ? '上位プランへ即時変更。次回請求から新料金（途中精算なし）。'
        : '下位プランへ次回請求日から変更（途中精算なし）。',
      status: upgrade ? 'completed' : 'approved',
      completed_at: upgrade ? new Date().toISOString() : null,
    });

    return NextResponse.json({
      ok: true,
      change: upgrade ? 'immediate_entitlement' : 'scheduled',
      plan: requestedPlan,
      effectiveAt: upgrade ? new Date().toISOString() : new Date(currentPeriodEnd * 1000).toISOString(),
      message: upgrade
        ? `${getGaragePlan(requestedPlan).name}の機能を反映しました。新料金は次回請求からです。`
        : `${getGaragePlan(requestedPlan).name}は次回請求日から反映されます。`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'プラン変更に失敗しました。' },
      { status: 502 },
    );
  }
}
