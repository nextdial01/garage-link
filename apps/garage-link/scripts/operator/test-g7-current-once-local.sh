#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${G7_TEST_DEBUG:-0}" != 1 ]]; then set +x; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
IMAGE="$(awk -F'"' '/^IMAGE=/{print $2;exit}' scripts/db/run-g0b-ci.sh)"
SERVER="garage-link-g0b-g7-once-$RANDOM-$$"
NETWORK="g7-once-network-$RANDOM-$$"
mkdir -p /Users/ksk/garage-link-backups
TEST_DIR="$(mktemp -d /Users/ksk/garage-link-backups/.g7-once-test.XXXXXX)"
HOST="$SERVER"
PORT='5432'
USER='postgres'
DATABASE='postgres'
FIXTURE_PASSWORD='g7-fixture-password-only'
LOG="$TEST_DIR/client.log"

# shellcheck source=scripts/operator/g7-password-env.sh
source scripts/operator/g7-password-env.sh
cleanup() {
  clear_g7_database_password
  docker rm -f "$SERVER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  if [[ "${G7_KEEP_TEST_DIR:-0}" != 1 ]]; then rm -rf -- "$TEST_DIR"; else printf 'test artifacts: %s\n' "$TEST_DIR" >&2; fi
}
trap cleanup EXIT INT TERM
on_error() {
  if [[ -f "$LOG" ]]; then sed "s/${FIXTURE_PASSWORD}/[REDACTED]/g" "$LOG" >&2; fi
}
trap on_error ERR

docker network create --internal "$NETWORK" >/dev/null
docker run --pull=never --network none --name "$SERVER" -e "POSTGRES_PASSWORD=$FIXTURE_PASSWORD" -d "$IMAGE" >/dev/null
for _ in $(seq 1 180); do
  if [[ "$(docker inspect "$SERVER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null)" == healthy ]] \
    && docker exec "$SERVER" psql -X -w -Atq -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
[[ "$(docker inspect "$SERVER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')" == healthy ]]
node scripts/db/migration-runner.mjs apply --manifest supabase/baseline/manifest.json --container "$SERVER" --environment g0b-g7-operator --through 20260727000300 >/dev/null
docker network disconnect none "$SERVER"
docker network connect "$NETWORK" "$SERVER"

client() {
  docker run --rm --pull=never --network "$NETWORK" -e PGPASSWORD -e PGSSLMODE=disable \
    -v "$ROOT:/workspace:ro" -v "$TEST_DIR:/test" "$IMAGE" "$@"
}
psql_client() { client psql -X -w -h "$HOST" -p "$PORT" -U "$USER" -d "$DATABASE" "$@"; }

unset PGPASSWORD
if psql_client -Atq -c 'select 1' > "$LOG" 2>&1; then
  printf 'psql without password unexpectedly passed\n' >&2
  exit 1
fi
! grep -qi 'Password:' "$LOG"

export PGPASSWORD='intentionally-wrong-fixture'
if psql_client -Atq -c 'select 1' >> "$LOG" 2>&1; then
  printf 'psql with wrong password unexpectedly passed\n' >&2
  exit 1
fi
! grep -qi 'Password:' "$LOG"

DB_PASSWORD="$FIXTURE_PASSWORD"
export PGPASSWORD="$DB_PASSWORD"
unset DB_PASSWORD
[[ "$(psql_client -Atq -c 'select 1' 2>> "$LOG")" == 1 ]]
client pg_dump -w -h "$HOST" -p "$PORT" -U "$USER" -d "$DATABASE" --schema-only --no-owner --schema=public --file=/test/public-schema.sql 2>> "$LOG"
client pg_dump -w -h "$HOST" -p "$PORT" -U "$USER" -d "$DATABASE" --data-only --no-owner --schema=public --file=/test/public-data.sql 2>> "$LOG"
[[ -s "$TEST_DIR/public-schema.sql" && -s "$TEST_DIR/public-data.sql" ]]

IDENTITY_JSON="$(psql_client -Atq -v ON_ERROR_STOP=1 -v migration_version=20260728000100 -f /workspace/scripts/operator/sql/g7-current-identity.sql 2>> "$LOG")"
printf '%s' "$IDENTITY_JSON" | node scripts/operator/verify-postgres-identity.mjs wmlpuzuskfiwdipluglz postgres 47 20260728000100 >/dev/null
psql_client -v ON_ERROR_STOP=1 -v expected_ledger=47 -v migration_version=20260728000100 -f /workspace/scripts/operator/sql/g7-current-precheck.sql >/dev/null 2>> "$LOG"

{
  printf '%s\n' '\set ON_ERROR_STOP on' 'begin;' "set local lock_timeout='3s';" "set local statement_timeout='120s';" '\i /workspace/supabase/migrations/20260728000100_high_remediation_batch.sql'
  printf '%s\n' "insert into supabase_migrations.schema_migrations(version,statements,name) values ('20260728000100',array['../migrations/20260728000100_high_remediation_batch.sql']::text[],'high_remediation_batch');"
  printf '%s\n' "insert into supabase_migrations.migration_integrity(version,checksum,kind,environment,state,applied_at,updated_at) values ('20260728000100','5a24e58c397f585055fbe52242b8e45cc58dea1dcd9882e8ce81e00d93434166','incremental','g7_once_local','applied',clock_timestamp(),clock_timestamp());"
  printf '%s\n' "insert into supabase_migrations.migration_runs(version,operation,environment,status,started_at,finished_at) values ('20260728000100','apply','g7_once_local','succeeded',transaction_timestamp(),clock_timestamp());" 'commit;'
} > "$TEST_DIR/apply.sql"
psql_client -v ON_ERROR_STOP=1 -f /test/apply.sql >/dev/null 2>> "$LOG"
psql_client -v ON_ERROR_STOP=1 -v migration_version=20260728000100 -v migration_checksum=5a24e58c397f585055fbe52242b8e45cc58dea1dcd9882e8ce81e00d93434166 -v migration_file=../migrations/20260728000100_high_remediation_batch.sql -v expected_ledger_after=48 -f /workspace/scripts/operator/sql/g7-current-postcheck.sql >/dev/null 2>> "$LOG"
[[ "$(psql_client -Atq -c 'select count(*) from supabase_migrations.schema_migrations' 2>> "$LOG")" == 48 ]]

if grep -Fq "$FIXTURE_PASSWORD" "$LOG"; then
  printf 'fixture password appeared in command output\n' >&2
  exit 1
fi
! grep -qi 'Password:' "$LOG"
clear_g7_database_password
[[ -z "${DB_PASSWORD+x}" && -z "${PGPASSWORD+x}" ]]
printf 'G7_ONCE_REAL_PSQL_PGDUMP_PASS\n'
