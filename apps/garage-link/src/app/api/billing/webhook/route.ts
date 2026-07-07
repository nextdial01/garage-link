import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applyGaragePlanFromStripe, recordStripeCheckoutCompletion } from '@/lib/stripe/applyPlan';
import { getStripeClient } from '@/lib/stripe/client';

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
    default:
      break;
  }

  return NextResponse.json({ ok: true, received: true });
}
