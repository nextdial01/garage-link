import { NextResponse } from 'next/server';
import {
  GARAGE_PLAN_ORDER,
  getGaragePlan,
  normalizeGaragePlanCode,
  type GaragePlanCode,
} from '@/lib/billing/garagePlans';
import { buildGaragePlanSubscriptionUpdate } from '@/lib/stripe/garageBilling';
import { createTermsConsentMetadata } from '@/lib/legal/termsConsent';
import { assertStripePriceId, getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type MemberRow = { tenant_id: string; store_id: string; role: string | null };
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
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || crypto.randomUUID();
  let stripeMutationCompleted = false;
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
    .from<MemberRow>('current_user_active_store_membership')
    .select('tenant_id, store_id, role')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .single();
  if (!member?.store_id || !['owner', 'admin'].includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '契約を変更する権限がありません。' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { plan?: string; termsAccepted?: boolean } | null;
  if (body?.termsAccepted !== true) {
    return NextResponse.json({ ok: false, error: '契約変更には利用規約への同意が必要です。', code: 'terms_not_accepted' }, { status: 400 });
  }
  const requestedPlan = normalizeGaragePlanCode(body?.plan);
  if (requestedPlan === 'free') {
    return NextResponse.json({ ok: false, error: 'Freeプランへの変更はできません。' }, { status: 400 });
  }

  const tenantId = member.tenant_id;
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
    const { data: existingOperation, error: existingOperationError } = await admin
      .from('billing_sync_operations')
      .select('id, status, requested_plan')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingOperationError) throw new Error('billing_operation_lookup_failed');
    if (existingOperation) {
      if (existingOperation.requested_plan !== requestedPlan) {
        return NextResponse.json({ ok: false, error: '同じ操作IDに異なる内容が指定されました。' }, { status: 409 });
      }
      if (existingOperation.status === 'completed') {
        return NextResponse.json({ ok: true, duplicate: true, plan: requestedPlan });
      }
      if (existingOperation.status === 'reconciliation_required') {
        return NextResponse.json({ ok: false, error: '契約状態の再照合が必要です。' }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: '契約変更を処理中です。' }, { status: 409 });
    }

    const { data: operation, error: operationError } = await admin.from('billing_sync_operations').insert({
      tenant_id: tenantId,
      company_id: subscription.company_id,
      actor_user_id: userData.user.id,
      operation_type: 'change_plan',
      idempotency_key: idempotencyKey,
      requested_plan: requestedPlan,
      status: 'started',
    }).select('id').single();
    if (operationError?.code === '23505') {
      return NextResponse.json({ ok: false, error: '契約変更を処理中です。' }, { status: 409 });
    }
    if (operationError || !operation) throw new Error('billing_operation_create_failed');

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    const baseItem = stripeSubscription.items.data[0];
    if (!baseItem) {
      throw new Error('stripe_subscription_item_missing');
    }
    const nextPriceId = assertStripePriceId(requestedPlan);
    const currentPeriodEnd = Number(
      (baseItem as typeof baseItem & { current_period_end?: number }).current_period_end ??
      (stripeSubscription as typeof stripeSubscription & { current_period_end?: number }).current_period_end,
    );
    if (!Number.isFinite(currentPeriodEnd)) {
      throw new Error('stripe_billing_period_missing');
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
        ...createTermsConsentMetadata(),
      },
    }, { idempotencyKey });
    stripeMutationCompleted = true;

    const { error: stripeAppliedError } = await admin.from('billing_sync_operations')
      .update({ status: 'stripe_applied' }).eq('id', operation.id);
    if (stripeAppliedError) throw new Error('billing_operation_checkpoint_failed');

    if (upgrade) {
      const planPatch = buildGaragePlanSubscriptionUpdate(requestedPlan, {
        stripeCustomerId: subscription.stripe_customer_id,
        stripeSubscriptionId: subscription.stripe_subscription_id,
        status: 'active',
      });
      const { error: subscriptionUpdateError } = await admin
        .from('company_subscriptions')
        .update({ ...planPatch, pending_plan: null, pending_plan_effective_at: null })
        .eq('id', subscription.id);
      if (subscriptionUpdateError) throw new Error('subscription_update_failed');
    } else {
      const { error: subscriptionUpdateError } = await admin
        .from('company_subscriptions')
        .update({
          pending_plan: requestedPlan,
          pending_plan_effective_at: new Date(currentPeriodEnd * 1000).toISOString(),
        })
        .eq('id', subscription.id);
      if (subscriptionUpdateError) throw new Error('subscription_schedule_failed');
    }

    const { error: requestInsertError } = await admin.from('plan_change_requests').insert({
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
    if (requestInsertError) throw new Error('plan_change_request_insert_failed');

    const { error: operationCompleteError } = await admin.from('billing_sync_operations')
      .update({ status: 'completed', error_code: null }).eq('id', operation.id);
    if (operationCompleteError) throw new Error('billing_operation_complete_failed');

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
    if (tenantId) {
      await admin.from('billing_sync_operations').update({
        status: stripeMutationCompleted ? 'reconciliation_required' : 'failed',
        error_code: error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
          ? error.message.slice(0, 100)
          : 'billing_sync_failed',
      }).eq('tenant_id', tenantId).eq('idempotency_key', idempotencyKey).in('status', ['stripe_applied', 'started']);
    }
    return NextResponse.json(
      { ok: false, error: '契約変更を完了できませんでした。再照合後に再実行してください。' },
      { status: 503 },
    );
  }
}
