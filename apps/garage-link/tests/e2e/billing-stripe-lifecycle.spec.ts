import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { login } from './helpers';

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

test.describe.serial('GARAGE LINK Stripe test lifecycle 18', () => {
  test('all commercial lifecycle gates use Stripe test', async ({ page, request }) => {
    const secret = required('STRIPE_SECRET_KEY');
    if (!secret.startsWith('sk_test_')) throw new Error('Stripe Live is denied');
    if (required('E2E_MARKER') !== 'garage-link-commercial-disposable') {
      throw new Error('Disposable marker mismatch');
    }
    const baseUrl = required('PLAYWRIGHT_BASE_URL');
    const stripe = new Stripe(secret, { apiVersion: '2026-07-29.dahlia' });
    const admin = createClient(
      required('E2E_TEST_SUPABASE_URL'),
      required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const marker = `garage-link-commercial-e2e:${required('EXPECTED_RELEASE_SHA')}`;
    let customerId: string | null = null;
    let subscriptionId: string | null = null;
    let clockId: string | null = null;

    const readDbSubscription = async () => admin.from('company_subscriptions')
      .select('plan,billing_state,stripe_status,grace_ends_at')
      .eq('stripe_subscription_id', subscriptionId!)
      .maybeSingle();
    const waitFor = async (predicate: () => Promise<boolean>) => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('Stripe lifecycle convergence timeout');
    };
    const waitForClock = async () => waitFor(async () => (
      (await stripe.testHelpers.testClocks.retrieve(clockId!)).status === 'ready'
    ));
    const advanceBillingPeriod = async () => {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId!);
      const periodEnd = Number(
        (subscription.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number })
          .current_period_end,
      );
      expect(Number.isFinite(periodEnd)).toBe(true);
      await stripe.testHelpers.testClocks.advance(clockId!, { frozen_time: periodEnd + 3600 });
      await waitForClock();
    };
    const expectLatestPaidGross = async (gross: number) => {
      await waitFor(async () => {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId!, {
          expand: ['latest_invoice'],
        });
        const invoice = typeof subscription.latest_invoice === 'string'
          ? await stripe.invoices.retrieve(subscription.latest_invoice)
          : subscription.latest_invoice;
        return Boolean(invoice && invoice.total === gross && invoice.amount_paid === gross);
      });
      const charges = await stripe.charges.list({ customer: customerId!, limit: 1 });
      expect(charges.data[0]?.amount).toBe(gross);
      expect(charges.data[0]?.receipt_url).toBeTruthy();
    };
    const expectPortalGross = async (gross: number) => {
      const response = await page.request.post('/api/billing/portal');
      expect(response.ok()).toBe(true);
      const url = (await response.json() as { url: string }).url;
      expect(url).toContain('billing.stripe.com');
      await page.goto(url);
      await expect(page.getByText(new RegExp(gross.toLocaleString('ja-JP'))).first()).toBeVisible();
    };

    try {
      await test.step('1 paid signup', async () => {
        await login(page);
        const response = await page.request.get('/api/billing/subscription');
        expect(response.ok()).toBe(true);
        const body = await response.json() as { subscription: { id: string } };
        const clock = await stripe.testHelpers.testClocks.create({
          frozen_time: Math.floor(Date.now() / 1000), name: marker,
        });
        clockId = clock.id;
        const customer = await stripe.customers.create({
          test_clock: clock.id,
          email: 'garage-link-e2e@example.invalid',
          metadata: { marker, disposable: 'true' },
        });
        customerId = customer.id;
        const { error } = await admin.from('company_subscriptions')
          .update({ stripe_customer_id: customer.id }).eq('id', body.subscription.id);
        expect(error).toBeNull();
      });
      let checkoutUrl = '';
      let sessionId = '';
      await test.step('2 Checkout', async () => {
        const response = await page.request.post('/api/billing/checkout', {
          headers: { 'idempotency-key': `${marker}:starter` },
          data: { plan: 'starter', termsAccepted: true },
        });
        expect(response.ok()).toBe(true);
        const body = await response.json() as { url: string; sessionId: string };
        checkoutUrl = body.url;
        sessionId = body.sessionId;
      });
      await test.step('3 payment success', async () => {
        await page.goto(checkoutUrl);
        await page.getByLabel(/メール|Email/i).fill('garage-link-e2e@example.invalid').catch(() => undefined);
        await page.getByLabel(/カード番号|Card number/i).fill('4242424242424242');
        await page.getByLabel(/有効期限|Expiration/i).fill('1234');
        await page.getByLabel(/セキュリティコード|CVC/i).fill('123');
        await page.getByRole('button', { name: /申し込む|Subscribe|Pay/i }).click();
        await page.waitForURL(/checkout=success/);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        expect(session.amount_total).toBe(7480);
        customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
        await expectLatestPaidGross(7480);
      });
      await test.step('4 Webhook', async () => {
        await waitFor(async () => Boolean((await readDbSubscription()).data));
      });
      await test.step('5 DB plan反映', async () => {
        expect((await readDbSubscription()).data?.plan).toBe('starter');
      });
      await test.step('6 entitlement反映', async () => {
        const body = await (await page.request.get('/api/billing/subscription')).json() as {
          subscription: { billing_state: string };
        };
        expect(body.subscription.billing_state).toBe('active');
      });
      await test.step('7 quota強制', async () => {
        const { data, error } = await admin.rpc('garage_commercial_e2e_quota_probe', { p_marker: marker });
        expect(error).toBeNull();
        expect(data).toMatchObject({ atomic: true, ui_api_db_consistent: true });
      });
      await test.step('8 Portal', async () => {
        await expectPortalGross(7480);
      });
      await test.step('9 upgrade', async () => {
        const response = await page.request.post('/api/billing/change-plan', {
          headers: { 'idempotency-key': `${marker}:upgrade-standard` },
          data: { plan: 'standard', termsAccepted: true },
        });
        expect(response.status()).toBe(202);
        await waitFor(async () => {
          const { data } = await admin.from('billing_sync_operations').select('status')
            .eq('idempotency_key', `${marker}:upgrade-standard`).maybeSingle();
          return data?.status === 'completed';
        });
        expect((await stripe.subscriptions.retrieve(subscriptionId!)).items.data[0]?.price.unit_amount)
          .toBe(16280);
        await advanceBillingPeriod();
        await expectLatestPaidGross(16280);
        await expectPortalGross(16280);
        const pro = await page.request.post('/api/billing/change-plan', {
          headers: { 'idempotency-key': `${marker}:upgrade-pro` },
          data: { plan: 'pro', termsAccepted: true },
        });
        expect(pro.status()).toBe(202);
        await waitFor(async () => {
          const { data } = await admin.from('billing_sync_operations').select('status')
            .eq('idempotency_key', `${marker}:upgrade-pro`).maybeSingle();
          return data?.status === 'completed';
        });
        expect((await stripe.subscriptions.retrieve(subscriptionId!)).items.data[0]?.price.unit_amount)
          .toBe(32780);
        await advanceBillingPeriod();
        await expectLatestPaidGross(32780);
        await expectPortalGross(32780);
      });
      await test.step('10 downgrade', async () => {
        const response = await page.request.post('/api/billing/change-plan', {
          headers: { 'idempotency-key': `${marker}:downgrade` },
          data: { plan: 'starter', termsAccepted: true },
        });
        expect(response.status()).toBe(202);
        await advanceBillingPeriod();
        await waitFor(async () => (await readDbSubscription()).data?.plan === 'starter');
        await expectLatestPaidGross(7480);
      });
      await test.step('11 add-on変更', async () => {
        const response = await page.request.post('/api/billing/change-options', {
          headers: { 'idempotency-key': `${marker}:addon` },
          data: { type: 'add_staff', action: 'add', amount: 1, termsAccepted: true },
        });
        expect(response.status()).toBe(202);
        await waitFor(async () => {
          const { data } = await admin.from('billing_sync_operations').select('status')
            .eq('idempotency_key', `${marker}:addon`).maybeSingle();
          return data?.status === 'completed';
        });
      });
      await test.step('12 payment failure', async () => {
        const paymentMethod = await stripe.paymentMethods.create({
          type: 'card', card: { token: 'tok_chargeCustomerFail' }, metadata: { marker },
        });
        await stripe.customers.update(customerId!, {
          invoice_settings: { default_payment_method: paymentMethod.id },
        });
        await advanceBillingPeriod();
        await waitFor(async () => {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId!, {
            expand: ['latest_invoice'],
          });
          const invoice = typeof subscription.latest_invoice === 'string'
            ? await stripe.invoices.retrieve(subscription.latest_invoice)
            : subscription.latest_invoice;
          return Boolean(invoice && invoice.total === 8580 && invoice.amount_paid === 0);
        });
      });
      await test.step('13 grace / restriction', async () => {
        await waitFor(async () => ['grace_period', 'restricted'].includes(
          (await readDbSubscription()).data?.billing_state ?? '',
        ));
        const paymentMethod = await stripe.paymentMethods.create({
          type: 'card', card: { token: 'tok_visa' }, metadata: { marker },
        });
        await stripe.customers.update(customerId!, {
          invoice_settings: { default_payment_method: paymentMethod.id },
        });
        const subscription = await stripe.subscriptions.retrieve(subscriptionId!);
        const invoiceId = typeof subscription.latest_invoice === 'string'
          ? subscription.latest_invoice
          : subscription.latest_invoice?.id;
        expect(invoiceId).toBeTruthy();
        const paid = await stripe.invoices.pay(invoiceId!);
        expect(paid.amount_paid).toBe(8580);
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'active');
      });
      await test.step('14 cancellation', async () => {
        expect((await stripe.subscriptions.update(subscriptionId!, {
          cancel_at_period_end: true,
        })).cancel_at_period_end).toBe(true);
      });
      await test.step('15 restoration', async () => {
        expect((await stripe.subscriptions.update(subscriptionId!, {
          cancel_at_period_end: false,
        })).cancel_at_period_end).toBe(false);
      });
      const replay = async (event: Stripe.Event) => {
        const payload = JSON.stringify(event);
        const signature = stripe.webhooks.generateTestHeaderString({
          payload, secret: required('STRIPE_WEBHOOK_SECRET'),
        });
        return request.post(`${baseUrl}/api/billing/webhook`, {
          data: payload, headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
        });
      };
      await test.step('16 duplicate webhook', async () => {
        const event = (await stripe.events.list({
          limit: 1, types: ['customer.subscription.updated'],
        })).data[0]!;
        await replay(event);
        expect((await replay(event)).ok()).toBe(true);
      });
      await test.step('17 out-of-order webhook', async () => {
        const events = (await stripe.events.list({
          limit: 2, types: ['customer.subscription.updated'],
        })).data;
        for (const event of [...events].reverse()) await replay(event);
        expect((await readDbSubscription()).data?.stripe_status)
          .toBe((await stripe.subscriptions.retrieve(subscriptionId!)).status);
      });
      await test.step('18 reconciliation', async () => {
        const response = await request.post(`${baseUrl}/api/jobs/billing-reconciliation`, {
          headers: { authorization: `Bearer ${required('CRON_SECRET')}` },
        });
        expect([200, 503]).toContain(response.status());
      });
    } finally {
      if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
      if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
      if (clockId) await stripe.testHelpers.testClocks.del(clockId).catch(() => undefined);
    }
  });
});
