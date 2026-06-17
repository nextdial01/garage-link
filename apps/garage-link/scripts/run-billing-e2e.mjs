import { spawn } from 'node:child_process';

const requiredWhenEnabled = [
  'E2E_EMAIL',
  'E2E_PASSWORD',
  'E2E_TEST_SUPABASE_URL',
];

function hasValue(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim() !== '';
}

function isBillingMutationEnabled() {
  return process.env.E2E_ALLOW_BILLING_MUTATIONS === 'true';
}

function assertSafeSupabaseUrl() {
  const rawUrl = process.env.E2E_TEST_SUPABASE_URL;
  if (!rawUrl) return;

  const url = new URL(rawUrl);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const confirmedHostedTest = process.env.E2E_CONFIRM_TEST_SUPABASE === 'true';

  if (/prod|production|prd/i.test(rawUrl)) {
    throw new Error('E2E_TEST_SUPABASE_URL looks like production. Refusing to run billing E2E.');
  }

  if (!isLocal && !confirmedHostedTest) {
    throw new Error('Hosted Supabase billing E2E requires E2E_CONFIRM_TEST_SUPABASE=true.');
  }
}

async function isAppReachable() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

  try {
    const response = await fetch(baseUrl, { method: 'HEAD' });
    return response.status < 500;
  } catch {
    return false;
  }
}

function runPlaywright() {
  const child = spawn(
    'pnpm',
    ['--filter', '@apps/garage-link', 'exec', 'playwright', 'test', 'tests/e2e/billing.spec.ts'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    }
  );

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

async function main() {
  if (!isBillingMutationEnabled()) {
    console.log('Skipping GARAGE LINK billing E2E: E2E_ALLOW_BILLING_MUTATIONS is not true.');
    return;
  }

  const missing = requiredWhenEnabled.filter((name) => !hasValue(name));
  if (!hasValue('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY') && !hasValue('E2E_TEST_SUPABASE_KEY')) {
    missing.push('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY or E2E_TEST_SUPABASE_KEY');
  }
  if (missing.length > 0) {
    throw new Error(`Billing E2E is enabled but required env is missing: ${missing.join(', ')}`);
  }

  assertSafeSupabaseUrl();

  if (!(await isAppReachable())) {
    throw new Error('GARAGE LINK app is not reachable. Start pnpm dev:garage-link in another terminal or set PLAYWRIGHT_BASE_URL.');
  }

  runPlaywright();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
