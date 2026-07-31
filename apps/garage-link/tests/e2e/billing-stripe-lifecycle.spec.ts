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
    let quotaStoreId: string | null = null;
    const checkoutSessionIds = new Set<string>();
    const subscriptionIds = new Set<string>();
    const invoiceIds = new Set<string>();
    const quotaPrefix = `E2E-B1B-${required('EXPECTED_RELEASE_SHA').slice(0, 8)}`;

    const readDbSubscription = async () => admin.from('company_subscriptions')
      .select('company_id,tenant_id,plan,billing_state,stripe_status,grace_ends_at')
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
        if (invoice?.id) invoiceIds.add(invoice.id);
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
    const completeCheckout = async (url: string) => {
      await page.goto(url);
      await page.getByLabel(/メール|Email/i).fill('garage-link-e2e@example.invalid').catch(() => undefined);
      const cardNumber = page.getByLabel(/カード番号|Card number/i);
      if (await cardNumber.isVisible().catch(() => false)) {
        await cardNumber.fill('4242424242424242');
        await page.getByLabel(/有効期限|Expiration/i).fill('1234');
        await page.getByLabel(/セキュリティコード|CVC/i).fill('123');
      }
      await page.getByRole('button', { name: /申し込む|Subscribe|Pay/i }).click();
      await page.waitForURL(/checkout=success/);
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
        checkoutSessionIds.add(sessionId);
      });
      await test.step('3 payment success', async () => {
        await completeCheckout(checkoutUrl);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        expect(session.amount_total).toBe(7480);
        customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
        if (subscriptionId) subscriptionIds.add(subscriptionId);
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
        const current = (await readDbSubscription()).data;
        quotaStoreId = current?.company_id ?? null;
        expect(quotaStoreId).toBeTruthy();
        const { data: contract, error: contractError } = await admin
          .from('garage_plan_entitlements').select('inventory_limit')
          .eq('plan', 'starter').single();
        expect(contractError).toBeNull();
        expect(contract?.inventory_limit).toBe(50);
        await admin.from('vehicles').delete().eq('store_id', quotaStoreId!)
          .like('management_no', `${quotaPrefix}%`);
        const { data: existingVehicles, error: countError } = await admin.from('vehicles')
          .select('id,status,deleted_at,is_archived').eq('store_id', quotaStoreId!);
        expect(countError).toBeNull();
        const inactive = new Set(['売却済み', '納車済み', 'sold', 'delivered', 'archived', 'deleted']);
        const activeCount = (existingVehicles ?? []).filter((vehicle) => (
          !vehicle.deleted_at && !vehicle.is_archived && !inactive.has(String(vehicle.status).toLowerCase())
        )).length;
        expect(activeCount).toBeLessThanOrEqual(49);
        const seedCount = 49 - activeCount;
        if (seedCount > 0) {
          const { error } = await admin.from('vehicles').insert(
            Array.from({ length: seedCount }, (_, index) => ({
              store_id: quotaStoreId,
              management_no: `${quotaPrefix}-SEED-${index}`,
              status: 'in_stock',
            })),
          );
          expect(error).toBeNull();
        }
        const attempts = await Promise.all(
          [1, 2].map((index) => admin.from('vehicles').insert({
            store_id: quotaStoreId,
            management_no: `${quotaPrefix}-RACE-${index}`,
            status: 'in_stock',
          })),
        );
        expect(attempts.filter(({ error }) => !error)).toHaveLength(1);
        const api = await (await page.request.get('/api/billing/subscription')).json() as {
          subscription: { plan: string; current_inventory_limit: number };
        };
        expect(api.subscription.plan).toBe('starter');
        expect(api.subscription.current_inventory_limit).toBe(contract!.inventory_limit);
        await page.goto(`${baseUrl}/settings/billing`);
        await expect(page.getByText(/7,480/).first()).toBeVisible();
        await expect(page.getByText(new RegExp(`/\\s*${contract!.inventory_limit}台`)).first()).toBeVisible();
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
        await advanceBillingPeriod();
        await expectLatestPaidGross(8580);
        const remove = await page.request.post('/api/billing/change-options', {
          headers: { 'idempotency-key': `${marker}:addon-remove` },
          data: { type: 'add_staff', action: 'remove', amount: 1, termsAccepted: true },
        });
        expect(remove.status()).toBe(202);
        await waitFor(async () => {
          const { data } = await admin.from('billing_sync_operations').select('status')
            .eq('idempotency_key', `${marker}:addon-remove`).maybeSingle();
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
          return Boolean(invoice && invoice.total === 7480 && invoice.amount_paid === 0);
        });
      });
      await test.step('13 grace / restriction', async () => {
        expect(process.env.GARAGE_BILLING_GRACE_DAYS).toBe('0');
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'restricted');
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
        invoiceIds.add(invoiceId!);
        const paid = await stripe.invoices.pay(invoiceId!);
        expect(paid.amount_paid).toBe(7480);
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'active');
      });
      await test.step('14 cancellation', async () => {
        const response = await page.request.post('/api/billing/cancellation', {
          headers: { 'idempotency-key': `${marker}:cancel` },
          data: { action: 'schedule', termsAccepted: true },
        });
        expect(response.status()).toBe(202);
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'cancellation_scheduled');
      });
      await test.step('15 restoration', async () => {
        const response = await page.request.post('/api/billing/cancellation', {
          headers: { 'idempotency-key': `${marker}:restore` },
          data: { action: 'restore', termsAccepted: true },
        });
        expect(response.status()).toBe(202);
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'active');
        const cancelAgain = await page.request.post('/api/billing/cancellation', {
          headers: { 'idempotency-key': `${marker}:cancel-final` },
          data: { action: 'schedule', termsAccepted: true },
        });
        expect(cancelAgain.status()).toBe(202);
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'cancellation_scheduled');
        const previousSubscription = subscriptionId;
        await advanceBillingPeriod();
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'canceled');
        const checkout = await page.request.post('/api/billing/checkout', {
          headers: { 'idempotency-key': `${marker}:resubscribe` },
          data: { plan: 'standard', termsAccepted: true },
        });
        expect(checkout.ok()).toBe(true);
        const resubscribe = await checkout.json() as { url: string; sessionId: string };
        checkoutSessionIds.add(resubscribe.sessionId);
        await completeCheckout(resubscribe.url);
        const session = await stripe.checkout.sessions.retrieve(resubscribe.sessionId);
        subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id ?? null;
        if (subscriptionId) subscriptionIds.add(subscriptionId);
        expect(subscriptionId).not.toBe(previousSubscription);
        await waitFor(async () => {
          const current = (await readDbSubscription()).data;
          return current?.billing_state === 'active' && current.plan === 'standard';
        });
        expect(session.amount_total).toBe(16280);
        await expectLatestPaidGross(16280);

        const cancelStandard = await page.request.post('/api/billing/cancellation', {
          headers: { 'idempotency-key': `${marker}:cancel-standard` },
          data: { action: 'schedule', termsAccepted: true },
        });
        expect(cancelStandard.status()).toBe(202);
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'cancellation_scheduled');
        await advanceBillingPeriod();
        await waitFor(async () => (await readDbSubscription()).data?.billing_state === 'canceled');

        const proCheckout = await page.request.post('/api/billing/checkout', {
          headers: { 'idempotency-key': `${marker}:resubscribe-pro` },
          data: { plan: 'pro', termsAccepted: true },
        });
        expect(proCheckout.ok()).toBe(true);
        const proSessionBody = await proCheckout.json() as { url: string; sessionId: string };
        checkoutSessionIds.add(proSessionBody.sessionId);
        await completeCheckout(proSessionBody.url);
        const proSession = await stripe.checkout.sessions.retrieve(proSessionBody.sessionId);
        subscriptionId = typeof proSession.subscription === 'string'
          ? proSession.subscription
          : proSession.subscription?.id ?? null;
        if (subscriptionId) subscriptionIds.add(subscriptionId);
        expect(proSession.amount_total).toBe(32780);
        await waitFor(async () => {
          const current = (await readDbSubscription()).data;
          return current?.billing_state === 'active' && current.plan === 'pro';
        });
        await expectLatestPaidGross(32780);
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
        const templates = (await stripe.events.list({
          limit: 2, types: ['customer.subscription.updated'],
        })).data;
        expect(templates.length).toBeGreaterThanOrEqual(1);
        const synthetic = [1, 2].map((suffix) => ({
          ...templates[0],
          id: `evt_garage_b1b_${crypto.randomUUID().replaceAll('-', '')}_${suffix}`,
          created: templates[0]!.created - suffix,
          data: { object: { ...templates[0]!.data.object, id: subscriptionId } },
        })) as Stripe.Event[];
        for (const event of synthetic) expect((await replay(event)).ok()).toBe(true);
        expect((await readDbSubscription()).data?.stripe_status)
          .toBe((await stripe.subscriptions.retrieve(subscriptionId!)).status);
      });
      await test.step('18 reconciliation', async () => {
        const current = (await readDbSubscription()).data;
        expect(current?.tenant_id).toBeTruthy();
        expect(current?.company_id).toBeTruthy();
        const idempotencyKey = `${marker}:reconciliation-recovery`;
        const { data: begun, error: beginError } = await admin.rpc('begin_garage_billing_operation', {
          p_tenant_id: current!.tenant_id,
          p_company_id: current!.company_id,
          p_actor_user_id: null,
          p_operation_type: 'restoration',
          p_idempotency_key: idempotencyKey,
          p_target_plan: 'pro',
          p_target_options: { cancel_at_period_end: false },
          p_stripe_subscription_id: subscriptionId,
        });
        expect(beginError).toBeNull();
        const operationId = (begun as { id?: string }).id;
        expect(operationId).toBeTruthy();
        const { error: recoveryError } = await admin.from('billing_sync_operations').update({
          status: 'reconciliation_required',
          diagnostic_code: 'e2e_forced_reconciliation',
        }).eq('id', operationId!);
        expect(recoveryError).toBeNull();
        const response = await request.post(`${baseUrl}/api/jobs/billing-reconciliation`, {
          headers: { authorization: `Bearer ${required('CRON_SECRET')}` },
        });
        expect(response.status()).toBe(200);
        const result = await response.json() as {
          claimed: number; completed: number; retry_scheduled: number; dead_letter: number; failed: number;
        };
        expect(result.claimed).toBeGreaterThanOrEqual(1);
        expect(result.completed).toBeGreaterThanOrEqual(1);
        expect(result.retry_scheduled).toBe(0);
        expect(result.dead_letter).toBe(0);
        expect(result.failed).toBe(0);
      });
    } finally {
      if (quotaStoreId) {
        const { error } = await admin.from('vehicles').delete().eq('store_id', quotaStoreId)
          .like('management_no', `${quotaPrefix}%`);
        if (error) throw new Error('quota_fixture_teardown_failed');
      }
      for (const trackedSubscriptionId of subscriptionIds) {
        const subscription = await stripe.subscriptions.retrieve(trackedSubscriptionId);
        if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(trackedSubscriptionId);
      }
      for (const trackedSessionId of checkoutSessionIds) {
        const session = await stripe.checkout.sessions.retrieve(trackedSessionId);
        if (session.status === 'open') await stripe.checkout.sessions.expire(trackedSessionId);
        else expect(['complete', 'expired']).toContain(session.status);
      }
      for (const trackedInvoiceId of invoiceIds) {
        const invoice = await stripe.invoices.retrieve(trackedInvoiceId);
        if (invoice.status === 'draft') await stripe.invoices.del(trackedInvoiceId);
        else expect(['paid', 'void', 'uncollectible']).toContain(invoice.status);
      }
      expect(customerId).toBeTruthy();
      const remaining = await stripe.subscriptions.list({ customer: customerId!, status: 'all' });
      expect(remaining.data.filter((subscription) => subscription.status !== 'canceled')).toHaveLength(0);
      if (customerId) await stripe.customers.del(customerId);
      if (clockId) await stripe.testHelpers.testClocks.del(clockId);
      console.info(JSON.stringify({
        teardown: 'garage_commercial_marker',
        active_subscriptions: 0,
        checkout_sessions_terminal: checkoutSessionIds.size,
        invoices_terminal_or_deleted: invoiceIds.size,
        customer_deleted: Boolean(customerId),
        test_clock_deleted: Boolean(clockId),
      }));
    }
  });
});
