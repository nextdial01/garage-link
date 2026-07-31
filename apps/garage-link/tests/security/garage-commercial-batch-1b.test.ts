import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  garageNextRetryAt,
  garageRetryDelayMs,
  isGarageLeaseClaimable,
  isGarageRetryDeadLetter,
} from '../../src/lib/billing/garageLifecycle';
import {
  resolveGarageBillingState,
} from '../../src/lib/billing/garageCommercial';
import {
  resolveEffectiveContractAccess,
  type ContractAccess,
} from '../../src/lib/billing/contractAccess';

const now = new Date('2026-07-31T12:00:00.000Z');

test.describe('Batch 1B synchronous entitlement matrix', () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof resolveGarageBillingState>[0];
    expected: string;
  }> = [
    { name: 'grace内', input: { stripeStatus: 'past_due', graceEndsAt: '2026-07-31T12:00:01Z', now }, expected: 'grace_period' },
    { name: 'grace境界', input: { stripeStatus: 'past_due', graceEndsAt: '2026-07-31T12:00:00Z', now }, expected: 'restricted' },
    { name: 'grace超過', input: { stripeStatus: 'past_due', graceEndsAt: '2026-07-31T11:59:59Z', now }, expected: 'restricted' },
    { name: 'grace期限なし', input: { stripeStatus: 'past_due', graceEndsAt: null, now }, expected: 'restricted' },
    { name: 'worker未実行でも期限超過を拒否', input: { stripeStatus: 'past_due', graceEndsAt: '2026-07-01T00:00:00Z', now }, expected: 'restricted' },
    { name: 'webhook未着でも期限超過を拒否', input: { stripeStatus: 'past_due', graceEndsAt: '2026-07-30T00:00:00Z', now }, expected: 'restricted' },
    { name: 'Stripe一時障害中も保存期限で拒否', input: { stripeStatus: 'past_due', graceEndsAt: 'invalid', now }, expected: 'restricted' },
    { name: 'canceled', input: { stripeStatus: 'canceled', now }, expected: 'canceled' },
    { name: 'canceled_at優先', input: { stripeStatus: 'active', canceledAt: '2026-07-31T11:00:00Z', now }, expected: 'canceled' },
    { name: '解約予定期間内', input: { stripeStatus: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: '2026-08-01T00:00:00Z', now }, expected: 'cancellation_scheduled' },
    { name: '解約予定期間終了', input: { stripeStatus: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: '2026-07-31T12:00:00Z', now }, expected: 'canceled' },
    { name: '復旧処理中fail closed', input: { stripeStatus: 'active', restorationState: 'pending', now }, expected: 'reconciliation_required' },
    { name: '復旧完了', input: { stripeStatus: 'active', restorationState: 'restored', now }, expected: 'active' },
    { name: '初回支払待ち', input: { stripeStatus: 'incomplete', now }, expected: 'initial_payment_pending' },
    { name: '初回支払期限切れ', input: { stripeStatus: 'incomplete_expired', now }, expected: 'unpaid' },
    { name: 'unpaid', input: { stripeStatus: 'unpaid', now }, expected: 'unpaid' },
    { name: 'paused', input: { stripeStatus: 'paused', now }, expected: 'restricted' },
    { name: 'active', input: { stripeStatus: 'active', now }, expected: 'active' },
    { name: 'trialing', input: { stripeStatus: 'trialing', now }, expected: 'active' },
    { name: '解約予定だが期間終了なし', input: { stripeStatus: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: null, now }, expected: 'canceled' },
    { name: '解約予定だが期間終了不正', input: { stripeStatus: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: 'invalid', now }, expected: 'canceled' },
    { name: 'trial解約予定期間内', input: { stripeStatus: 'trialing', cancelAtPeriodEnd: true, currentPeriodEnd: '2026-08-01T00:00:00Z', now }, expected: 'cancellation_scheduled' },
    { name: 'trial解約予定期間なし', input: { stripeStatus: 'trialing', cancelAtPeriodEnd: true, now }, expected: 'canceled' },
    { name: '復旧失敗fail closed', input: { stripeStatus: 'active', restorationState: 'failed', now }, expected: 'reconciliation_required' },
    { name: '復旧済みでもStripe canceled優先', input: { stripeStatus: 'canceled', restorationState: 'restored', now }, expected: 'canceled' },
    { name: 'unpaidはgraceを許可しない', input: { stripeStatus: 'unpaid', graceEndsAt: '2026-08-01T00:00:00Z', now }, expected: 'unpaid' },
    { name: 'incompleteは解約予定より優先', input: { stripeStatus: 'incomplete', cancelAtPeriodEnd: true, currentPeriodEnd: '2026-08-01T00:00:00Z', now }, expected: 'initial_payment_pending' },
    { name: 'paused復旧中', input: { stripeStatus: 'paused', restorationState: 'pending', now }, expected: 'reconciliation_required' },
    { name: 'past_dueかつcanceled_at', input: { stripeStatus: 'past_due', canceledAt: '2026-07-31T11:00:00Z', graceEndsAt: '2026-08-01T00:00:00Z', now }, expected: 'canceled' },
    { name: 'trialingかつcanceled_at', input: { stripeStatus: 'trialing', canceledAt: '2026-07-31T11:00:00Z', now }, expected: 'canceled' },
    { name: 'active canceled_at不正値もfail closed', input: { stripeStatus: 'active', canceledAt: 'invalid', now }, expected: 'canceled' },
    { name: 'past_due grace clock skew 1ms', input: { stripeStatus: 'past_due', graceEndsAt: '2026-07-31T12:00:00.001Z', now }, expected: 'grace_period' },
    { name: '未知Stripe状態はfail closed', input: { stripeStatus: 'future_status', now }, expected: 'reconciliation_required' },
  ];

  for (const entry of cases) {
    test(entry.name, () => {
      expect(resolveGarageBillingState(entry.input)).toBe(entry.expected);
    });
  }

  test('状態機械matrixは31ケース以上を実行する', () => {
    expect(cases.length).toBeGreaterThanOrEqual(31);
  });

  test('middleware側でも保存済みgraceを現在時刻で拒否する', () => {
    const stale: ContractAccess = {
      state: 'grace_period',
      graceEndsAt: '2026-07-31T11:59:59Z',
    };
    expect(resolveEffectiveContractAccess(stale, now).state).toBe('restricted');
  });

  test('middleware側でもperiod end境界をcanceledにする', () => {
    const scheduled: ContractAccess = {
      state: 'cancellation_scheduled',
      currentPeriodEnd: '2026-07-31T12:00:00Z',
    };
    expect(resolveEffectiveContractAccess(scheduled, now).state).toBe('canceled');
  });
});

