import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

test('remote release-critical preflight is Staging-only and non-billing', async () => {
  const [runner, workflow] = await Promise.all([
    readFile(resolve(root, 'scripts/qa/release-critical-preflight.mjs'), 'utf8'),
    readFile(resolve(root, '../../.github/workflows/garage-link-release-critical.yml'), 'utf8'),
  ]);

  assert.match(runner, /const STAGING_REF = 'gaytoojzwqkpuvfofeql'/);
  assert.match(runner, /const PRODUCTION_REF = 'wmlpuzuskfiwdipluglz'/);
  assert.match(runner, /SUPABASE_PRODUCTION_DENIED/);
  assert.match(runner, /VERCEL_PRODUCTION_HOST_DENIED/);
  assert.match(runner, /auth\.admin\.listUsers/);
  assert.match(runner, /config\/auth/);
  assert.match(runner, /method: 'PATCH'/);
  assert.match(runner, /x-vercel-protection-bypass/);
  assert.match(runner, /GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(runner, /STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(workflow, /name: GARAGE LINK Release Critical/);
  assert.match(workflow, /environment: garage-link-commercial-staging/);
  assert.match(workflow, /GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  assert.match(workflow, /GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(workflow, /STRIPE_SECRET_KEY|E2E_ALLOW_BILLING_MUTATIONS|STRIPE_WEBHOOK_SECRET/);
});
