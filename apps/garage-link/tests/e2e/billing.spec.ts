import { expect, test } from '@playwright/test';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertNoAppError, clickButtonByCandidates, fillField, hasE2ECredentials, login } from './helpers';

const testSupabaseUrl = process.env.E2E_TEST_SUPABASE_URL ?? '';
const testSupabaseAdminKey = process.env.E2E_TEST_SUPABASE_SERVICE_ROLE_KEY ?? process.env.E2E_TEST_SUPABASE_KEY ?? '';
const testSupabaseAnonKey = process.env.E2E_TEST_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? testSupabaseAdminKey;
const hasSupabaseEnv = Boolean(testSupabaseUrl && testSupabaseAnonKey && testSupabaseAdminKey);
const allowBillingMutations = process.env.E2E_ALLOW_BILLING_MUTATIONS === 'true';
const shouldRunBillingE2E = hasE2ECredentials && hasSupabaseEnv && allowBillingMutations;

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type SubscriptionRow = {
  plan: string;
  status: string;
  included_staff_count: number;
  extra_staff_count: number;
  included_store_count: number;
  extra_store_count: number;
  storage_limit_mb: number;
  extra_storage_gb: number;
  current_inventory_limit: number;
  l_link_integration_enabled: boolean;
};

type PlanRequestRow = {
  id: string;
  request_type: string;
  current_plan: string | null;
  requested_plan: string | null;
  requested_extra_staff_count: number | null;
  requested_extra_store_count: number | null;
  requested_extra_storage_gb: number | null;
  status: string;
  completed_at: string | null;
};

function assertSafeTestSupabaseUrl() {
  const url = new URL(testSupabaseUrl);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const confirmedHostedTest = process.env.E2E_CONFIRM_TEST_SUPABASE === 'true';
  const looksProduction = /prod|production|prd/i.test(testSupabaseUrl);

  if (looksProduction) {
    throw new Error('E2E_TEST_SUPABASE_URL looks like production. Billing mutation E2E stopped.');
  }

  if (!isLocal && !confirmedHostedTest) {
    throw new Error('Hosted Supabase billing E2E requires E2E_CONFIRM_TEST_SUPABASE=true.');
  }
}

