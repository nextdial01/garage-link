#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
TEST_TMP="$(mktemp -d)"
cleanup() { rm -rf -- "$TEST_TMP"; }
trap cleanup EXIT
mkdir "$TEST_TMP/runtime"
chmod 700 "$TEST_TMP/runtime"

if printf '%s\n' 'malformed-uri-fixture' | TMPDIR="$TEST_TMP/runtime" bash scripts/operator/run-g7-current.sh > "$TEST_TMP/stdout" 2> "$TEST_TMP/stderr"; then
  printf 'malformed URI unexpectedly passed runner identity Gate\n' >&2
  exit 1
fi
if find "$TEST_TMP/runtime" -type f \( -name pgpass -o -name connection-url -o -name connection-meta.json -o -name apply-g7.sql \) -print -quit | grep -q .; then
  printf 'runner left temporary credential material after identity failure\n' >&2
  exit 1
fi
if grep -q 'malformed-uri-fixture' "$TEST_TMP/stdout" "$TEST_TMP/stderr"; then
  printf 'runner emitted URI fixture\n' >&2
  exit 1
fi
node - <<'NODE'
const evidence = require('./docs/quality-audit/evidence/g7-current-migration-result.json');
if (evidence.stoppedAt !== 'connection_identity') process.exit(1);
if (evidence.migration.appliedCount !== 0 || evidence.migration.unexpectedBusinessDataChanges !== 0) process.exit(1);
NODE
printf 'OPS007_SECRET_CLEANUP_PASS\n'
