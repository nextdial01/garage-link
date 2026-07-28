#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.136"
RUN_ID="${DB003_RUN_ID:-$PPID-$$}"
MANIFEST="$APP_ROOT/supabase/baseline/manifest.json"
ACTIVE_CONTAINER=""

cleanup() {
  if [[ -n "$ACTIVE_CONTAINER" ]]; then
    docker rm -f "$ACTIVE_CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

start_db() {
  local scenario="$1"
  local safe_scenario="${scenario//_/-}"
  ACTIVE_CONTAINER="garage-link-g0b-db003-${safe_scenario}-${RUN_ID}"
  docker run --pull=never --network none --name "$ACTIVE_CONTAINER" \
    -e POSTGRES_PASSWORD='db003-local-disposable-only' -d "$IMAGE" >/dev/null
  for _ in $(seq 1 180); do
    if [[ "$(docker inspect "$ACTIVE_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null)" == "healthy" ]] \
      && docker exec "$ACTIVE_CONTAINER" psql -X -Atq -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then return; fi
    sleep 1
  done
  echo "DB003_DATABASE_NOT_READY: $scenario" >&2
  exit 1
}

runner() {
  node "$APP_ROOT/scripts/db/migration-runner.mjs" "$@" --manifest "$MANIFEST"
}

psql_sql() {
  docker exec -i "$ACTIVE_CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q
}

finish_scenario() {
  docker rm -f "$ACTIVE_CONTAINER" >/dev/null
  ACTIVE_CONTAINER=""
}

run_success_scenario() {
  local scenario="$1" keep="$2"
  local environment="g0b-db003-${scenario//_/-}"
  echo "[db003] scenario=$scenario"
  start_db "$scenario"
  runner apply --container "$ACTIVE_CONTAINER" --environment "$environment" --through 20260725010000 >/dev/null
  for relation in payment_items trade_in_vehicles delivery_usage_logs delivery_overage_logs; do
    if [[ "$keep" != "all" && "$keep" != "$relation" ]]; then
      printf 'drop table if exists public.%s;\n' "$relation" | psql_sql
    fi
  done
  runner apply --container "$ACTIVE_CONTAINER" --environment "$environment" >/dev/null
  docker exec -i "$ACTIVE_CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
    -f - < "$APP_ROOT/supabase/tests/g1c_relation_contract_assertions.sql"
  runner apply --container "$ACTIVE_CONTAINER" --environment "$environment" >/dev/null
  finish_scenario
}

for scenario in absent payment_items trade_in_vehicles delivery_usage_logs delivery_overage_logs all; do
  run_success_scenario "$scenario" "$scenario"
done

echo '[db003] malformed required relation fails closed'
start_db malformed
runner apply --container "$ACTIVE_CONTAINER" --environment g0b-db003-malformed --through 20260725010000 >/dev/null
printf '%s\n' \
  'drop table public.payment_items;' \
  'drop table public.trade_in_vehicles;' \
  'drop table public.delivery_usage_logs;' \
  'drop table public.delivery_overage_logs;' | psql_sql
runner apply --container "$ACTIVE_CONTAINER" --environment g0b-db003-malformed --through 20260726000400 >/dev/null
printf '%s\n' \
  'create table public.payment_items(id uuid primary key);' | psql_sql
set +e
MALFORMED_OUTPUT="$(runner apply --container "$ACTIVE_CONTAINER" --environment g0b-db003-malformed 2>&1)"
MALFORMED_STATUS=$?
set -e
if [[ "$MALFORMED_STATUS" -eq 0 ]] || [[ "$MALFORMED_OUTPUT" != *'DB003_RELATION_SHAPE_MISMATCH'* ]]; then
  echo "DB003_MALFORMED_RELATION_NOT_REJECTED" >&2
  exit 1
fi
finish_scenario

echo 'DB003_RELATION_COMPATIBILITY_PASS'
