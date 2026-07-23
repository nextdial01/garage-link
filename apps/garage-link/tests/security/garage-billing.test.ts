import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  GARAGE_PLANS,
  canAddStaff,
  canAddStorage,
  canAddStore,
  canAddVehicle,
  canCreateDocument,
  canUseLLinkIntegration,
  getStorageLimit,
} from '../../src/lib/billing/garagePlans';
import { isCurrentInventoryVehicle } from '../../src/lib/billing/garageSubscription';

test.describe('GARAGE LINK billing and plan safety', () => {
  test('料金プラン定義は指定仕様と一致する', () => {
    expect(GARAGE_PLANS.free).toMatchObject({
      monthlyPrice: 0,
      inventoryLimit: 5,
      includedStaffCount: 1,
      includedStoreCount: 1,
      storageLimitMb: 500,
      quoteInvoiceLimit: 5,
      lLinkIntegrationEnabled: false,
    });
    expect(GARAGE_PLANS.starter).toMatchObject({
      monthlyPrice: 7480,
      extraStaffPrice: 1100,
      extraStoragePricePer10Gb: 550,
      individualSupportHourlyPrice: 11000,
      inventoryLimit: 50,
      includedStaffCount: 1,
      includedStoreCount: 1,
      storageLimitMb: 2048,
      quoteInvoiceLimit: 20,
      lLinkIntegrationEnabled: false,
    });
    expect(GARAGE_PLANS.standard).toMatchObject({
      monthlyPrice: 16280,
      extraStaffPrice: 1100,
      extraStorePrice: 5500,
      extraStoragePricePer10Gb: 550,
      individualSupportHourlyPrice: 11000,
      inventoryLimit: 200,
      includedStaffCount: 3,
      includedStoreCount: 1,
      storageLimitMb: 10240,
      quoteInvoiceLimit: null,
      lLinkIntegrationEnabled: true,
    });
    expect(GARAGE_PLANS.pro).toMatchObject({
      monthlyPrice: 32780,
      extraStaffPrice: 1100,
      extraStorePrice: 5500,
      extraStoragePricePer10Gb: 550,
      individualSupportHourlyPrice: 11000,
      inventoryLimit: 500,
      includedStaffCount: 10,
      includedStoreCount: 3,
      storageLimitMb: 51200,
      quoteInvoiceLimit: null,
      lLinkIntegrationEnabled: true,
    });
  });

  test('プラン別の追加オプション可否を判定できる', () => {
    expect(canAddStaff('free')).toBeFalsy();
    expect(canAddStaff('starter')).toBeTruthy();

    expect(canAddStore('free')).toBeFalsy();
    expect(canAddStore('starter')).toBeFalsy();
    expect(canAddStore('standard')).toBeTruthy();
    expect(canAddStore('pro')).toBeTruthy();

    expect(canAddStorage('free')).toBeFalsy();
    expect(canAddStorage('starter')).toBeTruthy();

    expect(canUseLLinkIntegration({ plan: 'free', l_link_integration_enabled: false })).toBeFalsy();
    expect(canUseLLinkIntegration({ plan: 'starter', l_link_integration_enabled: false })).toBeFalsy();
    expect(canUseLLinkIntegration({ plan: 'standard', l_link_integration_enabled: true })).toBeTruthy();
    expect(canUseLLinkIntegration({ plan: 'pro', l_link_integration_enabled: true })).toBeTruthy();
  });

  test('車両登録上限と現在庫対象ステータスを判定できる', () => {
    expect(canAddVehicle({ plan: 'free', current_inventory_limit: 5 }, 4)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(canAddVehicle({ plan: 'free', current_inventory_limit: 5 }, 5)).toMatchObject({
      allowed: false,
      remaining: 0,
    });

    expect(isCurrentInventoryVehicle({ status: '在庫中' })).toBeTruthy();
    expect(isCurrentInventoryVehicle({ status: '商談中' })).toBeTruthy();
    expect(isCurrentInventoryVehicle({ status: '売却済み' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: '納車済み' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: 'sold' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: 'delivered' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: '在庫中', is_archived: true })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: '在庫中', deleted_at: '2026-06-16T00:00:00.000Z' })).toBeFalsy();
  });

  test('見積・請求の月間合算上限を判定できる', () => {
    expect(canCreateDocument({ plan: 'free' }, 4)).toMatchObject({ allowed: true, remaining: 1 });
    expect(canCreateDocument({ plan: 'free' }, 5)).toMatchObject({ allowed: false, remaining: 0 });

    expect(canCreateDocument({ plan: 'starter' }, 19)).toMatchObject({ allowed: true, remaining: 1 });
    expect(canCreateDocument({ plan: 'starter' }, 20)).toMatchObject({ allowed: false, remaining: 0 });

    expect(canCreateDocument({ plan: 'standard' }, 999)).toMatchObject({ allowed: true, limit: null });
    expect(canCreateDocument({ plan: 'pro' }, 999)).toMatchObject({ allowed: true, limit: null });
  });

  test('ストレージ上限は標準と追加容量を合算する', () => {
    expect(getStorageLimit({ plan: 'free', storage_limit_mb: 500, extra_storage_gb: 0 })).toBe(500);
    expect(getStorageLimit({ plan: 'starter', storage_limit_mb: 2048, extra_storage_gb: 20 })).toBe(22528);
  });

  test('037 SQLはサインアップ用RPCとオンボーディング列を含む', async () => {
    const sql = await readFile('supabase/schema/037_signup_onboarding.sql', 'utf8');

    expect(sql).toContain('create or replace function public.create_store_for_current_user');
    expect(sql).toContain('onboarding_completed_at');
    expect(sql).toContain('insert into public.company_subscriptions');
    expect(sql).toContain("'owner'");
    expect(sql).toContain('grant execute on function public.create_store_for_current_user');
  });

  test('030 SQLは契約テーブル・申込テーブル・completed反映RPCを含む', async () => {
    const sql = await readFile('supabase/schema/030_company_billing_requests.sql', 'utf8');

    expect(sql).toContain('create table if not exists public.company_subscriptions');
    expect(sql).toContain('create table if not exists public.plan_change_requests');
    expect(sql).toContain('create index if not exists');
    expect(sql).toContain('drop policy if exists');
    expect(sql).toContain('create policy');
    expect(sql).toContain('completed_at timestamptz');
    expect(sql).toContain('add column if not exists completed_at');
    expect(sql).toContain('create or replace function public.complete_plan_change_request');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('for update');
    expect(sql).toContain('completed_at is not null');
    expect(sql).toContain("request_type in ('plan_change', 'add_staff', 'add_store', 'add_storage', 'support')");
    expect(sql).toContain("status in ('pending', 'approved', 'rejected', 'completed')");
    expect(sql).toContain('l_link_integration_enabled = v_plan in');
    expect(sql).toContain('grant execute on function public.complete_plan_change_request(uuid) to authenticated');
  });

  test('契約者の申込画面は履歴専用で自己承認できない', async () => {
    const source = await readFile('src/app/admin/plan-requests/page.tsx', 'utf8');

    expect(source).not.toContain("supabase.rpc('complete_plan_change_request'");
    expect(source).not.toContain("from('company_subscriptions')");
    expect(source).not.toContain('updateStatus');
    expect(source).toContain('この画面から契約を直接変更することはできません。');
  });

  test('設定画面の主要文言は外部連携・申し込む表記に統一されている', async () => {
    const billingPage = await readFile('src/app/settings/billing/page.tsx', 'utf8');
    const lLinkPage = await readFile('src/app/settings/l-link/page.tsx', 'utf8');

    expect(billingPage).toContain('L-LINK連携');
    expect(billingPage).toContain('このプランで申し込む');
    expect(billingPage).toContain('詳細比較・手動申込');
    expect(billingPage).toContain('プランを選ぶ');
    expect(billingPage).toContain('追加するスタッフ数');

    expect(`${billingPage}\n${lLinkPage}`).not.toContain('LINE基本連携');
    expect(lLinkPage).toContain('L-Link連携はStandard以上で利用できます。');
  });

  test('Stripe Checkout API と migration が存在する', async () => {
    const checkoutRoute = await readFile('src/app/api/billing/checkout/route.ts', 'utf8');
    const subscriptionRoute = await readFile('src/app/api/billing/subscription/route.ts', 'utf8');
    const webhookRoute = await readFile('src/app/api/billing/webhook/route.ts', 'utf8');
    const stripeClient = await readFile('src/lib/stripe/client.ts', 'utf8');
    const webhookIdempotency = await readFile(
      'supabase/migrations/20260723000200_stripe_webhook_idempotency.sql',
      'utf8',
    );
    const migration = await readFile('supabase/migrations/20260706110000_stripe_billing.sql', 'utf8');
    const grantsMigration = await readFile('supabase/migrations/20260706120000_company_subscriptions_grants.sql', 'utf8');
    const rpcMigration = await readFile('supabase/migrations/20260706130000_company_subscriptions_rpc_reads.sql', 'utf8');
    const ownerMigration = await readFile('supabase/migrations/20260706140000_company_subscriptions_owner.sql', 'utf8');
    const billingPage = await readFile('src/app/settings/billing/page.tsx', 'utf8');

    expect(checkoutRoute).toContain("mode: 'subscription'");
    expect(checkoutRoute).toContain('createAdminClient');
    expect(subscriptionRoute).toContain('createAdminClient');
    expect(billingPage).toContain('/api/billing/subscription');
    expect(billingPage).toContain('translateDbError');
    expect(checkoutRoute).not.toContain('payment_method_types');
    expect(checkoutRoute).not.toContain('automatic_tax');
    expect(checkoutRoute).toContain('integration_identifier');
    expect(stripeClient).toContain("apiVersion: '2026-06-24.dahlia'");
    expect(webhookRoute).toContain('checkout.session.completed');
    expect(webhookRoute).toContain('claimStripeEvent');
    expect(webhookRoute).toContain("status: 'failed'");
    expect(webhookIdempotency).toContain('stripe_event_id text not null unique');
    expect(webhookIdempotency).toContain('enable row level security');
    expect(webhookIdempotency).toContain('revoke all on table public.stripe_webhook_events from anon, authenticated');
    expect(migration).toContain('stripe_customer_id');
    expect(migration).toContain('stripe_subscription_id');
    expect(grantsMigration).toContain('ensure_company_subscription');
    expect(rpcMigration).toContain('get_company_subscription');
    expect(ownerMigration).toContain('owner to postgres');
  });

  test('10%相当額を含む請求総額を維持し、免税・適格請求書の案内は利用規約だけに記載する', async () => {
    const legalConstants = await readFile('src/lib/legal/constants.ts', 'utf8');
    const billingPage = await readFile('src/app/settings/billing/page.tsx', 'utf8');
    const publicPage = await readFile('src/components/public-site/GaragePublicPage.tsx', 'utf8');
    const publicRouteBody = await readFile('src/components/public-site/GarageRouteBody.tsx', 'utf8');
    const terms = await readFile('src/app/legal/terms/page.tsx', 'utf8');
    const tokusho = await readFile('src/app/legal/tokusho/page.tsx', 'utf8');
    const planDefinitions = await readFile('../../packages/billing/src/garagePlans.ts', 'utf8');
    const stripeSetup = await readFile('scripts/setup-stripe-test-products.mjs', 'utf8');
    const invoiceVerification = await readFile('scripts/verify-stripe-test-invoice.mjs', 'utf8');
    const sources = `${legalConstants}\n${billingPage}\n${publicPage}\n${publicRouteBody}\n${planDefinitions}\n${stripeSetup}\n${invoiceVerification}`;

    expect(sources).not.toContain('表示価格は税抜です');
    expect(sources).not.toContain('価格は税別です');
    expect(sources).not.toContain('円／月・税別');
    expect(sources).not.toContain(' 税抜</p>');
    expect(legalConstants).toContain('基準料金に10%相当額を加えた請求総額');
    expect(billingPage).toContain('表示額は10%相当額を含む請求総額です');
    expect(`${legalConstants}\n${billingPage}\n${publicPage}\n${publicRouteBody}\n${tokusho}`).not.toContain('当社は免税事業者であり');
    expect(terms).toContain('当社は免税事業者であり、適格請求書発行事業者ではありません。');
    expect(planDefinitions).toContain('monthlyPrice: 7480');
    expect(planDefinitions).toContain('monthlyPrice: 16280');
    expect(planDefinitions).toContain('monthlyPrice: 32780');
    expect(stripeSetup).toContain("amount: 7480");
    expect(stripeSetup).toContain("amount: 16280");
    expect(stripeSetup).toContain("amount: 32780");
    expect(invoiceVerification).toContain("assert.equal(invoice.total, 16280)");
  });

  test('月額利用料の請求書は会社単位で取得し、領収書を表示しない', async () => {
    const invoiceRoute = await readFile('src/app/api/billing/invoices/route.ts', 'utf8');
    const downloadRoute = await readFile('src/app/api/billing/invoices/[invoiceId]/download/route.ts', 'utf8');
    const mapper = await readFile('src/lib/stripe/invoiceHistory.ts', 'utf8');
    const billingPage = await readFile('src/app/settings/billing/page.tsx', 'utf8');

    expect(invoiceRoute).toContain(".eq('tenant_id', tenantId)");
    expect(invoiceRoute).toContain("member.role !== 'owner' && member.role !== 'admin'");
    expect(invoiceRoute).toContain('stripe.invoices.list');
    expect(downloadRoute).toContain("member.role !== 'owner' && member.role !== 'admin'");
    expect(downloadRoute).toContain('invoiceCustomerId !== customerId');
    expect(downloadRoute).toContain("action: 'view_billing_invoice'");
    expect(downloadRoute).toContain('if (!auditLogged)');
    expect(mapper).toContain('/api/billing/invoices/');
    expect(mapper).not.toContain('pdfUrl: invoice.invoice_pdf');
    expect(billingPage).toContain('請求書 PDF');
    expect(`${invoiceRoute}\n${downloadRoute}\n${billingPage}`).not.toContain('領収書');
  });

  test('解約データ保有 migration が存在する', async () => {
    const retention = await readFile('supabase/migrations/20260706150000_subscription_retention.sql', 'utf8');
    const contractAccess = await readFile('src/lib/billing/contractAccess.ts', 'utf8');
    const cronRoute = await readFile('src/app/api/cron/purge-expired-store-data/route.ts', 'utf8');

    expect(retention).toContain('data_delete_scheduled_at');
    expect(retention).toContain("interval '1 year'");
    expect(retention).toContain('purge_expired_store_data');
    expect(contractAccess).toContain('cancelled_retention');
    expect(cronRoute).toContain('purge_expired_store_data');
    const vercel = await readFile('vercel.json', 'utf8');
    expect(vercel).toContain('/api/cron/purge-expired-store-data');
  });

  test('契約取得はRPC経由でテーブル直接SELECTしない', async () => {
    const source = await readFile('src/lib/billing/garageSubscription.ts', 'utf8');

    expect(source).not.toContain("from('company_subscriptions')");
    expect(source).not.toContain("from<CompanySubscriptionRow>('company_subscriptions')");
    expect(source).toContain('ensure_company_subscription');
    expect(source).toContain('get_company_subscription');
  });

  test('料金表の上限はDBで全店舗合算し、契約者の自己反映を禁止する', async () => {
    const migration = await readFile(
      'supabase/migrations/20260718000500_tenant_plan_limits_and_billing_security.sql',
      'utf8',
    );

    expect(migration).toContain('create or replace function public.get_garage_plan_usage');
    expect(migration).toContain('create or replace function public.garage_plan_limit_guard');
    expect(migration).toContain('guard_vehicle_plan_limit');
    expect(migration).toContain('guard_quote_plan_limit');
    expect(migration).toContain('guard_invoice_plan_limit');
    expect(migration).toContain('guard_storage_plan_limit');
    expect(migration).toContain('guard_staff_plan_limit');
    expect(migration).toContain('guard_store_plan_limit');
    expect(migration).toContain('revoke update on public.plan_change_requests from authenticated');
    expect(migration).toContain('revoke execute on function public.complete_plan_change_request(uuid) from authenticated');
    expect(migration).toContain('grant execute on function public.complete_plan_change_request(uuid) to service_role');
  });

  test('有料プラン変更は新規Checkoutを作らず途中精算なしで既存契約を更新する', async () => {
    const checkout = await readFile('src/app/api/billing/checkout/route.ts', 'utf8');
    const changePlan = await readFile('src/app/api/billing/change-plan/route.ts', 'utf8');
    const webhook = await readFile('src/app/api/billing/webhook/route.ts', 'utf8');

    expect(checkout).toContain('use_plan_change');
    expect(changePlan).toContain("proration_behavior: 'none'");
    expect(changePlan).toContain('pending_plan_effective_at');
    expect(webhook).toContain('applyScheduledPlanIfDue');
    expect(webhook).toContain("case 'invoice.paid'");
  });

  test('Stripe決済は利用規約への明示同意を画面とAPIの両方で必須にする', async () => {
    const billingPage = await readFile('src/app/settings/billing/page.tsx', 'utf8');
    const checkout = await readFile('src/app/api/billing/checkout/route.ts', 'utf8');
    const changePlan = await readFile('src/app/api/billing/change-plan/route.ts', 'utf8');
    const changeOptions = await readFile('src/app/api/billing/change-options/route.ts', 'utf8');
    const terms = await readFile('src/app/legal/terms/page.tsx', 'utf8');
    const tokusho = await readFile('src/app/legal/tokusho/page.tsx', 'utf8');

    expect(billingPage).toContain('利用規約');
    expect(billingPage).toContain('termsAccepted');
    expect(billingPage).toContain('!termsAccepted');
    expect(checkout).toContain("body.termsAccepted !== true");
    expect(changePlan).toContain("body?.termsAccepted !== true");
    expect(changeOptions).toContain("body?.termsAccepted !== true");
    expect(checkout).toContain("terms_version: '2026-07-23'");
    expect(checkout).toContain('integration_identifier: createIntegrationIdentifier()');
    expect(terms).toContain('当社は免税事業者であり、適格請求書発行事業者ではありません。');
    expect(tokusho).not.toContain('適格請求書発行事業者ではありません');
    expect(billingPage).not.toContain('当社は免税事業者であり、適格請求書は発行できません。');
  });

  test('L-LINK APIは契約可否をサーバー側で確認する', async () => {
    const inquiries = await readFile('src/app/api/s2s/line-link/inquiries/route.ts', 'utf8');
    const candidates = await readFile('src/app/api/s2s/line-link/delivery-candidates/route.ts', 'utf8');
    const sessionCandidates = await readFile('src/app/api/line-link/delivery-candidates/route.ts', 'utf8');
    expect(inquiries).toContain('canStoreUseLLink');
    expect(candidates).toContain('canStoreUseLLink');
    expect(sessionCandidates).toContain('canStoreUseLLink');
  });
});
