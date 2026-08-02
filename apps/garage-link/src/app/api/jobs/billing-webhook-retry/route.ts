import { NextResponse } from 'next/server';
import {
  failStripeEvent,
  finishStripeEvent,
  processGarageStripeEvent,
} from '@/lib/stripe/garageWebhookProcessor';
import {
  executeGarageWebhookRetryBatch,
  type GarageWebhookRetryClaim,
} from '@/lib/stripe/garageWebhookRetryWorker';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

async function run(request: Request, manualRetry: string | null) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: '認可されていません。' }, { status: 401 });
  }
  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) {
    return NextResponse.json({ ok: false, error: '再処理設定が未完了です。' }, { status: 503 });
  }
  const workerId = `webhook-retry:${crypto.randomUUID()}`;
  const { data, error } = await admin.rpc('claim_garage_webhook_retry', {
    p_worker_id: workerId,
    p_lease_seconds: 60,
    p_limit: manualRetry ? 1 : 25,
    p_event_id: manualRetry,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: '再処理対象をclaimできませんでした。' }, { status: 503 });
  }

  const batch = await executeGarageWebhookRetryBatch({
    claims: (data ?? []) as GarageWebhookRetryClaim[],
    workerId,
    retrieveEvent: (eventId) => stripe.events.retrieve(eventId),
    processEvent: processGarageStripeEvent,
    finishEvent: finishStripeEvent,
    failEvent: failStripeEvent,
  });

  // IDs, payloads, customer data, e-mail and payment details are deliberately
  // absent. This object is safe for structured operational logs/artifacts.
  const diagnostic = {
    ok: batch.retryScheduled === 0,
    worker_type: 'garage_billing_webhook_retry',
    claimed: batch.claimed,
    completed: batch.completed,
    retry_scheduled: batch.retryScheduled,
    manual: Boolean(manualRetry),
  };
  console.info(JSON.stringify(diagnostic));
  return NextResponse.json(diagnostic, { status: batch.retryScheduled === 0 ? 200 : 503 });
}

export async function GET(request: Request) {
  return run(request, null);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { eventId?: string } | null;
  const manualRetry = body?.eventId?.trim() || null;
  return run(request, manualRetry);
}
