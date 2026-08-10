import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const appRoot=resolve(import.meta.dirname,'../..');

test('remote release-critical preflight is Staging-only and non-billing',async()=>{
  const [runner,workflow]=await Promise.all([
    readFile(resolve(appRoot,'scripts/qa/release-critical-preflight.mjs'),'utf8'),
    readFile(resolve(appRoot,'../../.github/workflows/garage-link-release-critical.yml'),'utf8'),
  ]);
  assert.match(runner,/gaytoojzwqkpuvfofeql/);
  assert.match(runner,/wmlpuzuskfiwdipluglz/);
  assert.match(runner,/auth\.admin\.listUsers/);
  assert.match(runner,/config\/auth/);
  assert.match(runner,/x-vercel-protection-bypass/);
  assert.doesNotMatch(runner,/STRIPE_SECRET_KEY|sk_live_|api\.line\.me/);
  assert.match(workflow,/environment: garage-link-commercial-staging/);
  assert.match(workflow,/GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN/);
  assert.match(workflow,/GARAGE_STAGING_QA_MAILBOX/);
  assert.doesNotMatch(workflow,/STRIPE_SECRET_KEY|E2E_ALLOW_BILLING_MUTATIONS|STRIPE_WEBHOOK_SECRET/);
});