test.describe('Batch 1B retry and lease matrix', () => {
  test('指数backoffと上限', () => {
    expect(garageRetryDelayMs(1)).toBe(120_000);
    expect(garageRetryDelayMs(2)).toBe(240_000);
    expect(garageRetryDelayMs(10)).toBe(3_600_000);
    expect(garageNextRetryAt(1, now)).toBe('2026-07-31T12:02:00.000Z');
  });

  test('最大回数でdead-letter', () => {
    expect(isGarageRetryDeadLetter(4)).toBe(false);
    expect(isGarageRetryDeadLetter(5)).toBe(true);
  });

  test('1 workerのlease', () => {
    expect(isGarageLeaseClaimable({ leaseOwner: null, leaseExpiresAt: null }, 'w1', now)).toBe(true);
  });

  test('2 workerは有効leaseを奪えない', () => {
    expect(isGarageLeaseClaimable({ leaseOwner: 'w1', leaseExpiresAt: '2026-07-31T12:01:00Z' }, 'w2', now)).toBe(false);
  });

  test('10 workerでも同一owner以外は有効leaseを奪えない', () => {
    for (let index = 2; index <= 10; index += 1) {
      expect(isGarageLeaseClaimable({ leaseOwner: 'w1', leaseExpiresAt: '2026-07-31T12:01:00Z' }, `w${index}`, now)).toBe(false);
    }
  });

  test('crash後の期限切れleaseは回収できる', () => {
    expect(isGarageLeaseClaimable({ leaseOwner: 'dead-worker', leaseExpiresAt: '2026-07-31T12:00:00Z' }, 'w2', now)).toBe(true);
  });
});

