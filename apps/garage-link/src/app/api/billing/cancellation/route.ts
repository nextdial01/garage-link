import { NextResponse } from 'next/server';
import { withGarageSubscriptionMutationLease } from '@/lib/stripe/garageSubscriptionSync';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type MemberRow = { tenant_id: string; store_id: string; role: string | null };

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const admin = createAdminClient();
  if (!stripe || !admin) {
    return NextResponse.json({ ok: false, error: '契約管理設定が未完了です。' }, { status: 503 });
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
  const body = (await request.json().catch(() => null)) as {
    action?: 'schedule' | 'restore';
    termsAccepted?: boolean;
  } | null;
  if (!body?.action || body.termsAccepted !== true) {
    return NextResponse.json({ ok: false, error: '操作内容と利用規約への同意が必要です。' }, { status: 400 });
  }
  const { data } = await admin.from('company_subscriptions')
    .select('company_id, plan, stripe_subscription_id')
    .eq('tenant_id', member.tenant_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscription = data as {
    company_id: string;
    plan: string;
    stripe_subscription_id: string | null;
  } | null;
  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ ok: false, error: '有料契約が見つかりません。' }, { status: 409 });
  }
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || crypto.randomUUID();
  const operationType = body.action === 'schedule' ? 'cancel' : 'restoration';
  let stripeMutationCompleted = false;
  try {
    const { data: beginData, error: beginError } = await admin.rpc('begin_garage_billing_operation', {
      p_tenant_id: member.tenant_id,
      p_company_id: subscription.company_id,
      p_actor_user_id: userData.user.id,
      p_operation_type: operationType,
      p_idempotency_key: idempotencyKey,
      p_target_plan: subscription.plan,
      p_target_options: { cancel_at_period_end: body.action === 'schedule' },
      p_stripe_subscription_id: subscription.stripe_subscription_id,
    });
    if (beginError) throw new Error('billing_operation_create_failed');
    const begin = beginData as { ok?: boolean; conflict?: boolean; duplicate?: boolean; id?: string };
    if (begin.conflict) {
      return NextResponse.json({ ok: false, error: '別の契約変更を処理中です。' }, { status: 409 });
    }
    if (!begin.ok || !begin.id) throw new Error('billing_operation_create_failed');
    if (begin.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, pending: true }, { status: 202 });
    }
    await withGarageSubscriptionMutationLease(subscription.stripe_subscription_id, async () => {
      const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id!, {
        cancel_at_period_end: body.action === 'schedule',
      }, { idempotencyKey });
      await admin.from('billing_sync_operations').update({
        stripe_request_id: updated.lastResponse?.requestId ?? null,
      }).eq('id', begin.id);
    });
    stripeMutationCompleted = true;
    const { error: checkpointError } = await admin.from('billing_sync_operations').update({
      status: 'stripe_applied',
    }).eq('id', begin.id).eq('status', 'started');
    if (checkpointError) throw new Error('billing_operation_checkpoint_failed');
    return NextResponse.json({ ok: true, pending: true }, { status: 202 });
  } catch (error) {
    await admin.from('billing_sync_operations').update({
      status: stripeMutationCompleted ? 'reconciliation_required' : 'failed',
      diagnostic_code: error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
        ? error.message.slice(0, 100)
        : 'cancellation_sync_failed',
      next_retry_at: stripeMutationCompleted ? new Date(Date.now() + 60_000).toISOString() : null,
    }).eq('tenant_id', member.tenant_id).eq('idempotency_key', idempotencyKey)
      .in('status', ['started', 'stripe_applied']);
    return NextResponse.json({ ok: false, error: '契約変更を完了できませんでした。' }, { status: 503 });
  }
}
