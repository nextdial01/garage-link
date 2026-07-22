import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applyGaragePlanFromStripe, recordStripeCheckoutCompletion } from '@/lib/stripe/applyPlan';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const companyId = session.metadata?.company_id ?? session.client_reference_id;
  const planCode = session.metadata?.plan_code;
  const requestedBy = session.metadata?.requested_by;

  if (!companyId || !planCode) {
    return;
  }

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  const result = await applyGaragePlanFromStripe({
    companyId,
    planCode,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    stripeSubscriptionId: subscriptionId,
  });

  if (result.ok && requestedBy) {
    await recordStripeCheckoutCompletion({
      companyId,
      requestedBy,
      planCode: result.plan,
      stripeSessionId: session.id,
    });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const companyId = subscription.metadata?.company_id;
  const planCode = subscription.metadata?.plan_code;

  if (!companyId || !planCode) {
    return;
  }

  const status =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? subscription.status
      : subscription.status === 'past_due'
        ? 'past_due'
        : subscription.status === 'canceled'
          ? 'cancelled'
          : 'suspended';

  await applyGaragePlanFromStripe({
    companyId,
    planCode,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripeSubscriptionId: subscription.id,
    status,
  });
}

async function applyScheduledPlanIfDue(subscriptionId: string) {
  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) return;

  const { data } = await admin
    .from('company_subscriptions')
    .select('id, company_id, pending_plan, pending_plan_effective_at, stripe_customer_id')
    .eq('stripe_subscription_id', subscriptionId)
    .eq('status', 'active')
    .maybeSingle();
  const row = data as {
    id: string;
    company_id: string;
    pending_plan: string | null;
    pending_plan_effective_at: string | null;
    stripe_customer_id: string | null;
  } | null;
  if (!row?.pending_plan || !row.pending_plan_effective_at) return;
  if (Date.parse(row.pending_plan_effective_at) > Date.now() + 60_000) return;

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      ...stripeSubscription.metadata,
      company_id: row.company_id,
      plan_code: row.pending_plan,
      pending_plan: '',
    },
  });
  const result = await applyGaragePlanFromStripe({
    companyId: row.company_id,
    planCode: row.pending_plan,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: subscriptionId,
    status: 'active',
  });
  if (result.ok) {
    await admin
      .from('company_subscriptions')
      .update({ pending_plan: null, pending_plan_effective_at: null })
      .eq('id', row.id);
    await admin
      .from('plan_change_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('tenant_id', (await admin.from('stores').select('tenant_id').eq('id', row.company_id).single()).data?.tenant_id)
      .eq('request_type', 'plan_change')
      .eq('requested_plan', row.pending_plan)
      .eq('status', 'approved');
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const invoiceRecord = invoice as unknown as {
    subscription?: string | { id?: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } } | null;
  };
  const value = invoiceRecord.parent?.subscription_details?.subscription ?? invoiceRecord.subscription;
  return typeof value === 'string' ? value : value?.id ?? null;
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: 'Stripe が未設定です。' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const payload = await request.text();

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } else if (process.env.NODE_ENV === 'development') {
      event = JSON.parse(payload) as Stripe.Event;
    } else {
      return NextResponse.json({ ok: false, error: 'Webhook secret が未設定です。' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Webhook 署名検証に失敗しました。' },
      { status: 400 },
    );
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionUpdated({
        ...(event.data.object as Stripe.Subscription),
        status: 'canceled',
      });
      break;
    case 'invoice.paid': {
      const subscriptionId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (subscriptionId) await applyScheduledPlanIfDue(subscriptionId);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ ok: true, received: true });
}
