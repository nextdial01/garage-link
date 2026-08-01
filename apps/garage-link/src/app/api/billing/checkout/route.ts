import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import type { GaragePlanCode } from '@/lib/billing/garagePlans';
import { normalizeGaragePlanCode } from '@/lib/billing/garagePlans';
import { createTermsConsentMetadata } from '@/lib/legal/termsConsent';
import { getAppBaseUrl } from '@/lib/stripe/garageBilling';
import { assertStripePriceId, getStripeClient, isStripeConfigured } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  tenant_id: string;
  store_id: string;
  role: string | null;
};

type CheckoutBody = {
  plan?: string;
  termsAccepted?: boolean;
};

type CheckoutOperation = {
  id: string;
  requested_plan: string | null;
  requested_options: { stripe_session_id?: string } | null;
  status: string;
};

function createIntegrationIdentifier() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const suffix = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `garage_link_${suffix}`;
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: 'Stripe が未設定です。' }, { status: 503 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: 'Stripe クライアントを初期化できません。' }, { status: 503 });
  }

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

  if (member.role !== 'owner' && member.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '権限がありません。' }, { status: 403 });
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const planCode = normalizeGaragePlanCode(body.plan) as GaragePlanCode;
  if (body.termsAccepted !== true) {
    return NextResponse.json(
      { ok: false, error: '決済へ進むには利用規約への同意が必要です。', code: 'terms_not_accepted' },
      { status: 400 },
    );
  }
  if (planCode === 'free') {
    return NextResponse.json({ ok: false, error: 'Free プランは Checkout 対象外です。' }, { status: 400 });
  }

  let priceId: string;
  try {
    priceId = assertStripePriceId(planCode);
  } catch {
    return NextResponse.json({ ok: false, error: '料金設定を確認できませんでした。' }, { status: 503 });
  }

  let stripeCustomerId: string | null = null;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: '契約処理の準備が完了していません。' }, { status: 503 });
  }
  {
    const { data: subscriptionRow } = await admin
      .from('company_subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, plan, billing_state')
      .eq('tenant_id', member.tenant_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const existing = subscriptionRow as {
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      plan: string;
      billing_state: string;
    } | null;
    if (
      existing?.stripe_subscription_id
      && existing.billing_state !== 'canceled'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: '既存契約の変更・支払復旧はプラン変更またはCustomer Portalから行ってください。',
          code: 'use_existing_subscription',
        },
        { status: 409 },
      );
    }
    stripeCustomerId = existing?.stripe_customer_id ?? null;
  }

  const customerParams = stripeCustomerId
    ? { customer: stripeCustomerId }
    : {
        customer_email: userData.user.email ?? undefined,
      };

  const baseUrl = getAppBaseUrl(request.url);
  const requestIdempotencyKey = request.headers.get('idempotency-key')?.trim();
  if (!requestIdempotencyKey || requestIdempotencyKey.length > 255) {
    return NextResponse.json(
      { ok: false, error: '決済再開キーがありません。画面を再読み込みしてお試しください。' },
      { status: 400 },
    );
  }

  try {
    const { data: beginResult, error: operationError } = await admin.rpc('begin_garage_billing_operation', {
      p_tenant_id: member.tenant_id,
      p_company_id: member.store_id,
      p_actor_user_id: userData.user.id,
      p_operation_type: 'checkout',
      p_idempotency_key: requestIdempotencyKey,
      p_target_plan: planCode,
      p_target_options: {},
      p_stripe_subscription_id: null,
    });
    if (operationError) throw new Error('checkout_operation_create_failed');
    const begin = beginResult as { ok?: boolean; conflict?: boolean; id?: string };
    if (begin.conflict) {
      return NextResponse.json(
        { ok: false, error: '別の契約変更または決済を処理中です。' },
        { status: 409 },
      );
    }
    if (!begin.ok || !begin.id) throw new Error('checkout_operation_create_failed');
    const { data: operationData, error: operationLookupError } = await admin
      .from('billing_sync_operations')
      .select('id, requested_plan, requested_options, status')
      .eq('id', begin.id)
      .single();
    if (operationLookupError || !operationData) throw new Error('checkout_operation_lookup_failed');
    const operation = operationData as CheckoutOperation;

    if (operation.requested_plan !== planCode) {
      return NextResponse.json(
        { ok: false, error: '別プランの決済手続きが進行中です。先にその手続きを完了してください。' },
        { status: 409 },
      );
    }

    const existingSessionId = operation.requested_options?.stripe_session_id;
    if (existingSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
      if (existingSession.status === 'open' && existingSession.url) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          url: existingSession.url,
          sessionId: existingSession.id,
        });
      }
      if (existingSession.status === 'complete') {
        return NextResponse.json(
          { ok: false, error: '決済済みです。契約への反映を確認しています。' },
          { status: 409 },
        );
      }
      await admin.from('billing_sync_operations')
        .update({ status: 'failed', diagnostic_code: 'checkout_session_expired' })
        .eq('id', operation.id);
      return NextResponse.json(
        {
          ok: false,
          code: 'checkout_session_expired',
          error: '決済ページの有効期限が切れました。もう一度お申し込みください。',
        },
        { status: 409 },
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      automatic_tax: { enabled: false },
      integration_identifier: createIntegrationIdentifier(),
      // Link was never an explicitly verified purchase path (unlike add-ons, disabled
      // for the same reason). Restricting to card avoids Stripe's Link enrollment/
      // verification flow entirely, which was observed to hang indefinitely for a
      // real submitted Checkout session (no payment_intent was ever created).
      payment_method_types: ['card'],
      ...customerParams,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings/billing?checkout=cancelled`,
      client_reference_id: member.store_id,
      metadata: {
        company_id: member.store_id,
        plan_code: planCode,
        requested_by: userData.user.id,
        ...createTermsConsentMetadata(),
      },
      subscription_data: {
        metadata: {
          company_id: member.store_id,
          plan_code: planCode,
        },
      },
    }, { idempotencyKey: operation.id });

    if (!session.url) {
      await admin.from('billing_sync_operations')
        .update({ status: 'failed', diagnostic_code: 'checkout_url_missing' })
        .eq('id', operation.id);
      return NextResponse.json({ ok: false, error: 'Checkout URL を生成できませんでした。' }, { status: 500 });
    }

    const { error: checkpointError } = await admin.from('billing_sync_operations')
      .update({
        status: 'stripe_applied',
        requested_options: { stripe_session_id: session.id },
        stripe_request_id: session.lastResponse?.requestId ?? null,
      })
      .eq('id', operation.id)
      .eq('status', 'started');
    if (checkpointError) throw new Error('checkout_operation_checkpoint_failed');

    return NextResponse.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'checkout_operation_checkpoint_failed') {
      return NextResponse.json(
        { ok: false, error: '決済ページを確認中です。同じプランでもう一度お試しください。' },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: 'Checkout 作成に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'session_id が必要です。' }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: 'Stripe が未設定です。' }, { status: 503 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: 'Stripe クライアントを初期化できません。' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    const companyId = session.metadata?.company_id ?? session.client_reference_id;
    const planCode = session.metadata?.plan_code;
    const requestedBy = session.metadata?.requested_by;

    if (!companyId || session.payment_status !== 'paid') {
      return NextResponse.json({ ok: false, error: '決済が完了していません。' }, { status: 400 });
    }

    const { data: member } = await supabase
      .from<StoreMemberRow>('current_user_active_store_membership')
      .select('tenant_id, store_id, role')
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .eq('store_id', companyId)
      .maybeSingle();

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json({ ok: false, error: '権限がありません。' }, { status: 403 });
    }

    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

    if (!subscriptionId || !planCode || !requestedBy) {
      return NextResponse.json({ ok: false, error: '決済情報が不足しています。' }, { status: 400 });
    }

    // Browser confirmation is read-only. Entitlements are written only by a
    // verified webhook or the explicit reconciliation job.
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ ok: false, error: '契約反映を確認できませんでした。' }, { status: 503 });
    }
    const { data: applied, error: appliedError } = await admin
      .from('company_subscriptions')
      .select('plan, billing_state, stripe_subscription_id')
      .eq('tenant_id', member.tenant_id)
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    if (appliedError) {
      return NextResponse.json({ ok: false, error: '契約反映を確認できませんでした。' }, { status: 503 });
    }
    if (!applied) {
      return NextResponse.json(
        { ok: true, pending: true, plan: planCode, companyId, message: '決済済みです。契約反映を確認中です。' },
        { status: 202 },
      );
    }
    return NextResponse.json({
      ok: true,
      pending: false,
      plan: (applied as { plan: string }).plan,
      billingState: (applied as { billing_state: string }).billing_state,
      companyId,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'セッション確認に失敗しました。' }, { status: 500 });
  }
}
