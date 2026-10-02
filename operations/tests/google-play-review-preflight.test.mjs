import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadPolicy,
  scanRepositoryForForbiddenIdentifiers,
  validateEvidence,
  validatePolicy,
  validateFixtureScopeChange,
  validateReviewWorkspace
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
    review_workspace: validWorkspace(),
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

function validWorkspace(overrides = {}) {
  const target = repoPolicy.review_workspace;
  return {
    source: 'final-build-ui-api-and-db-readback',
    scope_changed: false,
    fixture: { user_id: target.user_id, tenant_id: target.tenant_id, store_id: target.store_id, revoked: false, proof_length: 64, current_scope_verified: true },
    stores: [{ id: target.store_id, tenant_id: target.tenant_id, name: target.name }],
    current_user_active_store_id: target.store_id,
    preferences: [
      { id: 'review', tenant_id: target.tenant_id, active_store_id: target.store_id, updated_at: '2026-10-02T08:41:42Z' },
      { id: 'other', tenant_id: 'other-tenant', active_store_id: 'other-store', updated_at: '2026-09-14T01:57:34Z' }
    ],
    store_selection_status: 200, store_selection_409_count: 0,
    today_status: 200, today_store_id: target.store_id,
    major_screens: { today: true, vehicles: true, customers: true, maintenance: true, quotes: true },
    relogin_verified: true, flower_store_visible: false,
    unrelated_production_changes: 0, password_exposure: 0,
    ...overrides
  };
}

test('scope changes require NULL proof in the same bounded change', () => {
  const before = { user_id: 'review', tenant_id: 'old', store_id: 'old' };
  for (const after of [{ ...before, tenant_id: 'new' }, { ...before, store_id: 'new' }]) {
    assert.throws(() => validateFixtureScopeChange(before, { ...after, proof_is_null: false }), /FIXTURE_SCOPE_CHANGE_PROOF_NOT_RESET/);
    assert.equal(validateFixtureScopeChange(before, { ...after, proof_is_null: true }).scope_changed, true);
  }
  assert.throws(() => validateFixtureScopeChange(before, { ...before, user_id: 'another' }), /FIXTURE_CHANGE_USER_MISMATCH/);
});

test('cross-tenant preference newer than unchanged review preference blocks submission', () => {
  const ws = validWorkspace();
  ws.preferences[0].updated_at = '2026-09-10T10:44:16Z';
  // Same-store RPC returns changed=false and leaves this timestamp unchanged.
  assert.throws(() => validateReviewWorkspace(ws, repoPolicy), /REVIEW_PREFERENCE_NOT_CURRENT/);
  ws.preferences[0].updated_at = '2026-10-02T08:41:42Z';
  assert.equal(validateReviewWorkspace(ws, repoPolicy).review_workspace_verified, true);
});

test('missing workspace evidence cannot pass the final build gate', () => {
  assert.throws(() => validateEvidence(validEvidence({ review_workspace: undefined }), repoPolicy, Date.parse('2026-10-02T04:00:00Z')), /REVIEW_WORKSPACE_EVIDENCE_MISSING/);
});

for (const [name, override, code] of [
  ['foreign store alongside review', { stores: [...validWorkspace().stores, { id: 'other-store' }] }, 'REVIEW_STORE_NOT_EXCLUSIVE'],
  ['stale scope-bound proof', { fixture: { ...validWorkspace().fixture, current_scope_verified: false } }, 'REVIEW_PROOF_CURRENT_SCOPE_UNPROVEN'],
  ['NULL proof', { fixture: { ...validWorkspace().fixture, proof_length: null } }, 'REVIEW_PROOF_CURRENT_SCOPE_UNPROVEN'],
  ['selection not 200', { store_selection_status: 409 }, 'REVIEW_STORE_SELECTION_FAILED'],
  ['any selection conflict', { store_selection_409_count: 1 }, 'REVIEW_STORE_SELECTION_CONFLICT'],
  ['wrong current scope', { current_user_active_store_id: 'other-store' }, 'REVIEW_ACTIVE_STORE_MISMATCH'],
  ['today wrong scope', { today_store_id: 'other-store' }, 'REVIEW_TODAY_SCOPE_FAILED'],
  ['today not 200', { today_status: 500 }, 'REVIEW_TODAY_SCOPE_FAILED'],
  ['relogin absent', { relogin_verified: false }, 'REVIEW_RELOGIN_UNPROVEN'],
  ['foreign store visible', { flower_store_visible: true }, 'REVIEW_FOREIGN_STORE_VISIBLE'],
  ['unrelated mutation', { unrelated_production_changes: 1 }, 'REVIEW_SAFETY_GATE_FAILED'],
  ['secret exposure', { password_exposure: 1 }, 'REVIEW_SAFETY_GATE_FAILED']
]) test(`submission rejects ${name}`, () => {
  assert.throws(() => validateReviewWorkspace(validWorkspace(override), repoPolicy), new RegExp(code));
});

test('scope-change evidence rejects carrying proof across scopes', () => {
  const before = { user_id: 'review', tenant_id: 'old', store_id: 'old' };
  const after = { user_id: 'review', tenant_id: repoPolicy.review_workspace.tenant_id, store_id: repoPolicy.review_workspace.store_id, proof_is_null: false };
  assert.throws(() => validateReviewWorkspace(validWorkspace({ scope_changed: true, scope_change: { before, after } }), repoPolicy), /FIXTURE_SCOPE_CHANGE_PROOF_NOT_RESET/);
  after.proof_is_null = true;
  assert.equal(validateReviewWorkspace(validWorkspace({ scope_changed: true, scope_change: { before, after } }), repoPolicy).review_workspace_verified, true);
});

test('an absent scope-change audit fails closed', () => {
  assert.throws(() => validateReviewWorkspace(validWorkspace({ scope_changed: undefined }), repoPolicy), /REVIEW_SCOPE_CHANGE_AUDIT_MISSING/);
});

test('missing snapshot identity is not a valid bounded scope change', () => {
  assert.throws(() => validateFixtureScopeChange({}, {}), /FIXTURE_CHANGE_USER_MISMATCH/);
});

test('major screens and reviewer fixture identity are mandatory', () => {
  assert.throws(() => validateReviewWorkspace(validWorkspace({ major_screens: { today: true } }), repoPolicy), /REVIEW_MAJOR_SCREENS_UNPROVEN/);
  assert.throws(() => validateReviewWorkspace(validWorkspace({ fixture: { ...validWorkspace().fixture, user_id: 'another-user' } }), repoPolicy), /REVIEW_FIXTURE_USER_INVALID/);
});
