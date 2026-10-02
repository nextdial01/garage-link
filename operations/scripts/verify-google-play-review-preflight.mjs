import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const POLICY_PATH = path.join(ROOT, 'operations/google-play/review-access-policy.json');
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage']);
const IGNORED_FILES = new Set([
  'operations/google-play/review-access-policy.json',
  'operations/google-play/review-preflight.md',
  'operations/scripts/verify-google-play-review-preflight.mjs',
  'operations/tests/google-play-review-preflight.test.mjs',
  'package-lock.json',
  'pnpm-lock.yaml'
]);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.mjs', '.js', '.cjs', '.ts', '.tsx', '.yml', '.yaml', '.sh', '.env', '.txt']);

function fail(code, detail = '') {
  const suffix = detail ? `:${detail}` : '';
  throw new Error(`${code}${suffix}`);
}

export function loadPolicy(file = POLICY_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function validatePolicy(policy) {
  if (policy?.schema_version !== 1) fail('POLICY_SCHEMA_INVALID');
  if (policy?.app_name !== 'GARAGE LINK') fail('APP_NAME_INVALID');
  if (policy?.package_name !== 'com.kannagi.garagelink') fail('PACKAGE_NAME_INVALID');
  if (policy?.canonical_review_email !== 'app-review@kannagi-co.com') fail('CANONICAL_REVIEW_EMAIL_INVALID');
  if (!Array.isArray(policy?.forbidden_identifier_fragments) || !policy.forbidden_identifier_fragments.includes('@review.invalid')) fail('FORBIDDEN_IDENTIFIER_POLICY_MISSING');
  if (policy?.requirements?.play_console_readback_required !== true) fail('PLAY_CONSOLE_READBACK_NOT_REQUIRED');
  if (policy?.requirements?.live_production_login_required !== true) fail('LIVE_LOGIN_NOT_REQUIRED');
  if (policy?.requirements?.english_instructions_required !== true) fail('ENGLISH_INSTRUCTIONS_NOT_REQUIRED');
  if (policy?.requirements?.reusable_credentials_required !== true) fail('REUSABLE_CREDENTIALS_NOT_REQUIRED');
  if (policy?.requirements?.final_build_login_required !== true) fail('FINAL_BUILD_LOGIN_NOT_REQUIRED');
  if (policy?.requirements?.otp_required !== false) fail('OTP_POLICY_INVALID');
  const maxAge = Number(policy?.evidence_max_age_hours);
  if (!Number.isFinite(maxAge) || maxAge <= 0 || maxAge > 24) fail('EVIDENCE_MAX_AGE_INVALID');
  return policy;
}

function walkTextFiles(dir, root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTextFiles(full, root, out);
      continue;
    }
    const relative = path.relative(root, full).split(path.sep).join('/');
    if (IGNORED_FILES.has(relative)) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.startsWith('.env')) continue;
    out.push({ full, relative });
  }
  return out;
}

export function scanRepositoryForForbiddenIdentifiers(policy, root = ROOT) {
  const hits = [];
  const fragments = policy.forbidden_identifier_fragments.map((value) => String(value).toLowerCase());
  for (const file of walkTextFiles(root, root)) {
    const body = fs.readFileSync(file.full, 'utf8').toLowerCase();
    for (const fragment of fragments) {
      if (body.includes(fragment)) hits.push(`${file.relative}:${fragment}`);
    }
  }
  if (hits.length) fail('FORBIDDEN_REVIEW_IDENTIFIER_FOUND', hits.join(','));
  return { scanned: true, forbidden_hits: 0 };
}

