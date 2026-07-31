import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { recordStripeCheckoutCompletion } from '@/lib/stripe/applyPlan';
import {
  parseGarageGraceDays,
  resolveGarageBillingState,
  type GarageStripeSubscriptionStatus,
} from '@/lib/billing/garageCommercial';
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
    stripe_created: event.created,
    object_id: typeof event.data.object === 'object' && event.data.object && 'id' in event.data.object
      ? String(event.data.object.id)
      : null,
  });

  if (!insertError) return 'claimed';
  if (insertError.code !== '23505') throw new Error(insertError.message);

  const { data, error: selectError } = await admin
    .from('stripe_webhook_events')
    .select('status, updated_at, attempt_count')
    .eq('stripe_event_id', event.id)
    .single();
  if (selectError || !data) throw new Error(selectError?.message ?? 'stripe_event_not_found');

  const existing = data as { status: string; updated_at: string; attempt_count: number };
  if (existing.status === 'completed') return 'completed';
  if (existing.status === 'dead_letter') return 'in_progress';

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
  const message = error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
    ? error.message
    : 'webhook_processing_failed';
  const { data } = await admin
    .from('stripe_webhook_events')
    .select('attempt_count')
    .eq('stripe_event_id', eventId)
    .maybeSingle();
  const attemptCount = Number((data as { attempt_count?: number } | null)?.attempt_count ?? 0) + 1;
  const deadLetter = attemptCount >= 5;
  await admin
    .from('stripe_webhook_events')
    .update({
      status: deadLetter ? 'dead_letter' : 'failed',
      attempt_count: attemptCount,
      error_message: message.slice(0, 500),
      diagnostic_code: message.slice(0, 100),
      operator_action_required: deadLetter,
      next_retry_at: deadLetter ? null : new Date(Date.now() + Math.min(60, 2 ** attemptCount) * 60_000).toISOString(),
    })
    .eq('stripe_event_id', eventId);
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const firstItem = subscription.items.data[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const value = firstItem?.current_period_end;
  return Number.isFinite(value) ? new Date(Number(value) * 1000).toISOString() : null;
}

