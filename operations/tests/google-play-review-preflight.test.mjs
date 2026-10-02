import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadPolicy,
  scanRepositoryForForbiddenIdentifiers,
  validateEvidence,
  validatePolicy
} from '../scripts/verify-google-play-review-preflight.mjs';

const repoPolicy = validatePolicy(loadPolicy());

function validEvidence(overrides = {}) {
  return {
    package_name: repoPolicy.package_name,
    login_identifier: repoPolicy.canonical_review_email,
    saved: true,
    instructions_language: 'en',
    reusable_credentials: true,
    otp_required: false,
    all_app_functions_accessible: true,
    submitted_version_code: 43,
    tested_version_code: 43,
    final_build_login_verified: true,
    final_build_verified_at: '2026-10-02T03:10:00.000Z',
    source: 'play-console-ui-readback',
    readback_at: '2026-10-02T03:00:00.000Z',
    ...overrides
  };
}

test('canonical GARAGE LINK reviewer policy is fixed', () => {
  assert.equal(repoPolicy.package_name, 'com.kannagi.garagelink');
  assert.equal(repoPolicy.canonical_review_email, 'app-review@kannagi-co.com');
  assert.equal(repoPolicy.requirements.live_production_login_required, true);
  assert.equal(repoPolicy.requirements.play_console_readback_required, true);
  assert.equal(repoPolicy.requirements.final_build_login_required, true);
});

test('fresh Play Console readback for the canonical reviewer passes', () => {
  const result = validateEvidence(validEvidence(), repoPolicy, Date.parse('2026-10-02T04:00:00.000Z'));
  assert.equal(result.age_minutes, 60);
});

test('old reviewer identifier is rejected', () => {
  assert.throws(
    () => validateEvidence(validEvidence({ login_identifier: 'garage-link-reviewer-20260908@review.invalid' }), repoPolicy, Date.parse('2026-10-02T04:00:00.000Z')),
    /PLAY_CONSOLE_IDENTIFIER_MISMATCH/
  );
});

test('a different tested build from the submitted build is rejected', () => {
  assert.throws(
    () => validateEvidence(validEvidence({ tested_version_code: 42 }), repoPolicy, Date.parse('2026-10-02T04:00:00.000Z')),
    /FINAL_BUILD_VERSION_MISMATCH/
  );
});

test('missing final build login proof is rejected', () => {
  assert.throws(
    () => validateEvidence(validEvidence({ final_build_login_verified: false }), repoPolicy, Date.parse('2026-10-02T04:00:00.000Z')),
    /FINAL_BUILD_LOGIN_UNPROVEN/
  );
});

test('stale Play Console readback is rejected', () => {
  assert.throws(
    () => validateEvidence(validEvidence({ readback_at: '2026-09-30T00:00:00.000Z' }), repoPolicy, Date.parse('2026-10-02T04:00:00.000Z')),
    /PLAY_CONSOLE_READBACK_STALE/
  );
});

test('repository scan rejects forbidden reviewer identifiers outside gate fixtures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-play-gate-'));
  fs.mkdirSync(path.join(root, 'operations/google-play'), { recursive: true });
  fs.writeFileSync(path.join(root, 'operations/google-play/review-access-policy.json'), JSON.stringify(repoPolicy));
  fs.mkdirSync(path.join(root, 'apps/garage-link'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/garage-link/bad.txt'), 'old-user@review.invalid');
  assert.throws(() => scanRepositoryForForbiddenIdentifiers(repoPolicy, root), /FORBIDDEN_REVIEW_IDENTIFIER_FOUND/);
});
