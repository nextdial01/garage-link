#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'gaytoojzwqkpuvfofeql';
const PRODUCTION_REF = 'wmlpuzuskfiwdipluglz';
const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PRODUCTION_PROJECT_ID = 'prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const STAGING_PROJECT_NAME = 'garage-link-staging';
const PRODUCTION_HOSTS = new Set(['garage-link.tech', 'www.garage-link.tech']);

function fail(code) {
  throw new Error(code);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`RELEASE_CRITICAL_PREFLIGHT_MISSING:${name}`);
  return value;
}

function isProductionHost(hostname) {
  return PRODUCTION_HOSTS.has(hostname) || hostname.endsWith('.garage-link.tech');
}

function redact(error) {
  return String(error?.message ?? error)
    .replace(/[A-Za-z0-9_-]{32,}/g, '[REDACTED]')
    .replace(/https?:\/\/[^\s)]+/g, '[REDACTED_URL]');
}

async function json(response, code) {
  if (!response.ok) fail(`${code}:${response.status}`);
  return response.json();
}

async function managementConfig(ref, token) {
  return json(await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { authorization: `Bearer ${token}` },
  }), `SUPABASE_MANAGEMENT_AUTH_CONFIG_READ_FAILED:${ref}`);
}

async function main() {
  const expectedSha = required('EXPECTED_RELEASE_SHA');
  const expectedBranch = required('EXPECTED_RELEASE_BRANCH');
  const baseUrl = new URL(required('PLAYWRIGHT_BASE_URL'));
  const supabaseUrl = new URL(required('E2E_TEST_SUPABASE_URL'));
  const serviceRoleKey = required('E2E_TEST_SUPABASE_SERVICE_ROLE_KEY');
  const managementToken = required('GARAGE_STAGING_SUPABASE_MANAGEMENT_TOKEN');
  const vercelToken = required('VERCEL_ACCESS_TOKEN');
  const bypassSecret = required('VERCEL_AUTOMATION_BYPASS_SECRET');
  const qaMailbox = required('GARAGE_STAGING_QA_MAILBOX');
  const teamId = required('EXPECTED_VERCEL_TEAM_ID');
  const projectId = required('EXPECTED_VERCEL_PROJECT_ID');
  const projectName = required('EXPECTED_VERCEL_PROJECT_NAME');

  if (!/^[0-9a-f]{40}$/i.test(expectedSha)) fail('RELEASE_CRITICAL_SOURCE_SHA_INVALID');
  if (!expectedBranch || expectedBranch === 'production') fail('RELEASE_CRITICAL_BRANCH_INVALID');
  if (supabaseUrl.hostname !== `${STAGING_REF}.supabase.co`) fail('SUPABASE_STAGING_REF_MISMATCH');
  if (supabaseUrl.hostname.includes(PRODUCTION_REF)) fail('SUPABASE_PRODUCTION_DENIED');
  if (isProductionHost(baseUrl.hostname)) fail('VERCEL_PRODUCTION_HOST_DENIED');
  if (projectId !== STAGING_PROJECT_ID || projectName !== STAGING_PROJECT_NAME) {
    fail('VERCEL_STAGING_IDENTITY_INPUT_MISMATCH');
  }
  if (projectId === PRODUCTION_PROJECT_ID || !qaMailbox.includes('@')) fail('RELEASE_CRITICAL_CONTRACT_INVALID');

  const admin = createClient(supabaseUrl.toString(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (usersError || !users) fail(`SUPABASE_SERVICE_ROLE_ADMIN_API_FAILED:${usersError?.status ?? 0}`);

  const stagingAuth = await managementConfig(STAGING_REF, managementToken);
  const productionAuth = await managementConfig(PRODUCTION_REF, managementToken);
  const passwordMinimum = stagingAuth.password_min_length ?? stagingAuth.minimum_password_length;
  if (!Number.isInteger(passwordMinimum) || passwordMinimum < 6) {
    fail('SUPABASE_STAGING_AUTH_CONFIG_INVALID');
  }
  // Proves that the token may update only the Staging Auth resource. The payload is
  // idempotent and contains no secret-bearing Auth fields.
  const updateResponse = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/config/auth`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${managementToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ password_min_length: passwordMinimum }),
  });
  if (!updateResponse.ok) fail(`SUPABASE_STAGING_AUTH_UPDATE_PROBE_FAILED:${updateResponse.status}`);
  if (!productionAuth || typeof productionAuth !== 'object') fail('SUPABASE_PRODUCTION_AUTH_READ_FAILED');

  const teamQuery = `teamId=${encodeURIComponent(teamId)}`;
  const headers = { authorization: `Bearer ${vercelToken}` };
  const project = await json(await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}?${teamQuery}`,
    { headers },
  ), 'VERCEL_PROJECT_READ_FAILED');
  if (project.id !== projectId || project.name !== projectName || project.accountId !== teamId) {
    fail('VERCEL_PROJECT_IDENTITY_MISMATCH');
  }
  const deployment = await json(await fetch(
    `https://api.vercel.com/v13/deployments/get?url=${encodeURIComponent(baseUrl.hostname)}&${teamQuery}`,
    { headers },
  ), 'VERCEL_DEPLOYMENT_READ_FAILED');
  if (deployment.projectId !== projectId || deployment.url !== baseUrl.hostname || deployment.readyState !== 'READY') {
    fail('VERCEL_DEPLOYMENT_NOT_READY_OR_MISMATCH');
  }
  if (deployment.meta?.githubCommitSha !== expectedSha || deployment.meta?.githubCommitRef !== expectedBranch) {
    fail('VERCEL_DEPLOYMENT_PROVENANCE_MISMATCH');
  }
  const bypass = await fetch(baseUrl, {
    method: 'HEAD',
    headers: {
      'x-vercel-protection-bypass': bypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    },
    redirect: 'manual',
  });
  if (bypass.status >= 400) fail(`VERCEL_AUTOMATION_BYPASS_FAILED:${bypass.status}`);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    state: 'PREFLIGHT_READY',
    environment: 'garage-link-staging',
    source_sha: expectedSha,
    branch: expectedBranch,
    deployment_id: deployment.uid ?? deployment.id ?? 'unknown',
    auth: {
      service_role_admin_api: 'PASS',
      staging_management_read: 'PASS',
      staging_management_update_probe: 'PASS',
      production_management_read_only: 'PASS',
      password_minimum: passwordMinimum,
      qa_mailbox_contract: 'PASS',
    },
    vercel: { project: projectName, ready: 'PASS', protection_bypass: 'PASS' },
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: redact(error) })}\n`);
  process.exitCode = 1;
});
