import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applyGaragePlanFromStripe, recordStripeCheckoutCompletion } from '@/lib/stripe/applyPlan';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type EventClaim = 'claimed' | 'completed' | 'in_progress';

async function claimStripeEvent(event: Stripe.Event): Promise<EventClaim> {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');

  const { error: insertError } = await admin.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    status: 'processing',
    error_message: null,
  });

  if (!insertError) return 'claimed';
  if (insertError.code !== '23505') throw new Error(insertError.message);

  const { data, error: selectError } = await admin
    .from('stripe_webhook_events')
    .select('status, updated_at')
    .eq('stripe_event_id', event.id)
    .single();
  if (selectError || !data) throw new Error(selectError?.message ?? 'stripe_event_not_found');

  const existing = data as { status: string; updated_at: string };
  if (existing.status === 'completed') return 'completed';

  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  if (existing.status === 'processing' && existing.updated_at > staleBefore) return 'in_progress';

  let retryQuery = admin
    .from('stripe_webhook_events')
    .update({ status: 'processing', error_message: null, processed_at: null })
    .eq('stripe_event_id', event.id)
    .eq('status', existing.status);
  if (existing.status === 'processing') retryQuery = retryQuery.lte('updated_at', staleBefore);

  const { data: claimed, error: retryError } = await retryQuery.select('id').maybeSingle();
  if (retryError) throw new Error(retryError.message);
  return claimed ? 'claimed' : 'in_progress';
}

async function finishStripeEvent(eventId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const { error } = await admin
    .from('stripe_webhook_events')
    .update({ status: 'completed', processed_at: new Date().toISOString(), error_message: null })
    .eq('stripe_event_id', eventId);
  if (error) throw new Error(error.message);
}

async function failStripeEvent(eventId: string, error: unknown) {
  const admin = createAdminClient();
  if (!admin) return;
  const message = error instanceof Error ? error.message : 'unknown_webhook_error';
  await admin
    .from('stripe_webhook_events')
    .update({ status: 'failed', error_message: message.slice(0, 500) })
    .eq('stripe_event_id', eventId);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const companyId = session.metadata?.company_id ?? session.client_reference_id;
  const planCode = session.metadata?.plan_code;
  const requestedBy = session.metadata?.requested_by;

  if (!companyId || !planCode) {
    throw new Error('checkout_metadata_missing');
  }

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  const result = await applyGaragePlanFromStripe({
    companyId,
    planCode,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    stripeSubscriptionId: subscriptionId,
  });

  if (!result.ok) throw new Error(result.reason);

  if (requestedBy) {
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
    throw new Error('subscription_metadata_missing');
  }

  const status =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? subscription.status
      : subscription.status === 'past_due'
        ? 'past_due'
        : subscription.status === 'canceled'
          ? 'cancelled'
          : 'suspended';

  const result = await applyGaragePlanFromStripe({
    companyId,
    planCode,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripeSubscriptionId: subscription.id,
    status,
  });
  if (!result.ok) throw new Error(result.reason);
}

async function applyScheduledPlanIfDue(subscriptionId: string) {
  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) throw new Error('billing_client_unavailable');

  const { data, error } = await admin
    .from('company_subscriptions')
    .select('id, company_id, pending_plan, pending_plan_effective_at, stripe_customer_id')
    .eq('stripe_subscription_id', subscriptionId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(error.message);
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
  if (!result.ok) throw new Error(result.reason);

  const { error: subscriptionUpdateError } = await admin
    .from('company_subscriptions')
    .update({ pending_plan: null, pending_plan_effective_at: null })
    .eq('id', row.id);
  if (subscriptionUpdateError) throw new Error(subscriptionUpdateError.message);

  const { data: store, error: storeError } = await admin
    .from('stores')
    .select('tenant_id')
    .eq('id', row.company_id)
    .single();
  if (storeError || !store?.tenant_id) throw new Error(storeError?.message ?? 'tenant_not_found');

  const { error: requestUpdateError } = await admin
    .from('plan_change_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('tenant_id', store.tenant_id)
    .eq('request_type', 'plan_change')
    .eq('requested_plan', row.pending_plan)
    .eq('status', 'approved');
  if (requestUpdateError) throw new Error(requestUpdateError.message);
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

  let claim: EventClaim;
  try {
    claim = await claimStripeEvent(event);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Webhook受付に失敗しました。' },
      { status: 500 },
    );
  }

  if (claim === 'completed') {
    return NextResponse.json({ ok: true, received: true, duplicate: true });
  }
  if (claim === 'in_progress') {
    return NextResponse.json({ ok: false, error: 'Webhookを処理中です。' }, { status: 503 });
  }

  try {
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

    await finishStripeEvent(event.id);
  } catch (error) {
    await failStripeEvent(event.id, error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Webhook処理に失敗しました。' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, received: true });
}
