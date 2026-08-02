#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
IMAGE="$(awk -F'"' '/^IMAGE=/{print $2;exit}' scripts/db/run-g0b-ci.sh)"
CONTAINER="garage-link-g0b-g7-operator-$RANDOM-$$"
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --pull=never --network none --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -d "$IMAGE" >/dev/null
for _ in $(seq 1 180); do
  if [[ "$(docker inspect "$CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null)" == healthy ]] \
    && docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
[[ "$(docker inspect "$CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')" == healthy ]]
node scripts/db/migration-runner.mjs apply --manifest supabase/baseline/manifest.json --container "$CONTAINER" --environment g0b-g7-operator --through 20260727000300 >/dev/null
IDENTITY_JSON="$(docker exec -i "$CONTAINER" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -v migration_version=20260728000100 < scripts/operator/sql/g7-current-identity.sql)"
printf '%s' "$IDENTITY_JSON" | node scripts/operator/verify-postgres-identity.mjs wmlpuzuskfiwdipluglz postgres 47 20260728000100 >/dev/null
LEDGER_BEFORE_IDENTITY_FAIL="$(docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -c 'select count(*) from supabase_migrations.schema_migrations')"
if printf '%s' "$IDENTITY_JSON" | node scripts/operator/verify-postgres-identity.mjs wmlpuzuskfiwdipluglz postgres 48 20260728000100 >/dev/null 2>&1; then
  printf 'identity mismatch unexpectedly passed\n' >&2
  exit 1
fi
LEDGER_AFTER_IDENTITY_FAIL="$(docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -c 'select count(*) from supabase_migrations.schema_migrations')"
[[ "$LEDGER_BEFORE_IDENTITY_FAIL" == 47 && "$LEDGER_AFTER_IDENTITY_FAIL" == 47 ]]
docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v expected_ledger=47 -v migration_version=20260728000100 < scripts/operator/sql/g7-current-precheck.sql >/dev/null
node scripts/db/migration-runner.mjs apply --manifest supabase/baseline/manifest.json --container "$CONTAINER" --environment g0b-g7-operator >/dev/null
MIGRATION_SHA="$(shasum -a 256 supabase/migrations/20260728000100_high_remediation_batch.sql | awk '{print $1}')"
docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v migration_version=20260728000100 -v migration_checksum="$MIGRATION_SHA" -v migration_file=../migrations/20260728000100_high_remediation_batch.sql -v expected_ledger_after=48 < scripts/operator/sql/g7-current-postcheck.sql >/dev/null
docker exec -i "$CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/operator/sql/g7-current-row-counts.sql >/dev/null
printf 'OPS007_LOCAL_SQL_PASS\n'
