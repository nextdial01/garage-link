import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import type Stripe from 'stripe';
import {
  classifyGarageWebhookEvent,
  hasGarageSubscriptionMetadata,
} from '../../src/lib/stripe/garageWebhookOwnership';
import { POST } from '../../src/app/api/billing/webhook/route';

function event(type: Stripe.Event.Type, object: Record<string, unknown>) {
  return {
    id: 'evt_test_garage_webhook_ownership',
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

function stripeSignature(payload: string, secret: string, timestamp: number) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

test.describe('GARAGE Stripe webhook ownership', () => {
  test('GARAGE subscription metadataだけを処理対象にする', () => {
    expect(hasGarageSubscriptionMetadata({ company_id: 'company-1', plan_code: 'standard' })).toBeTruthy();
    expect(hasGarageSubscriptionMetadata({ company_id: 'company-1' })).toBeFalsy();
    expect(hasGarageSubscriptionMetadata({ turnkey_tenant_id: 'tenant-1' })).toBeFalsy();

    expect(classifyGarageWebhookEvent(event('checkout.session.completed', {
      metadata: { company_id: 'company-1', plan_code: 'standard' },
    }))).toBe('garage');
    expect(classifyGarageWebhookEvent(event('customer.subscription.updated', {
      metadata: { turnkey_tenant_id: 'tenant-1' },
    }))).toBe('foreign');
  });

  test('Invoiceはpayload metadataがなければStripe subscriptionで確認する', () => {
    expect(classifyGarageWebhookEvent(event('invoice.paid', {
      parent: { subscription_details: { metadata: { turnkey_tenant_id: 'tenant-1' } } },
    }))).toBe('foreign');
    expect(classifyGarageWebhookEvent(event('invoice.paid', {
      parent: { subscription_details: { metadata: { company_id: 'company-1', plan_code: 'standard' } } },
    }))).toBe('garage');
    expect(classifyGarageWebhookEvent(event('invoice.paid', {}))).toBe('needs_subscription_lookup');
  });

  test('foreign eventはGARAGEのDB claimを行わず2xxで無視する', async () => {
    const secret = 'test-webhook-ownership-key';
    const payload = JSON.stringify({
      id: 'evt_test_foreign_turnkey',
      object: 'event',
      api_version: '2026-07-29.dahlia',
      created: 1_788_160_000,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_foreign_turnkey',
          object: 'subscription',
          metadata: { turnkey_tenant_id: 'tenant-test' },
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    process.env.STRIPE_SECRET_KEY = 'test-stripe-key';
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    delete process.env.GARAGE_STRIPE_TEST_MODE_REQUIRED;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await POST(new Request('https://garage-link.test/api/billing/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignature(payload, secret, timestamp),
      },
      body: payload,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, ignored: true });
  });
});
