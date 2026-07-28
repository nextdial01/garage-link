#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEST_DIR"' EXIT

run_case() {
  local mode="$1" marker="$TEST_DIR/$1.pass"
  (
    set -Eeuo pipefail
    # shellcheck source=scripts/operator/g7-password-env.sh
    source scripts/operator/g7-password-env.sh
    DB_PASSWORD='cleanup-fixture'
    export PGPASSWORD="$DB_PASSWORD"
    trap 'clear_g7_database_password; [[ -z "${DB_PASSWORD+x}" && -z "${PGPASSWORD+x}" ]] && printf PASS > "'"$marker"'"' EXIT
    if [[ "$mode" == abnormal ]]; then false; fi
  ) >/dev/null 2>&1 || true
  [[ "$(< "$marker")" == PASS ]]
}

run_case normal
run_case abnormal
printf 'G7_ONCE_PASSWORD_CLEANUP_PASS\n'
