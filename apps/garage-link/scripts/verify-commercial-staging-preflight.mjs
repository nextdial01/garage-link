import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const required = [
  'EXPECTED_RELEASE_SHA',
  'EXPECTED_ENVIRONMENT_FINGERPRINT',
  'PLAYWRIGHT_BASE_URL',
  'E2E_TEST_SUPABASE_URL',
  'STRIPE_SECRET_KEY',
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

const fingerprint = createHash('sha256')
  .update([baseUrl.hostname, supabaseUrl.hostname, 'stripe:test'].join('|'))
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
