import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import {
  resolveGarageBillingState,
  type GarageStripeSubscriptionStatus,
} from '@/lib/billing/garageCommercial';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ReconciliationOperation = {
  id: string;
  company_id: string;
  requested_plan: string | null;
  stripe_subscription_id: string | null;
  attempt_count: number;
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

function periodEnd(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0] as (typeof subscription.items.data[number] & { current_period_end?: number }) | undefined;
  return Number.isFinite(item?.current_period_end)
    ? new Date(Number(item?.current_period_end) * 1000).toISOString()
    : null;
}

async function reconcile(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: '認可されていません。' }, { status: 401 });
  }
  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) {
    return NextResponse.json({ ok: false, error: '再照合設定が未完了です。' }, { status: 503 });
  }

  const { data, error } = await admin
    .from('billing_sync_operations')
    .select('id, company_id, requested_plan, stripe_subscription_id, attempt_count')
    .in('status', ['stripe_applied', 'reconciliation_required', 'retry_scheduled'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(25);
  if (error) {
    return NextResponse.json({ ok: false, error: '再照合対象を取得できませんでした。' }, { status: 503 });
  }

  let completed = 0;
  let retryScheduled = 0;
  let deadLetter = 0;

  for (const operation of (data ?? []) as ReconciliationOperation[]) {
    try {
      if (!operation.stripe_subscription_id) throw new Error('stripe_subscription_id_missing');
      const subscription = await stripe.subscriptions.retrieve(operation.stripe_subscription_id);
      const plan = subscription.metadata?.plan_code ?? operation.requested_plan;
      const companyId = subscription.metadata?.company_id ?? operation.company_id;
      if (!plan || !companyId) throw new Error('subscription_metadata_missing');

      const { data: current } = await admin
        .from('company_subscriptions')
        .select('grace_ends_at')
        .eq('stripe_subscription_id', subscription.id)
        .maybeSingle();
      const graceEndsAt = (current as { grace_ends_at?: string | null } | null)?.grace_ends_at ?? null;
      const stripeStatus = subscription.status as GarageStripeSubscriptionStatus;
      const billingState = resolveGarageBillingState({
        stripeStatus,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        graceEndsAt,
      });
      const optionQuantity = (envName: string) => {
        const priceId = process.env[envName]?.trim();
        if (!priceId) return 0;
        return subscription.items.data
          .filter((item) => item.price.id === priceId)
          .reduce((sum, item) => sum + (item.quantity ?? 0), 0);
      };
      const eventCreated = Math.floor(Date.now() / 1000);
      const { data: applied, error: applyError } = await admin.rpc('apply_garage_subscription_event_v2', {
        p_company_id: companyId,
        p_plan: plan,
        p_stripe_status: stripeStatus,
        p_billing_state: billingState,
        p_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
        p_subscription_id: subscription.id,
        p_event_id: `reconcile_${operation.id}_${eventCreated}`,
        p_event_created: eventCreated,
        p_grace_ends_at: graceEndsAt,
        p_cancel_at_period_end: subscription.cancel_at_period_end,
        p_current_period_end: periodEnd(subscription),
        p_invoice_id: null,
        p_extra_staff_count: optionQuantity('STRIPE_PRICE_EXTRA_STAFF'),
        p_extra_store_count: optionQuantity('STRIPE_PRICE_EXTRA_STORE'),
        p_extra_storage_gb: optionQuantity('STRIPE_PRICE_EXTRA_STORAGE_10GB') * 10,
      });
      if (applyError || !(applied as { ok?: boolean } | null)?.ok) {
        throw new Error('reconciliation_apply_failed');
      }
      await admin.from('billing_sync_operations').update({
        status: 'completed',
        diagnostic_code: null,
        error_code: null,
        operator_action_required: false,
        next_retry_at: null,
      }).eq('id', operation.id);
      completed += 1;
    } catch (caught) {
      const attempts = operation.attempt_count + 1;
      const isDeadLetter = attempts >= 5;
      await admin.from('billing_sync_operations').update({
        status: isDeadLetter ? 'dead_letter' : 'retry_scheduled',
        attempt_count: attempts,
        diagnostic_code: caught instanceof Error && /^[a-z0-9_]+$/i.test(caught.message)
          ? caught.message.slice(0, 100)
          : 'reconciliation_failed',
        operator_action_required: isDeadLetter,
        next_retry_at: isDeadLetter
          ? null
          : new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString(),
      }).eq('id', operation.id);
      if (isDeadLetter) deadLetter += 1;
      else retryScheduled += 1;
    }
  }

  return NextResponse.json({
    ok: deadLetter === 0,
    examined: (data ?? []).length,
    completed,
    retry_scheduled: retryScheduled,
    dead_letter: deadLetter,
  }, { status: deadLetter === 0 ? 200 : 503 });
}

export async function GET(request: Request) {
  return reconcile(request);
}

export async function POST(request: Request) {
  return reconcile(request);
}
