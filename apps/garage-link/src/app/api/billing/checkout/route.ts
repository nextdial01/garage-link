import { NextResponse } from 'next/server';
import type { GaragePlanCode } from '@/lib/billing/garagePlans';
import { normalizeGaragePlanCode } from '@/lib/billing/garagePlans';
import { getAppBaseUrl } from '@/lib/stripe/garageBilling';
import { applyGaragePlanFromStripe, recordStripeCheckoutCompletion } from '@/lib/stripe/applyPlan';
import { assertStripePriceId, getStripeClient, isStripeConfigured } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type CheckoutBody = {
  plan?: string;
};

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
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
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
  if (planCode === 'free') {
    return NextResponse.json({ ok: false, error: 'Free プランは Checkout 対象外です。' }, { status: 400 });
  }

  let priceId: string;
  try {
    priceId = assertStripePriceId(planCode);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Price ID が未設定です。' },
      { status: 503 },
    );
  }

  let stripeCustomerId: string | null = null;
  const admin = createAdminClient();
  if (admin) {
    const { data: subscriptionRow } = await admin
      .from('company_subscriptions')
      .select('stripe_customer_id')
      .eq('company_id', member.store_id)
      .eq('status', 'active')
      .maybeSingle();
    stripeCustomerId = (subscriptionRow as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
  }

  const customerParams = stripeCustomerId
    ? { customer: stripeCustomerId }
    : {
        customer_email: userData.user.email ?? undefined,
      };

  const baseUrl = getAppBaseUrl();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...customerParams,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings/billing?checkout=cancelled`,
      client_reference_id: member.store_id,
      metadata: {
        company_id: member.store_id,
        plan_code: planCode,
        requested_by: userData.user.id,
      },
      subscription_data: {
        metadata: {
          company_id: member.store_id,
          plan_code: planCode,
        },
      },
    });

    if (!session.url) {
      return NextResponse.json({ ok: false, error: 'Checkout URL を生成できませんでした。' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Checkout 作成に失敗しました。' },
      { status: 500 },
    );
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
      .from<StoreMemberRow>('store_members')
      .select('store_id, role')
      .eq('user_id', userData.user.id)
      .eq('store_id', companyId)
      .maybeSingle();

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json({ ok: false, error: '権限がありません。' }, { status: 403 });
    }

    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

    const result = await applyGaragePlanFromStripe({
      companyId,
      planCode,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      stripeSubscriptionId: subscriptionId,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason }, { status: 500 });
    }

    if (requestedBy) {
      await recordStripeCheckoutCompletion({
        companyId,
        requestedBy,
        planCode: result.plan,
        stripeSessionId: session.id,
      });
    }

    return NextResponse.json({ ok: true, plan: result.plan, companyId: result.companyId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'セッション確認に失敗しました。' },
      { status: 500 },
    );
  }
}
