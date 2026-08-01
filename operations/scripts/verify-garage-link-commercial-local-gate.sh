#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNNER="$ROOT/operations/scripts/run-garage-link-commercial-gate.sh"
SPEC_REVIEW="$ROOT/operations/reviews/garage-link-commercial-local-spec-review.md"
SECURITY_REVIEW="$ROOT/operations/reviews/garage-link-commercial-local-standards-security-review.md"
REVIEW_SCOPE="$ROOT/operations/commercial/review-scope.sha256"
BASE_SHA='c92d799a2dce9af423b65fc13b312965efc34aa1'
HEAD_SHA=''

fail() { printf '%s\n' "$1" >&2; exit 2; }
test -x "$RUNNER" || fail 'RUNNER_NOT_EXECUTABLE'
bash -n "$RUNNER"
bash -n "$0"
node --check "$ROOT/operations/scripts/build-garage-link-local-bundle.mjs"
node --check "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs"
node --check "$ROOT/operations/tests/scan-garage-link-commercial-changes.mjs"
node "$ROOT/operations/tests/verify-garage-link-commercial-contract.mjs" "$ROOT"

if [[ "${GARAGE_LINK_GATE_ALLOW_DIRTY:-0}" != '1' ]]; then
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || fail 'WORKTREE_NOT_CLEAN'
  HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
  [[ "$HEAD_SHA" =~ ^[0-9a-f]{40}$ && "$HEAD_SHA" != "$BASE_SHA" ]] || fail 'FIXED_COMMIT_MISSING'
fi

verify_review_binding() {
  [[ -f "$SPEC_REVIEW" && -f "$SECURITY_REVIEW" && -f "$REVIEW_SCOPE" ]] || fail 'INDEPENDENT_REVIEW_MISSING'
  (cd "$ROOT" && shasum -a 256 -c "${REVIEW_SCOPE#$ROOT/}") >/dev/null || fail 'REVIEW_SCOPE_DRIFT'
  REVIEW_SCOPE_SHA="$(shasum -a 256 "$REVIEW_SCOPE" | awk '{print $1}')"
  rg -q "^Scope-Manifest-SHA256: $REVIEW_SCOPE_SHA$" "$SPEC_REVIEW" || fail 'SPEC_REVIEW_SCOPE_MISMATCH'
  rg -q '^Final: PASS$' "$SPEC_REVIEW" || fail 'SPEC_REVIEW_NOT_PASS'
  rg -q '^Critical: 0$' "$SPEC_REVIEW" || fail 'SPEC_REVIEW_CRITICAL_NONZERO'
  rg -q '^High: 0$' "$SPEC_REVIEW" || fail 'SPEC_REVIEW_HIGH_NONZERO'
  rg -q "^Scope-Manifest-SHA256: $REVIEW_SCOPE_SHA$" "$SECURITY_REVIEW" || fail 'STANDARDS_SECURITY_REVIEW_SCOPE_MISMATCH'
  rg -q '^Final: PASS$' "$SECURITY_REVIEW" || fail 'STANDARDS_SECURITY_REVIEW_NOT_PASS'
  rg -q '^Critical: 0$' "$SECURITY_REVIEW" || fail 'STANDARDS_SECURITY_REVIEW_CRITICAL_NONZERO'
  rg -q '^High: 0$' "$SECURITY_REVIEW" || fail 'STANDARDS_SECURITY_REVIEW_HIGH_NONZERO'
}

INCOMPLETE_PATTERN='TO''DO|NOT_''IMPLEMENTED|PLACE''HOLDER'
if rg -n -i "$INCOMPLETE_PATTERN" "$ROOT/operations/scripts" "$ROOT/operations/tests" "$ROOT/operations/commercial"; then
  fail 'INCOMPLETE_EXECUTOR_MARKER_FOUND'
fi

"$RUNNER" --self-test
node "$ROOT/packages/billing/scripts/generate-garage-commercial-contract.mjs" --check
pnpm --dir "$ROOT" --filter @apps/garage-link lint
pnpm --dir "$ROOT" --filter @apps/garage-link typecheck
pnpm --dir "$ROOT" --filter @apps/garage-link test:db:runner
pnpm --dir "$ROOT" --filter @apps/garage-link test:db:g1c-contract
pnpm --dir "$ROOT" --filter @apps/garage-link test:security
NEXT_PUBLIC_SUPABASE_URL='https://dummy-project.supabase.co' \
NEXT_PUBLIC_SUPABASE_ANON_KEY='garage-commercial-build-only' \
pnpm --dir "$ROOT" --filter @apps/garage-link build
node "$ROOT/operations/tests/scan-garage-link-commercial-changes.mjs" "$ROOT"

if [[ "${GARAGE_LINK_GATE_DEVELOPMENT:-0}" != '1' ]]; then
  verify_review_binding
fi

if [[ "${GARAGE_LINK_GATE_ALLOW_DIRTY:-0}" != '1' ]]; then
  verify_review_binding
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || fail 'WORKTREE_DIRTY_AFTER_GATE'
  [[ "$(git -C "$ROOT" rev-parse HEAD)" == "$HEAD_SHA" ]] || fail 'HEAD_CHANGED_DURING_GATE'
fi

printf '%s\n' \
  'PHASE_A_EXECUTORS=PASS' \
  'INCOMPLETE_MARKERS=0' \
  'DISPOSABLE_LOCAL_DB=PASS' \
  'FINGERPRINT_REJECTION=PASS' \
  'PRIVILEGE_REJECTION=PASS' \
  'PROVIDER_REJECTION=PASS' \
  'ROLLBACK_RESUME=PASS' \
  'MIGRATION_FRESH_UPGRADE_ROLLBACK_REAPPLY=PASS' \
  'SCHEMA_DRIFT=PASS' \
  'PRICING_DRIFT=PASS' \
  'LINT_TYPECHECK_UNIT_INTEGRATION_SECURITY_BUILD=PASS' \
  'SECRET_PII_SCAN=PASS' \
  'CRITICAL=0' \
  'HIGH=0' \
  'LOCAL_COMMERCIAL_COMPLETION_GATE_PASS'
