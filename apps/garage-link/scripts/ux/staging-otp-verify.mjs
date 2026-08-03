import { chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const PROJECT_REF = 'gaytoojzwqkpuvfofeql';
const BASE_URL = 'https://garage-link-staging.vercel.app';
const QA_PREFIX = 'ux.qa.20260803.';
const STORAGE_STATE_PATH = process.env.UX_OWNER_STORAGE_STATE_PATH
  ?? '/private/tmp/garage-link-ux-owner-storage-state.json';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl.includes(PROJECT_REF) || !serviceRole) {
  throw new Error('STAGING_SERVICE_ROLE_UNAVAILABLE_OR_PROJECT_MISMATCH');
}

const service = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = [];
for (let page = 1; page <= 10; page += 1) {
  const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users.filter((user) => user.email?.toLowerCase().startsWith(QA_PREFIX)));
  if (data.users.length < 1000) break;
}

const owners = [];
for (const user of users) {
  const { data, error } = await service.rpc('admin_email_otp_bootstrap_context', {
    p_user_id: user.id,
    p_session_id: '00000000-0000-0000-0000-000000000001',
  });
  if (error) throw error;
  if (data?.role === 'owner' && user.email?.toLowerCase().endsWith('.invalid')) owners.push({ user, data });
}
if (owners.length !== 1) throw new Error(`CANONICAL_QA_OWNER_COUNT:${owners.length}`);
const canonical = owners[0];
const { data: preparedStore, error: prepareStoreError } = await service.rpc('ux_acceptance_prepare_store', {
  p_tenant_id: canonical.data.tenant_id,
  p_store_id: canonical.data.store_id,
});
if (prepareStoreError) throw prepareStoreError;
if (preparedStore !== true) throw new Error('CANONICAL_QA_STORE_NOT_PREPARED');

let temporaryPassword = `${randomBytes(48).toString('base64url')}Aa1!`;
const { error: rotateError } = await service.auth.admin.updateUserById(canonical.user.id, {
  password: temporaryPassword,
  app_metadata: {
    ...canonical.user.app_metadata,
    purpose: 'ux-acceptance-20260803',
  },
});
if (rotateError) throw rotateError;

const countRows = async (table, filters = []) => {
  let query = service.from(table).select('id', { count: 'exact', head: true });
  for (const [column, operator, value] of filters) query = query[operator](column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

const challengesBefore = await countRows('admin_email_otp_challenges', [['user_id', 'eq', canonical.user.id]]);
const trustedBefore = await countRows('admin_trusted_sessions', [['user_id', 'eq', canonical.user.id]]);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const safeNetwork = [];
const watchedPaths = new Set([
  '/api/auth/password-login',
  '/api/auth/admin-email-otp/request',
  '/api/auth/admin-email-otp/verify',
]);

page.on('request', async (request) => {
  const url = new URL(request.url());
  if (!watchedPaths.has(url.pathname)) return;
  const headers = await request.allHeaders();
  safeNetwork.push({
    phase: 'request',
    path: url.pathname,
    method: request.method(),
    canonicalHost: url.host === 'garage-link-staging.vercel.app',
    sameOrigin: headers.origin === BASE_URL,
    refererCanonical: headers.referer?.startsWith(`${BASE_URL}/`) ?? false,
    cookieSent: Boolean(headers.cookie),
  });
});
page.on('response', async (response) => {
  const url = new URL(response.url());
  if (!watchedPaths.has(url.pathname)) return;
  safeNetwork.push({
    phase: 'response',
    path: url.pathname,
    status: response.status(),
    vercelRequestId: (await response.allHeaders())['x-vercel-id'] ?? null,
  });
});

try {
  await page.goto('/login?next=%2Fdashboard');
  await page.locator('#email').fill(canonical.user.email);
  await page.locator('#password').fill(temporaryPassword);
  const loginPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/password-login');
  const requestPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/admin-email-otp/request');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  const loginResponse = await loginPromise;
  await page.waitForURL(/\/security\/email-otp/, { timeout: 30_000 });
  const requestResponse = await requestPromise;
  if (requestResponse.status() !== 200) throw new Error(`OTP_REQUEST_STATUS:${requestResponse.status()}`);

  const previewMessage = page.getByText(/Preview QA確認コード: \d{6}/);
  await previewMessage.waitFor({ state: 'visible', timeout: 30_000 });
  const message = await previewMessage.textContent();
  const otp = message?.match(/\b(\d{6})\b/)?.[1] ?? '';
  if (!otp) throw new Error('PREVIEW_OTP_NOT_RENDERED');
  await page.getByLabel('メールに届いた6桁コード').fill(otp);
  const verifyPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/admin-email-otp/verify');
  await page.getByRole('button', { name: 'この端末を承認する' }).click();
  const verifyResponse = await verifyPromise;
  if (verifyResponse.status() !== 200) throw new Error(`OTP_VERIFY_STATUS:${verifyResponse.status()}`);
  await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await context.storageState({ path: STORAGE_STATE_PATH });
  await chmod(STORAGE_STATE_PATH, 0o600);

  const challengesAfter = await countRows('admin_email_otp_challenges', [['user_id', 'eq', canonical.user.id]]);
  const openChallengesAfter = await countRows('admin_email_otp_challenges', [
    ['user_id', 'eq', canonical.user.id],
    ['consumed_at', 'is', null],
  ]);
  const trustedAfter = await countRows('admin_trusted_sessions', [['user_id', 'eq', canonical.user.id]]);
  const cookies = await context.cookies(BASE_URL);
  const hasSessionCookie = cookies.some((cookie) => cookie.name.startsWith('sb-'));
  const hasTrustedCookie = cookies.some((cookie) => cookie.name === 'garage_admin_email_verified');

  process.stdout.write(`${JSON.stringify({
    status: 'OTP_TRUSTED_SESSION_VERIFIED',
    project_ref: PROJECT_REF,
    canonical_host: BASE_URL,
    password_rotated: true,
    fixture_onboarding_ready: true,
    role: canonical.data.role,
    login_status: loginResponse.status(),
    otp_request_status: requestResponse.status(),
    otp_verify_status: verifyResponse.status(),
    dashboard_reached: page.url().startsWith(`${BASE_URL}/dashboard`),
    session_cookie_present: hasSessionCookie,
    trusted_cookie_present: hasTrustedCookie,
    challenge_delta: challengesAfter - challengesBefore,
    open_challenge_count: openChallengesAfter,
    trusted_session_delta: trustedAfter - trustedBefore,
    storage_state_created: true,
    storage_state_mode: '0600',
    safe_network: safeNetwork,
  })}\n`);
} finally {
  temporaryPassword = '';
  await context.close();
  await browser.close();
}
