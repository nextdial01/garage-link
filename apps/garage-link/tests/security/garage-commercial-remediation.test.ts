import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  GARAGE_ADDON_PRICE_ENV,
  GARAGE_STRIPE_PRICE_ENV,
  getGarageBillingAccess,
  parseGarageGraceDays,
  resolveGarageBillingState,
} from '../../src/lib/billing/garageCommercial';
import { GARAGE_PLANS } from '../../src/lib/billing/garagePlans';

test.describe('GARAGE LINK commercial contract', () => {
  test('固定料金・税抜基準・上限・registryを単一契約で保持する', () => {
    expect(GARAGE_PLANS.free).toMatchObject({
      monthlyPrice: 0,
      netBasisMonthlyPrice: 0,
      inventoryLimit: 5,
      includedStaffCount: 1,
      includedStoreCount: 1,
      storageLimitMb: 500,
      quoteInvoiceLimit: 5,
    });
    expect(GARAGE_PLANS.starter).toMatchObject({
      monthlyPrice: 7480,
      netBasisMonthlyPrice: 6800,
      inventoryLimit: 50,
      includedStaffCount: 1,
      includedStoreCount: 1,
      storageLimitMb: 2048,
      quoteInvoiceLimit: 20,
    });
    expect(GARAGE_PLANS.standard).toMatchObject({
      monthlyPrice: 16280,
      netBasisMonthlyPrice: 14800,
      inventoryLimit: 200,
      includedStaffCount: 3,
      includedStoreCount: 1,
      storageLimitMb: 10240,
      quoteInvoiceLimit: null,
      lLinkIntegrationEnabled: false,
      lLinkAvailability: 'preparing',
    });
    expect(GARAGE_PLANS.pro).toMatchObject({
      monthlyPrice: 32780,
      netBasisMonthlyPrice: 29800,
      inventoryLimit: 500,
      includedStaffCount: 10,
      includedStoreCount: 3,
      storageLimitMb: 51200,
      quoteInvoiceLimit: null,
      lLinkIntegrationEnabled: false,
      lLinkAvailability: 'preparing',
    });
    expect(GARAGE_STRIPE_PRICE_ENV).toEqual({
      starter: 'STRIPE_PRICE_STARTER',
      standard: 'STRIPE_PRICE_STANDARD',
      pro: 'STRIPE_PRICE_PRO',
    });
    expect(GARAGE_ADDON_PRICE_ENV).toEqual({
      extra_staff: 'STRIPE_PRICE_EXTRA_STAFF',
      extra_store: 'STRIPE_PRICE_EXTRA_STORE',
      extra_storage_10gb: 'STRIPE_PRICE_EXTRA_STORAGE_10GB',
    });
  });

  test('支払失敗は期限なしで有料entitlementを維持しない', () => {
    expect(parseGarageGraceDays(undefined)).toBe(0);
    expect(parseGarageGraceDays('7')).toBe(7);
    expect(() => parseGarageGraceDays('31')).toThrow();
    expect(resolveGarageBillingState({ stripeStatus: 'past_due' })).toBe('restricted');
    expect(resolveGarageBillingState({
      stripeStatus: 'past_due',
      graceEndsAt: '2026-08-07T00:00:00.000Z',
      now: new Date('2026-08-01T00:00:00.000Z'),
    })).toBe('grace_period');
    expect(resolveGarageBillingState({
      stripeStatus: 'past_due',
      graceEndsAt: '2026-08-07T00:00:00.000Z',
      now: new Date('2026-08-08T00:00:00.000Z'),
    })).toBe('restricted');
    expect(getGarageBillingAccess('restricted')).toMatchObject({
      paidEntitlementsEnabled: false,
      businessReadEnabled: false,
      businessWriteEnabled: false,
      billingRecoveryEnabled: true,
    });
  });

  test('Webhook・reconciliation・quotaはCommercial migrationへ結線される', async () => {
    const [webhook, reconciliation, migration, checkout, middleware, registryCheck, e2eRunner, stagingWorkflow, stagingPreflight] = await Promise.all([
      readFile('src/app/api/billing/webhook/route.ts', 'utf8'),
      readFile('src/app/api/jobs/billing-reconciliation/route.ts', 'utf8'),
      readFile('supabase/migrations/20260731000100_commercial_remediation_batch_1.sql', 'utf8'),
      readFile('src/app/api/billing/checkout/route.ts', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
      readFile('scripts/verify-garage-stripe-test-registry.mjs', 'utf8'),
      readFile('scripts/run-billing-e2e.mjs', 'utf8'),
      readFile('../../.github/workflows/garage-link-commercial-staging.yml', 'utf8'),
      readFile('scripts/verify-commercial-staging-preflight.mjs', 'utf8'),
    ]);
    for (const event of [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
    ]) {
      expect(webhook).toContain(event);
    }
    expect(webhook).toContain('apply_garage_subscription_event_v2');
    expect(reconciliation).toContain('apply_garage_subscription_event_v2');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('billing_sync_operations_one_open_checkout_uidx');
    expect(migration).toContain('a00_billing_access_membership');
    expect(migration).toContain('billing_access_restricted');
    expect(migration).toContain("'dead_letter'");
    expect(checkout).not.toContain('applyGaragePlanFromStripe');
    expect(checkout).toContain("operation_type: 'checkout'");
    expect(checkout).toContain('idempotencyKey: operation.id');
    expect(middleware).toContain('billing_access_restricted');
    expect(registryCheck).toContain("secret.startsWith('sk_test_')");
    expect(registryCheck).toContain('amount: 7480');
    expect(registryCheck).toContain('amount: 32780');
    expect(registryCheck).toContain("product: 'prod_UphNg22hvZ9jwJ'");
    expect(registryCheck).toContain("item: 'extra_storage_10gb'");
    expect(e2eRunner).toContain('E2E_REQUIRE_BILLING');
    expect(stagingWorkflow).toContain('E2E_REQUIRE_BILLING: "true"');
    expect(stagingWorkflow).toContain('not PAID_SALES_READY by itself');
    expect(stagingPreflight).toContain("secretKey.startsWith('sk_test_')");
    expect(stagingPreflight).toContain('wmlpuzuskfiwdipluglz');
  });
});
