import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const required = [
  'EXPECTED_RELEASE_SHA',
  'EXPECTED_ENVIRONMENT_FINGERPRINT',
  'PLAYWRIGHT_BASE_URL',
  'E2E_TEST_SUPABASE_URL',
  'STRIPE_SECRET_KEY',
  'VERCEL_ACCESS_TOKEN',
  'VERCEL_DEPLOYMENT_ID',
  'STRIPE_ACCOUNT_ID',
  'EXPECTED_VERCEL_PROJECT_ID',
  'EXPECTED_VERCEL_TEAM_ID',
  'EXPECTED_VERCEL_PROJECT_NAME',
  'EXPECTED_STRIPE_ACCOUNT_ID',
  'CRON_SECRET',
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
const productionProjectId = 'prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
if (process.env.EXPECTED_VERCEL_PROJECT_ID === productionProjectId
  || process.env.EXPECTED_VERCEL_PROJECT_NAME === 'garage-link') {
  throw new Error('Production Vercel project is denied.');
}
const vercelHeaders = { Authorization: `Bearer ${process.env.VERCEL_ACCESS_TOKEN}` };
const teamQuery = `teamId=${encodeURIComponent(process.env.EXPECTED_VERCEL_TEAM_ID)}`;
const projectResponse = await fetch(
  `https://api.vercel.com/v9/projects/${encodeURIComponent(process.env.EXPECTED_VERCEL_PROJECT_ID)}?${teamQuery}`,
  { headers: vercelHeaders },
);
if (!projectResponse.ok) throw new Error('Vercel project attestation failed.');
const project = await projectResponse.json();
if (project.id !== process.env.EXPECTED_VERCEL_PROJECT_ID
  || project.name !== process.env.EXPECTED_VERCEL_PROJECT_NAME
  || project.accountId !== process.env.EXPECTED_VERCEL_TEAM_ID) {
  throw new Error('Vercel project fingerprint mismatch.');
}
const deploymentResponse = await fetch(
  `https://api.vercel.com/v13/deployments/${encodeURIComponent(process.env.VERCEL_DEPLOYMENT_ID)}?${teamQuery}`,
  { headers: vercelHeaders },
);
if (!deploymentResponse.ok) throw new Error('Vercel deployment attestation failed.');
const deployment = await deploymentResponse.json();
if (deployment.projectId !== project.id
  || deployment.url !== baseUrl.hostname
  || deployment.meta?.githubCommitSha !== actualSha) {
  throw new Error('Vercel deployment provenance mismatch.');
}
if (process.env.STRIPE_ACCOUNT_ID !== process.env.EXPECTED_STRIPE_ACCOUNT_ID) {
  throw new Error('Stripe account fingerprint mismatch.');
}

const runtimeResponse = await fetch(
  new URL('/api/commercial-staging-fingerprint', baseUrl),
  { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } },
);
if (!runtimeResponse.ok) throw new Error('Deployed application fingerprint attestation failed.');
const runtime = await runtimeResponse.json();
if (runtime.ok !== true
  || runtime.runtime_host !== baseUrl.hostname
  || runtime.supabase_host !== supabaseUrl.hostname
  || runtime.stripe_mode !== 'test'
  || runtime.stripe_account_id !== process.env.STRIPE_ACCOUNT_ID
  || runtime.vercel_project_id !== project.id
  || runtime.vercel_project_name !== project.name
  || runtime.vercel_deployment_id !== deployment.id
  || runtime.release_sha !== actualSha) {
  throw new Error('Deployed application environment fingerprint mismatch.');
}

const fingerprint = createHash('sha256')
  .update([
    baseUrl.hostname,
    supabaseUrl.hostname,
    project.id,
    project.accountId,
    deployment.id,
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
  vercelProject: project.name,
}));
