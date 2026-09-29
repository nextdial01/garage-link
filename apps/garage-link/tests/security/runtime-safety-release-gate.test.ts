import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mobileDeviceTokenHash, mobileReviewFixtureProof } from '../../src/lib/security/adminEmailOtp';

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('release safety env gates LINE, email, Stripe live, and cron execution', () => {
  const helper = source('src/lib/security/runtimeSafety.ts');
  const line = source('src/lib/line/sendMessage.ts');
  const email = source('src/lib/notifications/sendAdminOtpEmail.ts');
  const mobileOtpRequest = source('src/app/api/mobile/admin-email-otp/request/route.ts');
  const mobileBearerAuth = source('src/lib/mobile/bearerAuth.ts');
  const reviewFixtureMigration = source('supabase/migrations/20260913115019_garage_mobile_review_fixture_access.sql');
  const stripe = source('src/lib/stripe/client.ts');
  const cron = source('src/app/api/cron/purge-expired-store-data/route.ts');
  const inspectionCron = source('src/app/api/jobs/inspection-reminders/route.ts');

  expect(helper).toContain("GARAGE_EXTERNAL_SENDS_DISABLED");
  expect(helper).toContain("GARAGE_AUTOMATION_DISABLED");
  expect(helper).toContain("GARAGE_STRIPE_TEST_MODE_REQUIRED");
  expect(helper).toContain("secretKey.startsWith('sk_test_')");
  expect(line).toContain('areExternalSendsDisabled()');
  expect(line.indexOf('areExternalSendsDisabled()')).toBeLessThan(line.indexOf("fetch('https://api.line.me"));
  expect(email).toContain('areExternalSendsDisabled()');
  expect(email).toContain("process.env.VERCEL_ENV === 'production'");
  expect(email).toContain('isAdminSecurityOtpEmailAllowed()');
  expect(email.indexOf('isAdminSecurityOtpEmailAllowed()')).toBeLessThan(email.indexOf("fetch('https://api.resend.com"));
  expect(email).toContain("return 'resend_sender_configuration_invalid'");
  expect(email).not.toContain('console.error');
  expect(mobileOtpRequest).toContain('ROUTINE_EMAIL_OTP_RETIRED');
  expect(mobileOtpRequest).not.toContain('sendTransactionalEmail');
  expect(mobileOtpRequest).not.toContain('console.error(\'garage_admin_otp_email_delivery_failed\', { email:');
  expect(mobileBearerAuth).toContain("const MOBILE_REVIEW_PROOF_HEADER = 'x-garage-mobile-review-proof'");
  expect(mobileBearerAuth).toContain('reviewFixtureProofFor(userData.user.id)');
  expect(mobileBearerAuth).toContain("return denied(403, 'forbidden_review_fixture_scope'");
  expect(mobileBearerAuth).toContain("return denied(403, 'forbidden_review_fixture_membership'");
  expect(mobileBearerAuth).toContain("membership.role === 'owner'");
  expect(mobileBearerAuth).toContain('const scopedMemberships = reviewFixture');
  expect(mobileBearerAuth).toContain('memberships: scopedMemberships');
  expect(mobileBearerAuth).toContain('store.tenant_id !== reviewFixture.tenantId || store.id !== reviewFixture.storeId');
  expect(mobileBearerAuth).toContain('activeStores.length !== 1');
  expect(mobileBearerAuth).toContain('activeStores[0].tenantId !== reviewFixture.tenantId');
  expect(mobileBearerAuth).toContain('activeStores[0].id !== reviewFixture.storeId');
  expect(reviewFixtureMigration).toContain('GARAGE_MOBILE_REVIEW_FIXTURE_SCOPE_INVALID');
  expect(reviewFixtureMigration).toContain("r.user_id = v_user_id");
  expect(reviewFixtureMigration).toContain("m.tenant_id = r.tenant_id");
  expect(reviewFixtureMigration).toContain("m.store_id = r.store_id");
  expect(reviewFixtureMigration).toContain("r.proof_hash = v_review_proof_hash");
  expect(reviewFixtureMigration).toContain("m.role = 'owner'");
  expect(reviewFixtureMigration).toContain('is_administrator and not is_mobile_review_fixture');
  expect(reviewFixtureMigration).not.toContain('grant select on public.mobile_review_fixture_access to authenticated');
  expect(stripe).toContain('isAllowedStripeSecretKey');
  expect(cron.match(/isAutomationDisabled\(\)/g)?.length).toBe(2);
  expect(inspectionCron).toContain('isAutomationDisabled()');
});

test('review-fixture proof is distinct per exact user and tenant scope', async () => {
  const secret = 'test-only-secret-with-sufficient-length';
  const user = '00000000-0000-4000-8000-000000000001';
  const tenant = '00000000-0000-4000-8000-000000000002';
  const store = '00000000-0000-4000-8000-000000000003';
  const proof = await mobileReviewFixtureProof(secret, user, tenant, store);
  expect(proof).toMatch(/^[0-9a-f]{64}$/);
  expect(await mobileReviewFixtureProof(secret, user, tenant, store)).toBe(proof);
  expect(await mobileReviewFixtureProof(secret, user, tenant, '00000000-0000-4000-8000-000000000004')).not.toBe(proof);
  expect(await mobileReviewFixtureProof(secret, '00000000-0000-4000-8000-000000000005', tenant, store)).not.toBe(proof);
  expect(await mobileDeviceTokenHash(proof)).toMatch(/^[0-9a-f]{64}$/);
});
