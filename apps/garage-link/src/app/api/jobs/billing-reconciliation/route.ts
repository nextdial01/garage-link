import { NextResponse } from 'next/server';
import { garageNextRetryAt, isGarageRetryDeadLetter } from '@/lib/billing/garageLifecycle';
import { normalizeGaragePlanCode } from '@/lib/billing/garagePlans';
import { applyAuthoritativeGarageSubscription } from '@/lib/stripe/garageSubscriptionSync';
import { assertStripePriceId, getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ReconciliationOperation = {
  id: string;
  stripe_subscription_id: string | null;
  attempt_count: number;
  operation_type: string;
  target_plan: string | null;
  target_options: {
    price_id?: string;
    expected_quantity?: number;
  } | null;
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
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
  const workerId = `reconciliation:${crypto.randomUUID()}`;
  const { data, error } = await admin.rpc('claim_garage_billing_operations', {
    p_worker_id: workerId,
    p_lease_seconds: 60,
    p_limit: 25,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: '再照合対象をclaimできませんでした。' }, { status: 503 });
  }

  let completed = 0;
  let retryScheduled = 0;
  let deadLetter = 0;
  for (const operation of (data ?? []) as ReconciliationOperation[]) {
    try {
      if (!operation.stripe_subscription_id) throw new Error('stripe_subscription_id_missing');
      const current = await stripe.subscriptions.retrieve(operation.stripe_subscription_id);
      if (operation.operation_type === 'change_plan') {
        const expectedPrice = assertStripePriceId(normalizeGaragePlanCode(operation.target_plan));
        if (!current.items.data.some((item) => item.price.id === expectedPrice)) {
          await admin.from('billing_sync_operations').update({
            status: 'failed',
            diagnostic_code: 'stripe_mutation_not_observed',
            lease_owner: null,
            lease_expires_at: null,
          }).eq('id', operation.id).eq('lease_owner', workerId);
          continue;
        }
      }
      if (operation.operation_type === 'change_option') {
        const priceId = operation.target_options?.price_id;
        const expectedQuantity = operation.target_options?.expected_quantity;
        const actualQuantity = current.items.data
          .filter((item) => item.price.id === priceId)
          .reduce((sum, item) => sum + (item.quantity ?? 0), 0);
        if (!priceId || !Number.isInteger(expectedQuantity) || actualQuantity !== expectedQuantity) {
          await admin.from('billing_sync_operations').update({
            status: 'failed',
            diagnostic_code: 'stripe_mutation_not_observed',
            lease_owner: null,
            lease_expires_at: null,
          }).eq('id', operation.id).eq('lease_owner', workerId);
          continue;
        }
      }
      await applyAuthoritativeGarageSubscription({
        subscriptionId: operation.stripe_subscription_id,
        event: {
          id: `reconcile_${operation.id}`,
          created: Math.floor(Date.now() / 1000),
          type: 'customer.subscription.updated',
          data: { object: { id: operation.stripe_subscription_id } },
        } as never,
      });
      await admin.from('billing_sync_operations').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        diagnostic_code: null,
        error_code: null,
        operator_action_required: false,
        next_retry_at: null,
        lease_owner: null,
        lease_expires_at: null,
      }).eq('id', operation.id).eq('lease_owner', workerId);
      completed += 1;
    } catch (caught) {
      const attempts = operation.attempt_count + 1;
      const isDeadLetter = isGarageRetryDeadLetter(attempts);
      const diagnostic = caught instanceof Error && /^[a-z0-9_]+$/i.test(caught.message)
        ? caught.message.slice(0, 100)
        : 'reconciliation_failed';
      await admin.from('billing_sync_operations').update({
        status: isDeadLetter ? 'dead_letter' : 'retry_scheduled',
        attempt_count: attempts,
        diagnostic_code: diagnostic,
        operator_action_required: isDeadLetter,
        next_retry_at: isDeadLetter ? null : garageNextRetryAt(attempts),
        lease_owner: null,
        lease_expires_at: null,
      }).eq('id', operation.id).eq('lease_owner', workerId);
      if (isDeadLetter) deadLetter += 1;
      else retryScheduled += 1;
    }
  }

  const diagnostic = {
    ok: deadLetter === 0 && retryScheduled === 0,
    worker_type: 'garage_billing_reconciliation',
    claimed: (data ?? []).length,
    completed,
    retry_scheduled: retryScheduled,
    dead_letter: deadLetter,
  };
  console.info(JSON.stringify(diagnostic));
  return NextResponse.json(diagnostic, { status: diagnostic.ok ? 200 : 503 });
}

export async function GET(request: Request) {
  return reconcile(request);
}

export async function POST(request: Request) {
  return reconcile(request);
}