test.describe('Batch 1B permanent gates', () => {
  test('DBとworkerは順序・重複・lease・dead-letterを実装する', async () => {
    const [migration, webhookRoute, webhook, subscriptionSync, retryWorker, reconciliation, cancellation] = await Promise.all([
      readFile('supabase/migrations/20260731000200_commercial_remediation_batch_1b.sql', 'utf8'),
      readFile('src/app/api/billing/webhook/route.ts', 'utf8'),
      readFile('src/lib/stripe/garageWebhookProcessor.ts', 'utf8'),
      readFile('src/lib/stripe/garageSubscriptionSync.ts', 'utf8'),
      readFile('src/app/api/jobs/billing-webhook-retry/route.ts', 'utf8'),
      readFile('src/app/api/jobs/billing-reconciliation/route.ts', 'utf8'),
      readFile('src/app/api/billing/cancellation/route.ts', 'utf8'),
    ]);
    expect(migration).toContain('garage_effective_billing_state');
    expect(migration).toContain('claim_garage_webhook_retry');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain('claim_garage_subscription_lease');
    expect(migration).toContain('begin_garage_billing_operation');
    expect(migration).toContain('garage_plan_entitlements');
    expect(webhook).toContain('applyAuthoritativeGarageSubscription');
    expect(subscriptionSync).toContain('retrieveAuthoritativeSubscription');
    expect(subscriptionSync).toContain('subscription.metadata?.plan_code ?? input.planCode');
    expect(subscriptionSync).toContain('apply_garage_subscription_snapshot_v3');
    expect(webhook).not.toContain("coalesce(v_row.last_stripe_event_id, '') >= p_event_id");
    expect(retryWorker).toContain('claim_garage_webhook_retry');
    expect(retryWorker).toContain('manualRetry');
    expect(reconciliation).toContain('claim_garage_billing_operations');
    expect(reconciliation).toContain('stripe_mutation_not_observed');
    expect(webhookRoute).toContain('claimOwner');
    expect(webhook).toContain(".eq('lease_owner', leaseOwner)");
    expect(migration).toContain("'superseded_subscription'");
    expect(cancellation).toContain('withGarageSubscriptionMutationLease');
    expect(cancellation).toContain('begin_garage_billing_operation');
  });

  test('料金・税・環境fingerprintをfail closedにする', async () => {
    const [registry, preflight, checkout, fingerprint, billingPage] = await Promise.all([
      readFile('scripts/verify-garage-stripe-test-registry.mjs', 'utf8'),
      readFile('scripts/verify-commercial-staging-preflight.mjs', 'utf8'),
      readFile('src/app/api/billing/checkout/route.ts', 'utf8'),
      readFile('src/app/api/commercial-staging-fingerprint/route.ts', 'utf8'),
      readFile('src/app/settings/billing/page.tsx', 'utf8'),
    ]);
    expect(registry).toContain("tax_behavior === 'inclusive'");
    expect(registry).toContain('automatic_tax');
    expect(registry).toContain('default_tax_rates');
    expect(preflight).toContain('VERCEL_PROJECT_ID');
    expect(preflight).toContain('VERCEL_TEAM_ID');
    expect(preflight).toContain('api.vercel.com/v13/deployments');
    expect(preflight).toContain('prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64');
    expect(preflight).toContain('STRIPE_ACCOUNT_ID');
    expect(preflight).toContain('/api/commercial-staging-fingerprint');
    expect(preflight).toContain('runtime.supabase_host');
    expect(checkout).toContain('automatic_tax: { enabled: false }');
    expect(checkout).toContain('決済再開キーがありません');
    expect(billingPage).toContain('window.sessionStorage.getItem');
    expect(billingPage).toContain("'idempotency-key': idempotencyKey");
    expect(billingPage).not.toContain("if (payload.url) {\n        window.sessionStorage.removeItem(retryKeyName)");
    expect(billingPage).toContain('clearCheckoutRetryKeys();');
    expect(billingPage).toContain("payload.code === 'checkout_session_expired'");
    expect(fingerprint).toContain('GARAGE_COMMERCIAL_STAGING_FINGERPRINT_ENABLED');
    expect(fingerprint).toContain("!stripeKey?.startsWith('sk_test_')");
    expect(fingerprint).toContain('stripe!.accounts.retrieveCurrent()');
    expect(fingerprint).toContain('stripeAccountId !== expectedStripeAccountId');
    expect(fingerprint).not.toContain('accounts.retrieve(expectedStripeAccountId');
    expect(fingerprint).not.toContain('service_role');
  });
});
