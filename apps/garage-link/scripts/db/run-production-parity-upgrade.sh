#!/usr/bin/env bash
set -euo pipefail

# Reproduces the exact production gap discovered on 2026-08-02 (public.tenant_subscriptions
# missing from production's real incremental history, unlike a from-scratch fresh baseline
# build) and verifies 20260731000300 (guarded) -> 20260801000100 -> 20260802000100 apply
# cleanly against it. This is narrower than run-g0b-ci.sh's upgrade path (which cuts over
# at 20260725010000 for a different, earlier drift scenario) - this one cuts over at
# 20260731000200, matching what is actually already applied on production today.

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.136"
RUN_ID="${G0B_RUN_ID:-$PPID-$$}"
PARITY="garage-link-g0b-parity-$RUN_ID"
MANIFEST="$APP_ROOT/supabase/baseline/manifest.json"

cleanup() {
  docker rm -f "$PARITY" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

start_db() {
  local name="$1"
  docker run --pull=never --network none --name "$name" \
    -e POSTGRES_PASSWORD='g0b-local-disposable-only' -d "$IMAGE" >/dev/null
  for _ in $(seq 1 180); do
    if [[ "$(docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null)" == "healthy" ]] \
      && docker exec "$name" psql -X -Atq -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then return; fi
    sleep 1
  done
  echo "database did not become ready: $name" >&2
  exit 1
}

psql_file() {
  local name="$1" file="$2"
  docker exec -i "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "set app.g0b_fixture='enabled'; set lock_timeout='3s'; set statement_timeout='120s';" \
    -f - < "$file"
}

runner() {
  node "$APP_ROOT/scripts/db/migration-runner.mjs" "$@" --manifest "$MANIFEST"
}

echo '[production-parity] build through 20260731000200 (matches what is live on production today)'
start_db "$PARITY"
runner apply --container "$PARITY" --environment g0b-parity --through 20260731000200

echo '[production-parity] simulate the production gap'
psql_file "$PARITY" "$APP_ROOT/supabase/tests/production_parity_tenant_subscriptions_fixture.sql"

echo '[production-parity] apply 20260731000300 (guarded) -> 20260801000100 -> 20260802000100'
runner apply --container "$PARITY" --environment g0b-parity

echo '[production-parity] postcheck'
# Not g0b_catalog_assertions.sql here: its table-count assertion (75) assumes the full
# fresh-baseline table set, which this fixture deliberately does not have (tenant_subscriptions
# is dropped). production_parity_upgrade_assertions.sql covers the equivalent security
# invariants (anon/PUBLIC exclusions) plus the specific grants this range must produce.
psql_file "$PARITY" "$APP_ROOT/supabase/tests/production_parity_upgrade_assertions.sql"

echo '[production-parity] PASS'
