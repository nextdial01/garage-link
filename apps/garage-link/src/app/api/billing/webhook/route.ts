import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  failStripeEvent,
  finishStripeEvent,
  processGarageStripeEvent,
} from '@/lib/stripe/garageWebhookProcessor';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type EventClaim = 'claimed' | 'completed' | 'in_progress';

async function claimStripeEvent(event: Stripe.Event): Promise<EventClaim> {
  const admin = createAdminClient();
  if (!admin) throw new Error('admin_client_unavailable');
  const workerId = `webhook:${crypto.randomUUID()}`;
  const leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
  const { error: insertError } = await admin.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    status: 'processing',
    error_message: null,
    stripe_created: event.created,
    object_id: typeof event.data.object === 'object' && event.data.object && 'id' in event.data.object
      ? String(event.data.object.id)
      : null,
    lease_owner: workerId,
    lease_expires_at: leaseExpiresAt,
    last_attempt_at: new Date().toISOString(),
  });
  if (!insertError) return 'claimed';
  if (insertError.code !== '23505') throw new Error('stripe_event_claim_failed');

  const { data, error } = await admin
    .from('stripe_webhook_events')
    .select('status, lease_expires_at')
    .eq('stripe_event_id', event.id)
    .single();
  if (error || !data) throw new Error('stripe_event_not_found');
  const existing = data as { status: string; lease_expires_at: string | null };
  if (existing.status === 'completed') return 'completed';
  if (existing.status === 'dead_letter') return 'in_progress';
  if (existing.lease_expires_at && Date.parse(existing.lease_expires_at) > Date.now()) {
    return 'in_progress';
  }
  const { data: claimed, error: retryError } = await admin
    .from('stripe_webhook_events')
    .update({
      status: 'processing',
      lease_owner: workerId,
      lease_expires_at: leaseExpiresAt,
      last_attempt_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('stripe_event_id', event.id)
    .lte('lease_expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (retryError) throw new Error('stripe_event_reclaim_failed');
  return claimed ? 'claimed' : 'in_progress';
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ ok: false, error: 'Stripe が未設定です。' }, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    if (!webhookSecret || !signature) {
      return NextResponse.json({ ok: false, error: 'Webhook secret が未設定です。' }, { status: 400 });
    }
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ ok: false, error: 'Webhook 署名検証に失敗しました。' }, { status: 400 });
  }

  try {
    const claim = await claimStripeEvent(event);
    if (claim === 'completed') return NextResponse.json({ ok: true, received: true, duplicate: true });
    if (claim === 'in_progress') {
      return NextResponse.json({ ok: false, error: 'Webhookを処理中です。' }, { status: 503 });
    }
    await processGarageStripeEvent(event);
    await finishStripeEvent(event.id);
    return NextResponse.json({ ok: true, received: true });
  } catch (error) {
    await failStripeEvent(event.id, error);
    return NextResponse.json({ ok: false, error: 'Webhook処理に失敗しました。' }, { status: 500 });
  }
}
