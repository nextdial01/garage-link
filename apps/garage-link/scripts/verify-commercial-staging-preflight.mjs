import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const required = [
  'EXPECTED_RELEASE_SHA',
  'EXPECTED_ENVIRONMENT_FINGERPRINT',
  'PLAYWRIGHT_BASE_URL',
  'E2E_TEST_SUPABASE_URL',
  'STRIPE_SECRET_KEY',
  'VERCEL_PROJECT_ID',
  'VERCEL_TEAM_ID',
  'STRIPE_ACCOUNT_ID',
  'EXPECTED_VERCEL_PROJECT_ID',
  'EXPECTED_VERCEL_TEAM_ID',
  'EXPECTED_STRIPE_ACCOUNT_ID',
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  throw new Error(`Commercial staging preflight is missing: ${missing.join(', ')}`);
}

const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actualSha !== process.env.EXPECTED_RELEASE_SHA) {
  throw new Error(`Release SHA mismatch: expected ${process.env.EXPECTED_RELEASE_SHA}, got ${actualSha}`);
}

const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL);
const supabaseUrl = new URL(process.env.E2E_TEST_SUPABASE_URL);
const secretKey = process.env.STRIPE_SECRET_KEY;

if (baseUrl.protocol !== 'https:') {
  throw new Error('Commercial staging must use HTTPS.');
}
if (baseUrl.hostname === 'garage-link.tech' || baseUrl.hostname.endsWith('.garage-link.tech')) {
  throw new Error('Production GARAGE LINK domain is denied.');
}
if (supabaseUrl.hostname.includes('wmlpuzuskfiwdipluglz')) {
  throw new Error('Production/Current Supabase project is denied.');
}
if (!secretKey.startsWith('sk_test_')) {
  throw new Error('Only a Stripe test secret key is allowed.');
}
if (process.env.VERCEL_PROJECT_ID !== process.env.EXPECTED_VERCEL_PROJECT_ID) {
  throw new Error('Vercel project fingerprint mismatch.');
}
if (process.env.VERCEL_TEAM_ID !== process.env.EXPECTED_VERCEL_TEAM_ID) {
  throw new Error('Vercel team fingerprint mismatch.');
}
if (process.env.STRIPE_ACCOUNT_ID !== process.env.EXPECTED_STRIPE_ACCOUNT_ID) {
  throw new Error('Stripe account fingerprint mismatch.');
}

const fingerprint = createHash('sha256')
  .update([
    baseUrl.hostname,
    supabaseUrl.hostname,
    process.env.VERCEL_PROJECT_ID,
    process.env.VERCEL_TEAM_ID,
    process.env.STRIPE_ACCOUNT_ID,
    'stripe:test',
  ].join('|'))
  .digest('hex');

if (fingerprint !== process.env.EXPECTED_ENVIRONMENT_FINGERPRINT) {
  throw new Error('Commercial staging environment fingerprint mismatch.');
}

console.log(JSON.stringify({
  ok: true,
  releaseSha: actualSha,
  environmentFingerprint: fingerprint,
  stripeMode: 'test',
}));
