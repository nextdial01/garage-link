import Stripe from 'stripe';
import { garageNextRetryAt, isGarageRetryDeadLetter } from '@/lib/billing/garageLifecycle';
import { recordStripeCheckoutCompletion } from '@/lib/stripe/applyPlan';
import {
  applyAuthoritativeGarageSubscription,
  eventSubscriptionId,
  withGarageSubscriptionMutationLease,
} from '@/lib/stripe/garageSubscriptionSync';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

function safeDiagnostic(error: unknown) {
  return error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
    ? error.message.slice(0, 100)
    : 'webhook_processing_failed';
}

export async function finishStripeEvent(eventId: string, leaseOwner: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const { data, error } = await admin.from('stripe_webhook_events').update({
    status: 'completed',
    processed_at: new Date().toISOString(),
    error_message: null,
    diagnostic_code: null,
    next_retry_at: null,
    operator_action_required: false,
    lease_owner: null,
    lease_expires_at: null,
  }).eq('stripe_event_id', eventId).eq('lease_owner', leaseOwner).select('id').maybeSingle();
  if (error || !data) throw new Error('stripe_event_lease_lost');
}

export async function failStripeEvent(eventId: string, leaseOwner: string, error: unknown) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data } = await admin.from('stripe_webhook_events')
    .select('attempt_count').eq('stripe_event_id', eventId).eq('lease_owner', leaseOwner).maybeSingle();
  if (!data) return;
  const attemptCount = Number((data as { attempt_count?: number } | null)?.attempt_count ?? 0) + 1;
  const deadLetter = isGarageRetryDeadLetter(attemptCount);
  const diagnostic = safeDiagnostic(error);
  await admin.from('stripe_webhook_events').update({
    status: deadLetter ? 'dead_letter' : 'retry_scheduled',
    attempt_count: attemptCount,
    error_message: diagnostic,
    diagnostic_code: diagnostic,
    operator_action_required: deadLetter,
    next_retry_at: deadLetter ? null : garageNextRetryAt(attemptCount),
    lease_owner: null,
    lease_expires_at: null,
  }).eq('stripe_event_id', eventId).eq('lease_owner', leaseOwner);
}

async function linkCheckoutOperation(session: Stripe.Checkout.Session, subscriptionId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const { error } = await admin.from('billing_sync_operations')
    .update({ stripe_subscription_id: subscriptionId, status: 'stripe_applied' })
    .eq('operation_type', 'checkout')
    .contains('requested_options', { stripe_session_id: session.id })
    .in('status', ['started', 'stripe_applied', 'reconciliation_required', 'retry_scheduled']);
  if (error) throw new Error('checkout_operation_subscription_link_failed');
}

async function applyScheduledPlanIfDue(subscriptionId: string, asOfMs: number) {
  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) throw new Error('billing_client_unavailable');
  const { data, error } = await admin.from('company_subscriptions')
    .select('id, company_id, pending_plan, pending_plan_effective_at')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  if (error) throw new Error('scheduled_plan_lookup_failed');
  const row = data as {
    id: string;
    company_id: string;
    pending_plan: string | null;
    pending_plan_effective_at: string | null;
  } | null;
  if (!row?.pending_plan || !row.pending_plan_effective_at) return null;
  // The webhook event's own timestamp, not the server's wall-clock Date.now(): a
  // subscription advanced via a Stripe test clock fires events whose `created` reflects
  // the simulated time, which can be arbitrarily ahead of (or behind) real wall-clock
  // time. Comparing against Date.now() would never apply a due scheduled downgrade under
  // a test clock. For real, non-test-clock subscriptions the two are for all practical
  // purposes identical (webhooks deliver within seconds), so this is not a behavior
  // change for production traffic.
  if (Date.parse(row.pending_plan_effective_at) > asOfMs + 60_000) return null;
  await withGarageSubscriptionMutationLease(subscriptionId, async () => {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await stripe.subscriptions.update(subscriptionId, {
      metadata: {
        ...subscription.metadata,
        company_id: row.company_id,
        plan_code: row.pending_plan!,
        pending_plan: '',
      },
    }, { idempotencyKey: `scheduled_plan:${row.id}:${row.pending_plan_effective_at}` });
  });
  return row;
}

export async function processGarageStripeEvent(event: Stripe.Event) {
  const supported = new Set([
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
  ]);
  if (!supported.has(event.type)) return;

  const object = event.data.object;
  let subscriptionId = eventSubscriptionId(event);
  let companyId: string | null | undefined;
  let planCode: string | null | undefined;
  let customerId: string | null | undefined;
  let invoiceId: string | null | undefined;
  let deletedSnapshot: Stripe.Subscription | null = null;
  let scheduledPlan: Awaited<ReturnType<typeof applyScheduledPlanIfDue>> = null;

  if (event.type === 'checkout.session.completed') {
    const session = object as Stripe.Checkout.Session;
    subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;
    if (!subscriptionId) throw new Error('checkout_subscription_missing');
    companyId = session.metadata?.company_id ?? session.client_reference_id;
    planCode = session.metadata?.plan_code;
    customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    await linkCheckoutOperation(session, subscriptionId);
  } else if (event.type.startsWith('invoice.')) {
    const invoice = object as Stripe.Invoice;
    invoiceId = invoice.id;
    // event.created is when Stripe's webhook system generated the notification - always
    // real wall-clock time, even for a subscription driven by a test clock. A test clock's
    // "frozen_time" instead becomes the effective now() for objects created under it, so
    // the invoice's own `created` (not the event wrapper's) is what actually reflects the
    // simulated time and is comparable to pending_plan_effective_at (itself derived from
    // a test-clock-controlled current_period_end).
    if (event.type === 'invoice.paid') scheduledPlan = await applyScheduledPlanIfDue(subscriptionId!, invoice.created * 1000);
  } else if (event.type === 'customer.subscription.deleted') {
    deletedSnapshot = object as Stripe.Subscription;
  }
  if (!subscriptionId) throw new Error('stripe_subscription_id_missing');

  const applied = await applyAuthoritativeGarageSubscription({
    event,
    subscriptionId,
    planCode: scheduledPlan?.pending_plan ?? planCode,
    companyId: scheduledPlan?.company_id ?? companyId,
    customerId,
    invoiceId,
    deletedSnapshot,
    paymentFailed: event.type === 'invoice.payment_failed',
  });
  if (scheduledPlan) {
    const admin = createAdminClient();
    if (!admin) throw new Error('admin_client_unavailable');
    const { error } = await admin.from('company_subscriptions')
      .update({ pending_plan: null, pending_plan_effective_at: null })
      .eq('id', scheduledPlan.id);
    if (error) throw new Error('scheduled_plan_clear_failed');
  }

  if (event.type === 'checkout.session.completed') {
    const session = object as Stripe.Checkout.Session;
    const requestedBy = session.metadata?.requested_by;
    if (requestedBy) {
      await recordStripeCheckoutCompletion({
        companyId: applied.companyId,
        requestedBy,
        planCode: applied.planCode,
        stripeSessionId: session.id,
      });
    }
  }
}