function createE2EAuthSupabase() {
  return createSupabaseClient(
    testSupabaseUrl,
    testSupabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function createE2EAdminSupabase() {
  return createSupabaseClient(testSupabaseUrl, testSupabaseAdminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function signIn(client: SupabaseClient) {
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.E2E_EMAIL ?? '',
    password: process.env.E2E_PASSWORD ?? '',
  });

  if (error || !data.user?.id) {
    throw new Error(error?.message ?? 'E2Eユーザーでログインできませんでした。');
  }

  return data.user.id;
}

async function getStoreId(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('store_members')
    .select('store_id, role')
    .eq('user_id', userId)
    .single<StoreMemberRow>();

  if (error || !data?.store_id) {
    throw new Error(error?.message ?? 'E2Eユーザーの所属店舗が見つかりません。');
  }

  if (data.role !== 'owner' && data.role !== 'admin') {
    test.skip(true, 'Billing E2E requires owner/admin E2E user.');
  }

  return data.store_id;
}

async function getActiveSubscription(client: SupabaseClient, storeId: string) {
  const { data, error } = await client
    .from('company_subscriptions')
    .select('plan, status, included_staff_count, extra_staff_count, included_store_count, extra_store_count, storage_limit_mb, extra_storage_gb, current_inventory_limit, l_link_integration_enabled')
    .eq('company_id', storeId)
    .eq('status', 'active')
    .single<SubscriptionRow>();

  if (error || !data) {
    throw new Error(error?.message ?? 'active契約が見つかりません。');
  }

  return data;
}

async function resetToNoActiveSubscription(client: SupabaseClient, storeId: string) {
  const { error } = await client
    .from('company_subscriptions')
    .update({ status: 'suspended' })
    .eq('company_id', storeId)
    .eq('status', 'active');

  if (error) {
    throw new Error(error.message);
  }
}

async function createRequest(client: SupabaseClient, storeId: string, userId: string, payload: Record<string, unknown>) {
  const { data, error } = await client
    .from('plan_change_requests')
    .insert({
      company_id: storeId,
      requested_by: userId,
      status: 'pending',
      ...payload,
    })
    .select('id, request_type, current_plan, requested_plan, requested_extra_staff_count, requested_extra_store_count, requested_extra_storage_gb, status, completed_at')
    .single<PlanRequestRow>();

  if (error || !data?.id) {
    throw new Error(error?.message ?? '申込作成に失敗しました。');
  }

  return data;
}

async function completeRequest(client: SupabaseClient, requestId: string) {
  const { error } = await client.rpc('complete_plan_change_request', {
    p_request_id: requestId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

test.describe.serial('プラン・契約E2E', () => {
  test.skip(!shouldRunBillingE2E, 'E2E credentials, Supabase env, and E2E_ALLOW_BILLING_MUTATIONS=true are required.');

  test('Free契約自動作成、プラン申込、completed反映、二重反映、L-Link制御を確認する', async ({ page }) => {
    assertSafeTestSupabaseUrl();
    const authClient = createE2EAuthSupabase();
    const adminClient = createE2EAdminSupabase();
    const userId = await signIn(authClient);
    const storeId = await getStoreId(adminClient, userId);
    const marker = `E2E billing ${Date.now()}`;

    await resetToNoActiveSubscription(adminClient, storeId);

    await login(page);
    await page.goto('/settings/billing');
    await assertNoAppError(page);
    await expect(page.getByText('現在のプラン')).toBeVisible();
    await expect(page.getByText('Free').first()).toBeVisible();

    const freeSubscription = await getActiveSubscription(adminClient, storeId);
    expect(freeSubscription).toMatchObject({
      plan: 'free',
      status: 'active',
      included_staff_count: 1,
      extra_staff_count: 0,
      included_store_count: 1,
      extra_store_count: 0,
      storage_limit_mb: 500,
      extra_storage_gb: 0,
      current_inventory_limit: 5,
      l_link_integration_enabled: false,
    });

    await fillField(page, { labels: ['申込種別'] }, 'プラン変更');
    await fillField(page, { labels: ['希望プラン'] }, 'Starter');
    await fillField(page, { labels: ['備考'] }, `${marker} starter`);
    await clickButtonByCandidates(page, [/申し込む/]);
    await expect(page.getByText('お申し込みを受け付けました。内容を確認後、担当者よりご連絡いたします。')).toBeVisible();

    const { data: starterRequest, error: starterRequestError } = await adminClient
      .from('plan_change_requests')
      .select('id, request_type, current_plan, requested_plan, requested_extra_staff_count, requested_extra_store_count, requested_extra_storage_gb, status, completed_at')
      .eq('company_id', storeId)
      .eq('message', `${marker} starter`)
      .single<PlanRequestRow>();

    expect(starterRequestError).toBeNull();
    expect(starterRequest).toMatchObject({
      request_type: 'plan_change',
      current_plan: 'free',
      requested_plan: 'starter',
      status: 'pending',
    });

    await page.goto('/admin/plan-requests');
    await assertNoAppError(page);
    const starterRow = page.getByRole('row').filter({ hasText: `${marker} starter` });
    await starterRow.locator('select').selectOption('completed');
    await expect(page.getByText('申込を完了し、契約へ反映しました。')).toBeVisible();

    const starterSubscription = await getActiveSubscription(adminClient, storeId);
    expect(starterSubscription).toMatchObject({
      plan: 'starter',
      included_staff_count: 1,
      included_store_count: 1,
      storage_limit_mb: 2048,
      current_inventory_limit: 50,
      l_link_integration_enabled: false,
    });

    const { data: completedStarterRequest } = await adminClient
      .from('plan_change_requests')
      .select('completed_at')
      .eq('id', starterRequest?.id)
      .single<{ completed_at: string | null }>();
    expect(completedStarterRequest?.completed_at).toBeTruthy();

    const addStaffRequest = await createRequest(adminClient, storeId, userId, {
      request_type: 'add_staff',
      current_plan: 'starter',
      requested_extra_staff_count: 2,
      message: `${marker} staff`,
    });
    await completeRequest(adminClient, addStaffRequest.id);
    const afterFirstStaff = await getActiveSubscription(adminClient, storeId);
    await completeRequest(adminClient, addStaffRequest.id);
    const afterSecondStaff = await getActiveSubscription(adminClient, storeId);
    expect(afterSecondStaff.extra_staff_count).toBe(afterFirstStaff.extra_staff_count);

    const standardRequest = await createRequest(adminClient, storeId, userId, {
      request_type: 'plan_change',
      current_plan: 'starter',
      requested_plan: 'standard',
      message: `${marker} standard`,
    });
    await completeRequest(adminClient, standardRequest.id);

    const standardSubscription = await getActiveSubscription(adminClient, storeId);
    expect(standardSubscription).toMatchObject({
      plan: 'standard',
      included_staff_count: 3,
      included_store_count: 1,
      storage_limit_mb: 10240,
      current_inventory_limit: 200,
      l_link_integration_enabled: true,
    });

    await page.goto('/settings/l-link');
    await assertNoAppError(page);
    await expect(page.getByText('L-Link連携可').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'L-Linkアプリへ移動' })).toBeEnabled();

    const addStoreRequest = await createRequest(adminClient, storeId, userId, {
      request_type: 'add_store',
      current_plan: 'standard',
      requested_extra_store_count: 1,
      message: `${marker} store`,
    });
    const addStorageRequest = await createRequest(adminClient, storeId, userId, {
      request_type: 'add_storage',
      current_plan: 'standard',
      requested_extra_storage_gb: 10,
      message: `${marker} storage`,
    });
    await completeRequest(adminClient, addStoreRequest.id);
    await completeRequest(adminClient, addStorageRequest.id);
    const afterOptions = await getActiveSubscription(adminClient, storeId);
    expect(afterOptions.extra_store_count).toBeGreaterThanOrEqual(1);
    expect(afterOptions.extra_storage_gb).toBeGreaterThanOrEqual(10);
  });

  test('プラン制限に関係する主要画面が開ける', async ({ page }) => {
    assertSafeTestSupabaseUrl();
    const authClient = createE2EAuthSupabase();
    const adminClient = createE2EAdminSupabase();
    const userId = await signIn(authClient);
    const storeId = await getStoreId(adminClient, userId);

    await login(page);

    for (const route of ['/settings/billing', '/admin/plan-requests', '/settings/l-link', '/vehicles/new', '/quotes/new', '/settings/members', '/settings/store']) {
      await page.goto(route);
      await assertNoAppError(page);
    }

    const { data: deal } = await adminClient
      .from('deals')
      .select('id')
      .eq('store_id', storeId)
      .limit(1)
      .maybeSingle<{ id: string }>();

    const dealId = deal?.id;
    if (!dealId) {
      test.skip(true, '商談詳細の帳票作成画面確認には検証用dealが必要です。');
    }

    await page.goto(`/deals/${dealId}/quotes/new`);
    await assertNoAppError(page);
    await page.goto(`/deals/${dealId}/invoices/new`);
    await assertNoAppError(page);
  });
});
