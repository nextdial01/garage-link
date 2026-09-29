import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertNoAppError, hasE2ECredentials, login } from './helpers';

const enabled = hasE2ECredentials && process.env.E2E_ALLOW_BILLING_MUTATIONS === 'true'
  && Boolean(process.env.E2E_TEST_SUPABASE_URL && process.env.E2E_TEST_SUPABASE_ANON_KEY);
let member: SupabaseClient;
let storeId: string;
let tenantId: string;
let userId: string;

// Current contract: paid entitlement comes from Stripe, never a manual request's
// completed status (20260718000500 + authoritative billing routes). Actual paid
// transitions, invoices, and replay idempotency are exercised by the 9 Stripe checkpoints.
test.describe.serial('プラン・契約E2E', () => {
  test.skip(!enabled, 'Dedicated local billing fixture and mutation authorization are required.');
  test.beforeAll(async () => {
    const url = new URL(process.env.E2E_TEST_SUPABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Local fixture required');
    const appUrl = new URL(process.env.PLAYWRIGHT_BASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname)) throw new Error('Local billing app required');
    if (!process.env.E2E_EMAIL?.endsWith('@example.invalid')) throw new Error('Synthetic email required');
    member = createClient(url.href, process.env.E2E_TEST_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await member.auth.signInWithPassword({
      email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD!,
    });
    expect(error).toBeNull();
    userId = data.user!.id;
    storeId = process.env.E2E_STORE_ID!;
    tenantId = process.env.E2E_TENANT_ID!;
    const membership = await member.from('store_members').select('store_id,role').eq('user_id', userId).single();
    expect(membership.error).toBeNull();
    expect(membership.data).toMatchObject({ store_id: storeId, role: 'owner' });
    const store = await member.from('stores').select('tenant_id').eq('id', storeId).single();
    expect(store.error).toBeNull();
    expect(store.data?.tenant_id).toBe(tenantId);
  });

  test('Free契約の永続化、手動有料権限付与の拒否、再読込一致を確認する', async ({ page }) => {
    await login(page);
    await page.goto('/settings/billing');
    await assertNoAppError(page);
    const before = await (await page.request.get('/api/billing/subscription')).json();
    expect(before.subscription).toMatchObject({ plan: 'free', tenant_id: tenantId, company_id: storeId });
    expect(before.subscription.id).toBeTruthy();
    await expect(page.locator('article').filter({ has: page.getByText('Free', { exact: true }) })
      .getByText('現在のプラン', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
    await expect(page.locator('article').filter({ has: page.getByText('Starter', { exact: true }) })
      .getByRole('button', { name: 'このプランで申し込む', exact: true })).toBeDisabled();
    const request = await member.from('plan_change_requests').insert({
      company_id: storeId, tenant_id: tenantId, requested_by: userId,
      request_type: 'plan_change', current_plan: 'free', requested_plan: 'starter',
      status: 'pending', message: `Synthetic billing ${crypto.randomUUID()}`,
    }).select('id').single();
    expect(request.error?.code).toBe('42501');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await member.rpc('complete_plan_change_request', { p_request_id: crypto.randomUUID() });
      expect(completion.error?.code).toBe('42501');
    }
    const directGrant = await member.from('company_subscriptions')
      .update({ plan: 'pro' }).eq('id', before.subscription.id);
    expect(directGrant.error?.code).toBe('42501');
    await page.reload();
    const after = await (await page.request.get('/api/billing/subscription')).json();
    expect(after.subscription).toMatchObject({ id: before.subscription.id, plan: 'free', tenant_id: tenantId });

  });

  test('契約関連画面と実在商談の帳票導線、L-Link提供準備中の制御を確認する', async ({ page }) => {
    await login(page);
    const customer = await member.from('customers').insert({ store_id: storeId, name: 'Synthetic billing customer', birth_date: '1990-01-01' }).select('id').single();
    expect(customer.error).toBeNull();
    const vehicle = await member.from('vehicles').insert({ store_id: storeId, model_name: 'Synthetic billing vehicle', status: 'in_stock' }).select('id').single();
    expect(vehicle.error).toBeNull();
    const deal = await member.from('deals').insert({ store_id: storeId, customer_id: customer.data!.id, vehicle_id: vehicle.data!.id, title: 'Synthetic billing deal', status: 'new' }).select('id').single();
    expect(deal.error).toBeNull();
    for (const route of ['/settings/billing', '/admin/plan-requests', '/settings/l-link', '/vehicles/new', '/quotes/new', '/settings/members', '/settings/store', `/deals/${deal.data!.id}/quotes/new`, `/deals/${deal.data!.id}/invoices/new`]) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await assertNoAppError(page);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(route);
    }
    await page.goto('/settings/l-link');
    await expect(page.getByText('提供準備中', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'L-Linkアプリへ移動' })).toHaveAttribute('aria-disabled', 'true');
    await page.goto('/settings/billing');
    await page.reload();
    expect((await (await page.request.get('/api/billing/subscription')).json()).subscription.plan).toBe('free');
  });
});