export function validateEvidence(evidence, policy, nowMs = Date.now()) {
  if (evidence?.package_name !== policy.package_name) fail('EVIDENCE_PACKAGE_MISMATCH');
  if (evidence?.login_identifier !== policy.canonical_review_email) fail('PLAY_CONSOLE_IDENTIFIER_MISMATCH');
  if (evidence?.saved !== true) fail('PLAY_CONSOLE_SAVE_UNPROVEN');
  if (evidence?.instructions_language !== 'en') fail('PLAY_CONSOLE_INSTRUCTIONS_NOT_ENGLISH');
  if (evidence?.reusable_credentials !== true) fail('PLAY_CONSOLE_CREDENTIALS_NOT_REUSABLE');
  if (evidence?.otp_required !== false) fail('PLAY_CONSOLE_OTP_REQUIREMENT_INVALID');
  if (evidence?.all_app_functions_accessible !== true) fail('PLAY_CONSOLE_FULL_ACCESS_UNPROVEN');
  if (evidence?.source !== 'play-console-ui-readback') fail('PLAY_CONSOLE_EVIDENCE_SOURCE_INVALID');
  if (!Number.isInteger(evidence?.submitted_version_code) || evidence.submitted_version_code <= 0) fail('SUBMITTED_VERSION_CODE_INVALID');
  if (!Number.isInteger(evidence?.tested_version_code) || evidence.tested_version_code <= 0) fail('TESTED_VERSION_CODE_INVALID');
  if (evidence.tested_version_code !== evidence.submitted_version_code) fail('FINAL_BUILD_VERSION_MISMATCH');
  if (evidence?.final_build_login_verified !== true) fail('FINAL_BUILD_LOGIN_UNPROVEN');

  const readbackAt = Date.parse(evidence?.readback_at ?? '');
  if (!Number.isFinite(readbackAt)) fail('PLAY_CONSOLE_READBACK_TIME_INVALID');
  if (readbackAt > nowMs + 5 * 60 * 1000) fail('PLAY_CONSOLE_READBACK_TIME_IN_FUTURE');
  const ageMs = nowMs - readbackAt;
  const maxAgeMs = Number(policy.evidence_max_age_hours) * 60 * 60 * 1000;
  if (ageMs < 0 || ageMs > maxAgeMs) fail('PLAY_CONSOLE_READBACK_STALE');

  const finalBuildVerifiedAt = Date.parse(evidence?.final_build_verified_at ?? '');
  if (!Number.isFinite(finalBuildVerifiedAt)) fail('FINAL_BUILD_VERIFIED_TIME_INVALID');
  if (finalBuildVerifiedAt > nowMs + 5 * 60 * 1000) fail('FINAL_BUILD_VERIFIED_TIME_IN_FUTURE');
  const buildAgeMs = nowMs - finalBuildVerifiedAt;
  if (buildAgeMs < 0 || buildAgeMs > maxAgeMs) fail('FINAL_BUILD_LOGIN_PROOF_STALE');

  return {
    age_minutes: Math.floor(ageMs / 60000),
    final_build_age_minutes: Math.floor(buildAgeMs / 60000),
    submitted_version_code: evidence.submitted_version_code
  };
}

async function verifyLiveProductionLogin(policy) {
  const baseUrl = process.env.GARAGE_PRODUCTION_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.GARAGE_PRODUCTION_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const password = process.env.GOOGLE_PLAY_REVIEW_PASSWORD;
  const explicitEmail = process.env.GOOGLE_PLAY_REVIEW_EMAIL;

  if (!baseUrl) fail('GARAGE_PRODUCTION_SUPABASE_URL_MISSING');
  if (!anonKey) fail('GARAGE_PRODUCTION_SUPABASE_ANON_KEY_MISSING');
  if (!password) fail('GOOGLE_PLAY_REVIEW_PASSWORD_MISSING');
  if (explicitEmail && explicitEmail !== policy.canonical_review_email) fail('REVIEW_EMAIL_ENV_MISMATCH');

  const tokenUrl = `${baseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ email: policy.canonical_review_email, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) fail('LIVE_PRODUCTION_LOGIN_FAILED', String(payload?.error_code || payload?.error || response.status));
  if (payload?.user?.email !== policy.canonical_review_email) fail('LIVE_LOGIN_USER_MISMATCH');
  if (!payload?.access_token) fail('LIVE_LOGIN_TOKEN_MISSING');

  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: anonKey, authorization: `Bearer ${payload.access_token}` }
    });
  } catch {
    // Login proof already succeeded. Logout is best-effort and never exposes the token.
  }
  return { live_production_login: true };
}

function parseArgs(argv) {
  const mode = argv.includes('--live') ? 'live' : 'static';
  const evidenceIndex = argv.indexOf('--evidence');
  const evidencePath = evidenceIndex >= 0 ? argv[evidenceIndex + 1] : null;
  return { mode, evidencePath };
}

export async function run({ mode = 'static', evidencePath = null, root = ROOT } = {}) {
  const policy = validatePolicy(loadPolicy(path.join(root, 'operations/google-play/review-access-policy.json')));
  const scan = scanRepositoryForForbiddenIdentifiers(policy, root);

  if (mode === 'static') {
    return {
      state: 'GOOGLE_PLAY_REVIEW_STATIC_GATE_PASS',
      package_name: policy.package_name,
      canonical_review_email: policy.canonical_review_email,
      ...scan
    };
  }

  if (!evidencePath) fail('PLAY_CONSOLE_EVIDENCE_PATH_REQUIRED');
  const evidence = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), evidencePath), 'utf8'));
  const evidenceResult = validateEvidence(evidence, policy);
  const live = await verifyLiveProductionLogin(policy);
  return {
    state: 'GOOGLE_PLAY_REVIEW_PREFLIGHT_PASS',
    package_name: policy.package_name,
    canonical_review_email: policy.canonical_review_email,
    play_console_readback: true,
    evidence_age_minutes: evidenceResult.age_minutes,
    final_build_age_minutes: evidenceResult.final_build_age_minutes,
    submitted_version_code: evidenceResult.submitted_version_code,
    final_build_login_verified: true,
    ...live
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  const args = parseArgs(process.argv.slice(2));
  run(args)
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ state: 'GOOGLE_PLAY_REVIEW_PREFLIGHT_FAIL', reason: String(error?.message || error) })}\n`);
      process.exit(1);
    });
}
