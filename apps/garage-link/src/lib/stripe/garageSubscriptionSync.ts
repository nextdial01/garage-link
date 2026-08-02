import Stripe from 'stripe';
import {
  parseGarageGraceDays,
  type GarageStripeSubscriptionStatus,
} from '@/lib/billing/garageCommercial';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export type GarageAuthoritativeSnapshotInput = {
  event: Stripe.Event;
  subscriptionId: string;
  companyId?: string | null;
  planCode?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  deletedSnapshot?: Stripe.Subscription | null;
  paymentFailed?: boolean;
};

function periodEnd(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  return Number.isFinite(item?.current_period_end)
    ? new Date(Number(item?.current_period_end) * 1000).toISOString()
    : null;
}

function optionQuantity(subscription: Stripe.Subscription, envName: string) {
  const priceId = process.env[envName]?.trim();
  if (!priceId) return 0;
  return subscription.items.data
    .filter((item) => item.price.id === priceId)
    .reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

function isMissingStripeResource(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError
    && error.code === 'resource_missing';
}

export async function retrieveAuthoritativeSubscription(
  subscriptionId: string,
  deletedSnapshot?: Stripe.Subscription | null,
) {
  const stripe = getStripeClient();
  if (!stripe) throw new Error('billing_client_unavailable');
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (deletedSnapshot && isMissingStripeResource(error)) {
      return { ...deletedSnapshot, status: 'canceled' as const };
    }
    throw error;
  }
}

export async function applyAuthoritativeGarageSubscription(
  input: GarageAuthoritativeSnapshotInput,
) {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const leaseOwner = `snapshot:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await admin.rpc(
    'claim_garage_subscription_lease',
    {
      p_subscription_id: input.subscriptionId,
      p_lease_owner: leaseOwner,
      p_lease_seconds: 60,
    },
  );
  if (claimError) throw new Error('subscription_lease_claim_failed');
  if (!claimed) throw new Error('subscription_mutation_in_progress');

  try {
    const subscription = await retrieveAuthoritativeSubscription(
      input.subscriptionId,
      input.deletedSnapshot,
    );
    // The retrieved Subscription is authoritative. Event payload metadata is
    // only a bootstrap fallback for legacy Subscriptions that predate metadata.
    const companyId = subscription.metadata?.company_id ?? input.companyId;
    const planCode = subscription.metadata?.plan_code ?? input.planCode;
    if (!companyId || !planCode) throw new Error('subscription_metadata_missing');

    const { data: current, error: currentError } = await admin
      .from('company_subscriptions')
      .select('grace_ends_at')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    if (currentError) throw new Error('subscription_snapshot_lookup_failed');
    let graceEndsAt = (current as { grace_ends_at?: string | null } | null)?.grace_ends_at ?? null;
    if (subscription.status === 'past_due' && input.paymentFailed && !graceEndsAt) {
      const graceDays = parseGarageGraceDays(process.env.GARAGE_BILLING_GRACE_DAYS);
      graceEndsAt = graceDays > 0
        ? new Date(Date.now() + graceDays * 86400 * 1000).toISOString()
        : null;
    }
    if (subscription.status !== 'past_due') graceEndsAt = null;

    const { data, error } = await admin.rpc('apply_garage_subscription_snapshot_v3', {
      p_company_id: companyId,
      p_plan: planCode,
      p_stripe_status: subscription.status as GarageStripeSubscriptionStatus,
      p_customer_id: input.customerId
        ?? (typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id),
      p_subscription_id: subscription.id,
      p_source_event_id: input.event.id,
      p_snapshot_observed_at: new Date().toISOString(),
      p_grace_ends_at: graceEndsAt,
      p_cancel_at_period_end: subscription.cancel_at_period_end,
      p_current_period_end: periodEnd(subscription),
      p_invoice_id: input.invoiceId ?? null,
      p_extra_staff_count: optionQuantity(subscription, 'STRIPE_PRICE_EXTRA_STAFF'),
      p_extra_store_count: optionQuantity(subscription, 'STRIPE_PRICE_EXTRA_STORE'),
      p_extra_storage_gb: optionQuantity(subscription, 'STRIPE_PRICE_EXTRA_STORAGE_10GB') * 10,
      p_restoration_state: 'none',
    });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      throw new Error('subscription_snapshot_apply_failed');
    }
    return { subscription, companyId, planCode, result: data };
  } finally {
    await admin.rpc('release_garage_subscription_lease', {
      p_subscription_id: input.subscriptionId,
      p_lease_owner: leaseOwner,
    });
  }
}

export async function withGarageSubscriptionMutationLease<T>(
  subscriptionId: string,
  callback: () => Promise<T>,
) {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const leaseOwner = `mutation:${crypto.randomUUID()}`;
  const { data, error } = await admin.rpc('claim_garage_subscription_lease', {
    p_subscription_id: subscriptionId,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 60,
  });
  if (error) throw new Error('subscription_lease_claim_failed');
  if (!data) throw new Error('subscription_mutation_in_progress');
  try {
    return await callback();
  } finally {
    await admin.rpc('release_garage_subscription_lease', {
      p_subscription_id: subscriptionId,
      p_lease_owner: leaseOwner,
    });
  }
}

export function eventSubscriptionId(event: Stripe.Event) {
  const object = event.data.object as Stripe.Event.Data.Object & {
    id: string;
    subscription?: string | { id?: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } } | null;
  };
  if (event.type.startsWith('customer.subscription.')) return object.id;
  const value = object.parent?.subscription_details?.subscription ?? object.subscription;
  return typeof value === 'string' ? value : value?.id ?? null;
}