async function applyVerifiedSubscriptionSnapshot(input: {
  subscription: Stripe.Subscription;
  event: Stripe.Event;
  companyId?: string | null;
  planCode?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  forceGraceFromFailure?: boolean;
}) {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const companyId = input.companyId ?? input.subscription.metadata?.company_id;
  const planCode = input.planCode ?? input.subscription.metadata?.plan_code;
  if (!companyId || !planCode) throw new Error('subscription_metadata_missing');

  const stripeStatus = input.subscription.status as GarageStripeSubscriptionStatus;
  let graceEndsAt: string | null = null;
  if (stripeStatus === 'past_due') {
    if (input.forceGraceFromFailure) {
      const graceDays = parseGarageGraceDays(process.env.GARAGE_BILLING_GRACE_DAYS);
      graceEndsAt = graceDays > 0
        ? new Date((input.event.created + graceDays * 86400) * 1000).toISOString()
        : null;
    } else {
      const { data } = await admin
        .from('company_subscriptions')
        .select('grace_ends_at')
        .eq('stripe_subscription_id', input.subscription.id)
        .maybeSingle();
      graceEndsAt = (data as { grace_ends_at?: string | null } | null)?.grace_ends_at ?? null;
    }
  }
  const billingState = resolveGarageBillingState({
    stripeStatus,
    cancelAtPeriodEnd: input.subscription.cancel_at_period_end,
    graceEndsAt,
  });
  const optionQuantity = (envName: string) => {
    const priceId = process.env[envName]?.trim();
    if (!priceId) return 0;
    return input.subscription.items.data
      .filter((item) => item.price.id === priceId)
      .reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  };

  const { data, error } = await admin.rpc('apply_garage_subscription_event_v2', {
    p_company_id: companyId,
    p_plan: planCode,
    p_stripe_status: stripeStatus,
    p_billing_state: billingState,
    p_customer_id: input.customerId
      ?? (typeof input.subscription.customer === 'string'
        ? input.subscription.customer
        : input.subscription.customer.id),
    p_subscription_id: input.subscription.id,
    p_event_id: input.event.id,
    p_event_created: input.event.created,
    p_grace_ends_at: graceEndsAt,
    p_cancel_at_period_end: input.subscription.cancel_at_period_end,
    p_current_period_end: subscriptionPeriodEnd(input.subscription),
    p_invoice_id: input.invoiceId ?? null,
    p_extra_staff_count: optionQuantity('STRIPE_PRICE_EXTRA_STAFF'),
    p_extra_store_count: optionQuantity('STRIPE_PRICE_EXTRA_STORE'),
    p_extra_storage_gb: optionQuantity('STRIPE_PRICE_EXTRA_STORAGE_10GB') * 10,
  });
  if (error) throw new Error(error.message);
  if (!(data as { ok?: boolean } | null)?.ok) throw new Error('subscription_snapshot_apply_failed');
  return { companyId, planCode, billingState };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const companyId = session.metadata?.company_id ?? session.client_reference_id;
  const planCode = session.metadata?.plan_code;
  const requestedBy = session.metadata?.requested_by;

  if (!companyId || !planCode) {
    throw new Error('checkout_metadata_missing');
  }

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  if (!subscriptionId) throw new Error('checkout_subscription_missing');
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const { error: operationError } = await admin
    .from('billing_sync_operations')
    .update({ stripe_subscription_id: subscriptionId, status: 'stripe_applied' })
    .eq('operation_type', 'checkout')
    .contains('requested_options', { stripe_session_id: session.id })
    .in('status', ['started', 'stripe_applied', 'reconciliation_required', 'retry_scheduled']);
  if (operationError) throw new Error('checkout_operation_subscription_link_failed');
  const stripe = getStripeClient();
  if (!stripe) throw new Error('billing_client_unavailable');
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const result = await applyVerifiedSubscriptionSnapshot({
    subscription,
    event,
    companyId,
    planCode,
    customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
  });

  if (requestedBy) {
    await recordStripeCheckoutCompletion({
      companyId,
      requestedBy,
      planCode: result.planCode,
      stripeSessionId: session.id,
    });
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, event: Stripe.Event) {
  await applyVerifiedSubscriptionSnapshot({ subscription, event });
}

async function applyScheduledPlanIfDue(subscriptionId: string) {
  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) throw new Error('billing_client_unavailable');

  const { data, error } = await admin
    .from('company_subscriptions')
    .select('id, tenant_id, company_id, pending_plan, pending_plan_effective_at, stripe_customer_id')
    .eq('stripe_subscription_id', subscriptionId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as {
    id: string;
    tenant_id: string;
    company_id: string;
    pending_plan: string | null;
    pending_plan_effective_at: string | null;
    stripe_customer_id: string | null;
  } | null;
  if (!row?.pending_plan || !row.pending_plan_effective_at) return null;
  if (Date.parse(row.pending_plan_effective_at) > Date.now() + 60_000) return null;

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  await stripe.subscriptions.update(subscriptionId, {
    metadata: {
      ...stripeSubscription.metadata,
      company_id: row.company_id,
      plan_code: row.pending_plan,
      pending_plan: '',
    },
  });
  return { ...row, planCode: row.pending_plan };
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
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Webhook 署名検証に失敗しました。' },
      { status: 400 },
    );
  }

  let claim: EventClaim;
  try {
    claim = await claimStripeEvent(event);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Webhook受付に失敗しました。' },
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
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated({
          ...(event.data.object as Stripe.Subscription),
          status: 'canceled',
        }, event);
        break;
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const scheduled = await applyScheduledPlanIfDue(subscriptionId);
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await applyVerifiedSubscriptionSnapshot({
            subscription,
            event,
            planCode: scheduled?.planCode,
            companyId: scheduled?.company_id,
            customerId: scheduled?.stripe_customer_id,
            invoiceId: invoice.id,
          });
          if (scheduled) {
            const admin = createAdminClient();
            if (!admin) throw new Error('admin_client_unavailable');
            const { error: clearError } = await admin
              .from('company_subscriptions')
              .update({ pending_plan: null, pending_plan_effective_at: null })
              .eq('id', scheduled.id);
            if (clearError) throw new Error('scheduled_plan_clear_failed');
            const { error: requestError } = await admin
              .from('plan_change_requests')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('tenant_id', scheduled.tenant_id)
              .eq('request_type', 'plan_change')
              .eq('requested_plan', scheduled.planCode)
              .eq('status', 'approved');
            if (requestError) throw new Error('scheduled_plan_request_complete_failed');
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) throw new Error('invoice_subscription_missing');
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await applyVerifiedSubscriptionSnapshot({
          subscription: { ...subscription, status: 'past_due' },
          event,
          invoiceId: invoice.id,
          forceGraceFromFailure: true,
        });
        break;
      }
      default:
        break;
    }

    await finishStripeEvent(event.id);
  } catch (error) {
    await failStripeEvent(event.id, error);
    return NextResponse.json(
      { ok: false, error: 'Webhook処理に失敗しました。' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, received: true });
}
