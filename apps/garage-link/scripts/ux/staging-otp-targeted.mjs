import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const PROJECT_REF = 'gaytoojzwqkpuvfofeql';
const BASE_URL = 'https://garage-link-staging.vercel.app';
const DEPLOYMENT_ID = 'dpl_BFFb2jPtg971Hu82zBThPsKgqUVY';
const QA_PREFIX = 'ux.qa.20260803.';
const STORE_NAME = '[UX QA 20260803] 受入監査店';
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
if (users.length === 0) throw new Error('QA_USERS_NOT_FOUND');

const userIds = users.map((user) => user.id);
const { data: memberships, error: membershipError } = await service
  .from('memberships')
  .select('id,tenant_id,store_id,user_id,role,status,disabled_at,deleted_at')
  .in('user_id', userIds);
if (membershipError) throw membershipError;

const storeIds = [...new Set((memberships ?? []).map((membership) => membership.store_id).filter(Boolean))];
const { data: stores, error: storeError } = await service
  .from('stores')
  .select('id,tenant_id,name,status')
  .in('id', storeIds);
if (storeError) throw storeError;

const storeById = new Map((stores ?? []).map((store) => [store.id, store]));
const userById = new Map(users.map((user) => [user.id, user]));
const candidates = (memberships ?? [])
  .filter((membership) => membership.role === 'owner'
    && membership.status === 'active'
    && !membership.disabled_at
    && !membership.deleted_at
    && storeById.get(membership.store_id)?.name === STORE_NAME)
  .map((membership) => ({ membership, store: storeById.get(membership.store_id), user: userById.get(membership.user_id) }))
  .filter((candidate) => candidate.user?.email);

const canonicalCandidates = candidates.filter((candidate) => candidate.user.email.toLowerCase().endsWith('.invalid'));
if (canonicalCandidates.length !== 1) {
  throw new Error(`CANONICAL_QA_OWNER_COUNT:${canonicalCandidates.length}`);
}
const canonical = canonicalCandidates[0];
const duplicates = candidates.filter((candidate) => candidate.user.id !== canonical.user.id);

let temporaryPassword = `${randomBytes(48).toString('base64url')}Aa1!`;
const { error: rotateError } = await service.auth.admin.updateUserById(canonical.user.id, {
  password: temporaryPassword,
});
if (rotateError) throw rotateError;

const { count: challengeCountBefore, error: beforeError } = await service
  .from('admin_email_otp_challenges')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', canonical.user.id);
if (beforeError) throw beforeError;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const safeNetwork = [];

page.on('request', async (request) => {
  const pathname = new URL(request.url()).pathname;
  if (!['/api/auth/password-login', '/api/auth/admin-email-otp/request'].includes(pathname)) return;
  const headers = await request.allHeaders();
  safeNetwork.push({
    phase: 'request',
    at: new Date().toISOString(),
    url: request.url(),
    method: request.method(),
    origin: headers.origin ?? null,
    referer: headers.referer ?? null,
    host: new URL(request.url()).host,
    xForwardedHost: headers['x-forwarded-host'] ?? null,
    secFetchSite: headers['sec-fetch-site'] ?? null,
    cookieSent: Boolean(headers.cookie),
  });
});

page.on('response', async (response) => {
  const pathname = new URL(response.url()).pathname;
  if (!['/api/auth/password-login', '/api/auth/admin-email-otp/request'].includes(pathname)) return;
  let safeErrorCode = null;
  if (response.status() >= 400) {
    const body = await response.json().catch(() => null);
    safeErrorCode = typeof body?.error === 'string' ? body.error : null;
  }
  const headers = await response.allHeaders();
  safeNetwork.push({
    phase: 'response',
    at: new Date().toISOString(),
    url: response.url(),
    status: response.status(),
    safeErrorCode,
    vercelRequestId: headers['x-vercel-id'] ?? null,
    deploymentId: DEPLOYMENT_ID,
  });
});

try {
  await page.goto('/login?next=%2Fdashboard');
  await page.locator('#email').fill(canonical.user.email);
  await page.locator('#password').fill(temporaryPassword);
  const loginResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/password-login');
  const otpResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/admin-email-otp/request');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  await page.waitForURL(/\/security\/email-otp/, { timeout: 30_000 });
  const otpResponse = await otpResponsePromise;
  const sessionCookies = (await context.cookies(BASE_URL)).filter((cookie) => cookie.name.startsWith('sb-'));
  const cookieContract = {
    present: sessionCookies.length > 0,
    canonicalDomain: sessionCookies.every((cookie) => cookie.domain === 'garage-link-staging.vercel.app'),
    rootPath: sessionCookies.every((cookie) => cookie.path === '/'),
    secure: sessionCookies.every((cookie) => cookie.secure),
    sameSiteAccepted: sessionCookies.every((cookie) => ['Lax', 'None'].includes(cookie.sameSite)),
    hasExpiry: sessionCookies.every((cookie) => cookie.expires > 0),
  };
  const { count: challengeCountAfter, error: afterError } = await service
    .from('admin_email_otp_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', canonical.user.id);
  if (afterError) throw afterError;

  process.stdout.write(`${JSON.stringify({
    status: 'TARGETED_REPRODUCED',
    source_sha: '43cbf152e884316fc5b052a8ab13e87fd16c5676',
    deployment_id: DEPLOYMENT_ID,
    canonical_host: BASE_URL,
    project_ref: PROJECT_REF,
    password_rotated: true,
    canonical_role: canonical.membership.role,
    canonical_status: canonical.membership.status,
    login_status: loginResponse.status(),
    session_cookie_present: cookieContract.present,
    cookie_contract: cookieContract,
    final_url: page.url(),
    otp_request_status: otpResponse.status(),
    challenge_delta: (challengeCountAfter ?? 0) - (challengeCountBefore ?? 0),
    duplicate_fixture_count: duplicates.length,
    safe_network: safeNetwork,
  })}\n`);
} finally {
  temporaryPassword = '';
  await context.close();
  await browser.close();
}
