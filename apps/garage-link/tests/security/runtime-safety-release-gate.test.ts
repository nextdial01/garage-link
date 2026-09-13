import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('release safety env gates LINE, email, Stripe live, and cron execution', () => {
  const helper = source('src/lib/security/runtimeSafety.ts');
  const line = source('src/lib/line/sendMessage.ts');
  const email = source('src/lib/notifications/sendAdminOtpEmail.ts');
  const mobileOtpRequest = source('src/app/api/mobile/admin-email-otp/request/route.ts');
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
  expect(mobileOtpRequest).toContain("console.error('garage_admin_otp_email_delivery_failed', { reason: sent.error })");
  expect(mobileOtpRequest).not.toContain('console.error(\'garage_admin_otp_email_delivery_failed\', { email:');
  expect(stripe).toContain('isAllowedStripeSecretKey');
  expect(cron.match(/isAutomationDisabled\(\)/g)?.length).toBe(2);
  expect(inspectionCron).toContain('isAutomationDisabled()');
});
