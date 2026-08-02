import { chmodSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { login } from './helpers';
import { STORAGE_STATE_PATH } from '../../playwright.commercial-staging.config';

// Runs once per workflow invocation (a Playwright project dependency, not a retry loop):
// signs in via the real UI including the admin email-OTP challenge, then saves the
// resulting session to STORAGE_STATE_PATH so every checkpoint test in
// billing-stripe-lifecycle.spec.ts reuses it instead of logging in - and re-requesting an
// OTP - again. This is the only place in the whole run that consumes an OTP challenge.
setup('authenticate once and persist session', async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  chmodSync(STORAGE_STATE_PATH, 0o600);
});
