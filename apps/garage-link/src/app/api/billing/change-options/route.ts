import { NextResponse } from 'next/server';
import { canAddStaff, canAddStorage, canAddStore } from '@/lib/billing/garagePlans';
import { getStripeClient } from '@/lib/stripe/client';
import { withGarageSubscriptionMutationLease } from '@/lib/stripe/garageSubscriptionSync';
import { createTermsConsentMetadata } from '@/lib/legal/termsConsent';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type OptionType = 'add_staff' | 'add_store' | 'add_storage';
type MemberRow = { tenant_id: string; store_id: string; role: string | null };
type SubscriptionRow = {
  id: string;
  company_id: string;
  tenant_id: string;
  plan: string;
  stripe_subscription_id: string | null;
  extra_staff_count: number;
  extra_store_count: number;
  extra_storage_gb: number;
};

const optionPriceEnv: Record<OptionType, string> = {
  add_staff: 'STRIPE_PRICE_EXTRA_STAFF',
  add_store: 'STRIPE_PRICE_EXTRA_STORE',
  add_storage: 'STRIPE_PRICE_EXTRA_STORAGE_10GB',
};

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || crypto.randomUUID();
  let stripeMutationCompleted = false;
  const stripe = getStripeClient();
  const admin = createAdminClient();
  if (!stripe || !admin) {
    return NextResponse.json({ ok: false, error: '追加オプションの決済設定が未完了です。' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  const { data: member } = await supabase.from<MemberRow>('current_user_active_store_membership').select('tenant_id, store_id, role').eq('user_id', userData.user.id).eq('status', 'active').single();
  if (!member?.store_id || !['owner', 'admin'].includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '契約を変更する権限がありません。' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    type?: OptionType;
    action?: 'add' | 'remove';
    amount?: number;
    termsAccepted?: boolean;
  } | null;
  if (body?.termsAccepted !== true) {
    return NextResponse.json({ ok: false, error: '契約変更には利用規約への同意が必要です。', code: 'terms_not_accepted' }, { status: 400 });
  }
  const type = body?.type;
  const action = body?.action ?? 'add';
  const amount = Number(body?.amount);
  if (!type || !Object.hasOwn(optionPriceEnv, type) || !['add', 'remove'].includes(action) || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: '追加内容が不正です。' }, { status: 400 });
  }
  if (type === 'add_storage' && amount % 10 !== 0) {
    return NextResponse.json({ ok: false, error: 'ストレージは10GB単位で追加してください。' }, { status: 400 });
  }

  const tenantId = member.tenant_id;
  if (!tenantId) return NextResponse.json({ ok: false, error: '契約会社を特定できません。' }, { status: 400 });
  const { data } = await admin
    .from('company_subscriptions')
    .select('id, company_id, tenant_id, plan, stripe_subscription_id, extra_staff_count, extra_store_count, extra_storage_gb')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  const subscription = data as SubscriptionRow | null;
  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ ok: false, error: '有料契約が見つかりません。' }, { status: 409 });
  }
  if (
    (type === 'add_staff' && !canAddStaff(subscription.plan)) ||
    (type === 'add_store' && !canAddStore(subscription.plan)) ||
    (type === 'add_storage' && !canAddStorage(subscription.plan))
  ) {
    return NextResponse.json({ ok: false, error: '現在のプランではこのオプションを追加できません。' }, { status: 400 });
  }

  const priceId = process.env[optionPriceEnv[type]]?.trim();
  if (!priceId) {
    return NextResponse.json({ ok: false, error: '追加オプションのStripe Price IDが未設定です。' }, { status: 503 });
  }

  try {
    const requestedOptions = { type, action, amount };
    const { data: existingOperation, error: lookupError } = await admin
      .from('billing_sync_operations')
      .select('status, requested_options')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (lookupError) throw new Error('billing_operation_lookup_failed');
    if (existingOperation) {
      if (JSON.stringify(existingOperation.requested_options) !== JSON.stringify(requestedOptions)) {
        return NextResponse.json({ ok: false, error: '同じ操作IDに異なる内容が指定されました。' }, { status: 409 });
      }
      if (existingOperation.status === 'completed') {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      return NextResponse.json({ ok: false, error: 'オプション変更を処理中です。' }, { status: 409 });
    }
    const { data: beginResult, error: operationError } = await admin.rpc('begin_garage_billing_operation', {
      p_tenant_id: tenantId,
      p_company_id: subscription.company_id,
      p_actor_user_id: userData.user.id,
      p_operation_type: 'change_option',
      p_idempotency_key: idempotencyKey,
      p_target_plan: subscription.plan,
      p_target_options: requestedOptions,
      p_stripe_subscription_id: subscription.stripe_subscription_id,
    });
    if (operationError) throw new Error('billing_operation_create_failed');
    const begin = beginResult as { ok?: boolean; conflict?: boolean; id?: string };
    if (begin.conflict) {
      return NextResponse.json({ ok: false, error: '別の契約変更を処理中です。' }, { status: 409 });
    }
    if (!begin.ok || !begin.id) throw new Error('billing_operation_create_failed');
    const operation = { id: begin.id };

    const currentQuantity = type === 'add_staff'
      ? subscription.extra_staff_count
      : type === 'add_store'
        ? subscription.extra_store_count
        : subscription.extra_storage_gb / 10;
    const addQuantity = type === 'add_storage' ? amount / 10 : amount;
    const delta = action === 'remove' ? -addQuantity : addQuantity;
    const nextQuantity = currentQuantity + delta;
    if (nextQuantity < 0) {
      await admin.from('billing_sync_operations').update({ status: 'failed', diagnostic_code: 'option_quantity_below_zero' }).eq('id', operation.id);
      return NextResponse.json({ ok: false, error: '現在の追加数を超えて削除できません。' }, { status: 400 });
    }
    await withGarageSubscriptionMutationLease(subscription.stripe_subscription_id, async () => {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id!);
      const existingItem = stripeSubscription.items.data.find((item) => item.price.id === priceId);
      if (!existingItem && action === 'remove') throw new Error('option_item_missing');
      const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id!, {
        items: existingItem
          ? nextQuantity === 0
            ? [{ id: existingItem.id, deleted: true }]
            : [{ id: existingItem.id, quantity: nextQuantity }]
          : [{ price: priceId, quantity: nextQuantity }],
        proration_behavior: 'none',
        metadata: {
          ...stripeSubscription.metadata,
          ...createTermsConsentMetadata(),
        },
      }, { idempotencyKey });
      await admin.from('billing_sync_operations').update({
        stripe_request_id: updated.lastResponse?.requestId ?? null,
      }).eq('id', operation.id);
    });
    stripeMutationCompleted = true;
    const { error: checkpointError } = await admin
      .from('billing_sync_operations')
      .update({ status: 'stripe_applied' })
      .eq('id', operation.id);
    if (checkpointError) throw new Error('billing_operation_checkpoint_failed');
    const { error: requestInsertError } = await admin.from('plan_change_requests').insert({
      company_id: subscription.company_id,
      tenant_id: subscription.tenant_id,
      requested_by: userData.user.id,
      request_type: type,
      current_plan: subscription.plan,
      requested_extra_staff_count: type === 'add_staff' ? amount : 0,
      requested_extra_store_count: type === 'add_store' ? amount : 0,
      requested_extra_storage_gb: type === 'add_storage' ? amount : 0,
      message: `オプション${action === 'add' ? '追加' : '削除'}を受付。検証済みWebhook反映後に有効（途中精算なし）。`,
      status: 'approved',
      completed_at: null,
    });
    if (requestInsertError) throw new Error('option_change_request_insert_failed');
    const { data: operationAfterRequest } = await admin
      .from('billing_sync_operations')
      .select('status')
      .eq('id', operation.id)
      .single();
    if (operationAfterRequest?.status === 'completed') {
      await admin.from('plan_change_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('request_type', type)
        .eq('status', 'approved');
    }
    return NextResponse.json(
      { ok: true, pending: true, quantity: nextQuantity, message: '変更を受け付けました。契約反映を確認中です。' },
      { status: 202 },
    );
  } catch (error) {
    await admin.from('billing_sync_operations').update({
      status: stripeMutationCompleted ? 'reconciliation_required' : 'failed',
      diagnostic_code: error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
        ? error.message.slice(0, 100)
        : 'option_sync_failed',
      operator_action_required: false,
      next_retry_at: stripeMutationCompleted ? new Date(Date.now() + 60_000).toISOString() : null,
    }).eq('tenant_id', tenantId).eq('idempotency_key', idempotencyKey).in('status', ['started', 'stripe_applied']);
    return NextResponse.json({ ok: false, error: '追加オプションの反映に失敗しました。再照合します。' }, { status: 503 });
  }
}
