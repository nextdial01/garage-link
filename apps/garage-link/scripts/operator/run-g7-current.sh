#!/usr/bin/env bash
set -Eeuo pipefail
set +x

printf 'This runner is retired. Use run-g7-current-once.sh only.\n' >&2
exit 64

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SOURCE_EVIDENCE="$ROOT/docs/quality-audit/evidence/g7-high-remediation-preflight.json"
PROJECT_EVIDENCE="$ROOT/docs/quality-audit/evidence/c6-final-preflight.json"
MANIFEST="$ROOT/supabase/baseline/manifest.json"
MIGRATION="$ROOT/supabase/migrations/20260728000100_high_remediation_batch.sql"
PARSER="$ROOT/scripts/operator/parse-postgres-url.mjs"
IDENTITY_VERIFIER="$ROOT/scripts/operator/verify-postgres-identity.mjs"
EVIDENCE_WRITER="$ROOT/scripts/operator/g7-current-evidence.mjs"
BACKUP_MANIFEST_WRITER="$ROOT/scripts/operator/create-backup-manifest.mjs"
PRECHECK_SQL="$ROOT/scripts/operator/sql/g7-current-precheck.sql"
IDENTITY_SQL="$ROOT/scripts/operator/sql/g7-current-identity.sql"
POSTCHECK_SQL="$ROOT/scripts/operator/sql/g7-current-postcheck.sql"
CATALOG_SQL="$ROOT/scripts/operator/sql/g7-current-catalog.sql"
ROW_COUNTS_SQL="$ROOT/scripts/operator/sql/g7-current-row-counts.sql"
IMAGE="$(awk -F'"' '/^IMAGE=/{print $2;exit}' "$ROOT/scripts/db/run-g0b-ci.sh")"

CURRENT_STAGE="initialization"
FINALIZED=0
MIGRATION_APPLIED=0
BACKUP_COMPLETE=0
SECRET_DIR=""
BACKUP_DIR=""
RESTORE_CONTAINER=""
TEMP_DIR=""

export G7_PROJECT_REF=""
export G7_PROJECT_FINGERPRINT=""
export G7_HOST_MATCH=0
export G7_CONNECTION_KIND=""
export G7_BACKUP_DIR=""
export G7_BACKUP_STATUS=NOT_RUN
export G7_BACKUP_FILES=0
export G7_BACKUP_BYTES=0
export G7_BACKUP_SHA=""
export G7_BACKUP_VERIFIED=0
export G7_RESTORE_VERIFIED=0
export G7_PRECHECK_STATUS=NOT_RUN
export G7_PRECHECK_COUNT=0
export G7_MIGRATION_APPLIED=0
export G7_LEDGER_AFTER=48
export G7_MIGRATION_SECONDS=0
export G7_MAX_LOCK_SECONDS=""
export G7_UNEXPECTED_BACKFILL=0
export G7_UNEXPECTED_CHANGES=0
export G7_REGRESSION_STATUS=NOT_RUN
export G7_QUALITY_STATUS=NOT_RUN

cleanup_secrets() {
  set +e
  unset DB_URL PGPASSWORD DATABASE_URL SUPABASE_DB_PASSWORD
  if [[ -n "$RESTORE_CONTAINER" ]]; then docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true; fi
  if [[ -n "$SECRET_DIR" && -d "$SECRET_DIR" ]]; then
    find "$SECRET_DIR" -type f -exec chmod 600 {} \; >/dev/null 2>&1 || true
    rm -rf -- "$SECRET_DIR"
  fi
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then rm -rf -- "$TEMP_DIR"; fi
}

on_exit() {
  local code=$?
  trap - EXIT INT TERM
  cleanup_secrets
  if [[ $code -ne 0 && $FINALIZED -eq 0 ]]; then
    export G7_STAGE="$CURRENT_STAGE"
    export G7_MIGRATION_APPLIED="$MIGRATION_APPLIED"
    case "$CURRENT_STAGE" in
      connection_*|backup*) export G7_FAILURE_CLASS=operational_backup_access ;;
      single_read_only_precheck) export G7_FAILURE_CLASS=current_data_gate ;;
      migration_apply) export G7_FAILURE_CLASS=migration_gate ;;
      current_postcheck) export G7_FAILURE_CLASS=current_schema_gate ;;
      quality_regression) export G7_FAILURE_CLASS=regression_gate ;;
      *) export G7_FAILURE_CLASS=operator_runner_gate ;;
    esac
    if [[ $BACKUP_COMPLETE -eq 0 && -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
      printf 'INVALID: G7 runner stopped before backup Gate completed.\n' > "$BACKUP_DIR/INVALID"
      chmod 600 "$BACKUP_DIR/INVALID"
    fi
    node "$EVIDENCE_WRITER" blocked >/dev/null 2>&1 || true
  fi
  exit "$code"
}
trap on_exit EXIT INT TERM

fail() {
  printf 'G7 runner stopped safely at stage: %s\n' "$CURRENT_STAGE" >&2
  exit 1
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

json_value() {
  node -e "const v=require(process.argv[1]); const p=process.argv[2].split('.'); let x=v; for(const k of p)x=x[k]; process.stdout.write(String(x));" "$1" "$2"
}

static_check() {
  bash -n "$ROOT/scripts/operator/run-g7-current.sh"
  for file in "$SOURCE_EVIDENCE" "$PROJECT_EVIDENCE" "$MANIFEST" "$MIGRATION" "$PARSER" "$IDENTITY_VERIFIER" "$EVIDENCE_WRITER" "$BACKUP_MANIFEST_WRITER" "$IDENTITY_SQL" "$PRECHECK_SQL" "$POSTCHECK_SQL" "$CATALOG_SQL" "$ROW_COUNTS_SQL"; do
    [[ -s "$file" ]] || { printf 'missing required file: %s\n' "$file" >&2; exit 1; }
  done
  if grep -Eiq 'supabase[[:space:]]+(login|link|projects|db[[:space:]]+dump|db[[:space:]]+push)' "$ROOT/scripts/operator/run-g7-current.sh"; then
    printf 'forbidden Supabase management/CLI authentication path found\n' >&2
    exit 1
  fi
  if grep -Eiq '(^|[^[:alpha:]])(insert|update|delete|truncate|alter|drop|create|grant|revoke|call)[[:space:]]' "$PRECHECK_SQL"; then
    printf 'precheck contains a write-capable SQL token\n' >&2
    exit 1
  fi
  local migration_sha manifest_sha expected_sha manifest_entries manifest_match temp_test
  migration_sha="$(sha256_file "$MIGRATION")"
  expected_sha="$(json_value "$SOURCE_EVIDENCE" forwardMigration.checksum)"
  manifest_sha="$(sha256_file "$MANIFEST")"
  manifest_entries="$(json_value "$SOURCE_EVIDENCE" migrationManifest.entryCount)"
  manifest_match="$(json_value "$SOURCE_EVIDENCE" forwardMigration.manifestMatch)"
  [[ "$migration_sha" == "$expected_sha" && "$manifest_sha" == "$(json_value "$SOURCE_EVIDENCE" migrationManifest.sha256)" && "$manifest_entries" == 48 && "$manifest_match" == true ]] || exit 1
  temp_test="$(mktemp -d)"
  printf '%s' 'postgresql://postgres:test%3Apass@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require' | node "$PARSER" "$temp_test" abcdefghijklmnopqrst
  [[ -s "$temp_test/pgpass" && -s "$temp_test/connection-meta.json" ]]
  ! grep -q 'test:pass' "$temp_test/connection-meta.json"
  rm -rf -- "$temp_test"
  node "$ROOT/scripts/operator/test-g7-connection-identity.mjs" >/dev/null
  printf 'OPS007_STATIC_PASS\n'
}

if [[ "${1:-}" == "--static-check" ]]; then
  trap - EXIT INT TERM
  static_check
  exit 0
fi
if [[ $# -ne 0 ]]; then
  printf 'usage: bash scripts/operator/run-g7-current.sh\n' >&2
  exit 2
fi

CURRENT_STAGE="canonical_evidence"
pnpm evidence:g7 >/dev/null
G7_PROJECT_REF="$(json_value "$PROJECT_EVIDENCE" project.ref)"
G7_PROJECT_FINGERPRINT="$(json_value "$PROJECT_EVIDENCE" project.fingerprint)"
export G7_PROJECT_REF G7_PROJECT_FINGERPRINT
[[ "$(printf '%s' "$G7_PROJECT_REF" | shasum -a 256 | cut -c1-12)" == "$G7_PROJECT_FINGERPRINT" ]] || fail
[[ "$(json_value "$SOURCE_EVIDENCE" status)" == PASS ]] || fail
[[ "$(json_value "$SOURCE_EVIDENCE" forwardMigration.manifestMatch)" == true ]] || fail
[[ "$(sha256_file "$MIGRATION")" == "$(json_value "$SOURCE_EVIDENCE" forwardMigration.checksum)" ]] || fail
[[ "$(sha256_file "$MANIFEST")" == "$(json_value "$SOURCE_EVIDENCE" migrationManifest.sha256)" ]] || fail

MIGRATION_VERSION="$(json_value "$SOURCE_EVIDENCE" forwardMigration.version)"
MIGRATION_NAME="$(json_value "$SOURCE_EVIDENCE" forwardMigration.name)"
MIGRATION_CHECKSUM="$(json_value "$SOURCE_EVIDENCE" forwardMigration.checksum)"
MIGRATION_LEDGER_FILE="$(node -e "const m=require(process.argv[1]);const e=m.entries.find(x=>x.version===process.argv[2]);if(!e)process.exit(2);process.stdout.write(e.file);" "$MANIFEST" "$MIGRATION_VERSION")"
EXPECTED_LEDGER="$(json_value "$SOURCE_EVIDENCE" currentSupabase.ledger)"
[[ "$EXPECTED_LEDGER" == 48 && "$MIGRATION_VERSION" =~ ^[0-9]{14}$ && "$MIGRATION_NAME" =~ ^[a-z0-9_]+$ && "$MIGRATION_CHECKSUM" =~ ^[0-9a-f]{64}$ && "$MIGRATION_LEDGER_FILE" =~ ^\.\./migrations/[0-9a-z_]+\.sql$ ]] || fail

CURRENT_STAGE="connection_input"
printf 'GARAGE LINK Current PostgreSQL connection URL: ' >&2
IFS= read -r -s DB_URL
printf '\n' >&2
[[ -n "$DB_URL" ]] || fail

SECRET_DIR="$(mktemp -d)"
TEMP_DIR="$(mktemp -d)"
chmod 700 "$SECRET_DIR" "$TEMP_DIR"
URL_FILE="$SECRET_DIR/connection-url"
(umask 077; printf '%s' "$DB_URL" > "$URL_FILE")
unset DB_URL
CURRENT_STAGE="connection_identity"
node "$PARSER" "$SECRET_DIR" "$G7_PROJECT_REF" < "$URL_FILE" || fail
rm -f -- "$URL_FILE"
G7_HOST_MATCH=1
G7_CONNECTION_KIND="$(json_value "$SECRET_DIR/connection-meta.json" connectionKind)"
export G7_HOST_MATCH G7_CONNECTION_KIND

PGHOST_SAFE="$(json_value "$SECRET_DIR/connection-meta.json" host)"
PGPORT_SAFE="$(json_value "$SECRET_DIR/connection-meta.json" port)"
PGUSER_SAFE="$(json_value "$SECRET_DIR/connection-meta.json" user)"
PGDATABASE_SAFE="$(json_value "$SECRET_DIR/connection-meta.json" database)"

db_tool() {
  local mounts=(-v "$SECRET_DIR:/run/g7-secret:ro" -v "$ROOT:/workspace:ro" -v "$TEMP_DIR:/run/g7-temp")
  if [[ -n "$BACKUP_DIR" ]]; then mounts+=(-v "$BACKUP_DIR:/backup"); fi
  docker run --rm --pull=never --network bridge \
    -e "PGHOST=$PGHOST_SAFE" -e "PGPORT=$PGPORT_SAFE" -e "PGUSER=$PGUSER_SAFE" -e "PGDATABASE=$PGDATABASE_SAFE" \
    -e PGSSLMODE=require -e PGPASSFILE=/run/g7-secret/pgpass \
    "${mounts[@]}" \
    "$IMAGE" "$@"
}

DB_IDENTITY="$(db_tool psql -X -Atq -v ON_ERROR_STOP=1 -v migration_version="$MIGRATION_VERSION" -f /workspace/scripts/operator/sql/g7-current-identity.sql)" || fail
printf '%s' "$DB_IDENTITY" | node "$IDENTITY_VERIFIER" "$G7_PROJECT_REF" "$PGDATABASE_SAFE" "$EXPECTED_LEDGER" "$MIGRATION_VERSION" > "$TEMP_DIR/identity-pass.json" || fail
[[ "$(json_value "$TEMP_DIR/identity-pass.json" status)" == IDENTITY_PASS ]] || fail
unset DB_IDENTITY

CURRENT_STAGE="backup"
BACKUP_DIR="/Users/ksk/garage-link-backups/pre-g7-$(TZ=Asia/Tokyo date '+%Y%m%d-%H%M%S')"
G7_BACKUP_DIR="$BACKUP_DIR"
export G7_BACKUP_DIR
[[ ! -e "$BACKUP_DIR" ]] || fail
mkdir "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
G7_BACKUP_STATUS=RUNNING
export G7_BACKUP_STATUS

db_tool pg_dumpall --roles-only --no-role-passwords --file=/backup/01-roles.sql || fail
db_tool pg_dump --schema-only --no-owner --schema=public --file=/backup/02-public-schema.sql || fail
db_tool pg_dump --data-only --no-owner --schema=public --file=/backup/03-public-data.sql || fail
db_tool pg_dump --schema-only --no-owner --schema=supabase_migrations --file=/backup/04-migration-schema.sql || fail
db_tool pg_dump --data-only --no-owner --schema=supabase_migrations --file=/backup/05-migration-data.sql || fail
db_tool pg_dump --schema-only --no-owner --schema=auth --schema=storage --file=/backup/06-auth-storage-schema.sql || fail
db_tool pg_dump --data-only --no-owner --schema=auth --schema=storage --file=/backup/07-auth-storage-data.sql || fail
db_tool psql -X -Atq -v ON_ERROR_STOP=1 -f /workspace/scripts/operator/sql/g7-current-catalog.sql -o /backup/08-catalog-snapshot.txt || fail

chmod 600 "$BACKUP_DIR"/*
for required in 01-roles.sql 02-public-schema.sql 03-public-data.sql 04-migration-schema.sql 05-migration-data.sql 06-auth-storage-schema.sql 07-auth-storage-data.sql 08-catalog-snapshot.txt; do
  [[ -s "$BACKUP_DIR/$required" ]] || fail
done
node "$BACKUP_MANIFEST_WRITER" "$BACKUP_DIR" "$G7_PROJECT_FINGERPRINT" "$(json_value "$SOURCE_EVIDENCE" snapshotFingerprint)" "$EXPECTED_LEDGER" || fail
chmod 600 "$BACKUP_DIR/00-backup-manifest.json"
(cd "$BACKUP_DIR" && shasum -a 256 00-backup-manifest.json 0[1-8]-* > SHA256SUMS.txt)
chmod 600 "$BACKUP_DIR/SHA256SUMS.txt"
(cd "$BACKUP_DIR" && shasum -a 256 -c SHA256SUMS.txt >/dev/null) || fail
[[ "$(stat -f '%Lp' "$BACKUP_DIR")" == 700 ]] || fail
if find "$BACKUP_DIR" -type f ! -perm 600 -print -quit | grep -q .; then fail; fi

G7_BACKUP_FILES="$(find "$BACKUP_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')"
G7_BACKUP_BYTES="$(find "$BACKUP_DIR" -maxdepth 1 -type f -exec stat -f '%z' {} \; | awk '{s+=$1} END{print s+0}')"
G7_BACKUP_SHA="$(sha256_file "$BACKUP_DIR/SHA256SUMS.txt")"
G7_BACKUP_STATUS=PASS
G7_BACKUP_VERIFIED=1
export G7_BACKUP_FILES G7_BACKUP_BYTES G7_BACKUP_SHA G7_BACKUP_STATUS G7_BACKUP_VERIFIED

CURRENT_STAGE="backup_restore_check"
RESTORE_CONTAINER="garage-link-g7-restore-$(date +%s)-$$"
docker run -d --pull=never --network none --name "$RESTORE_CONTAINER" -e POSTGRES_PASSWORD=local_g7_restore -v "$BACKUP_DIR:/backup:ro" "$IMAGE" >/dev/null || fail
for _ in $(seq 1 180); do
  RESTORE_HEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$RESTORE_CONTAINER" 2>/dev/null || true)"
  if [[ "$RESTORE_HEALTH" == healthy ]] && docker exec "$RESTORE_CONTAINER" psql -X -U postgres -d postgres -Atq -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
[[ "${RESTORE_HEALTH:-}" == healthy ]] || fail
docker exec "$RESTORE_CONTAINER" psql -X -U postgres -d postgres -Atq -c 'select 1' >/dev/null 2>&1 || fail
docker exec -i "$RESTORE_CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists supabase_migrations cascade;' >/dev/null || fail
for restore_file in 06-auth-storage-schema.sql 02-public-schema.sql 04-migration-schema.sql 07-auth-storage-data.sql 03-public-data.sql 05-migration-data.sql; do
  docker exec -i "$RESTORE_CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f "/backup/$restore_file" >/dev/null || fail
done
RESTORED_LEDGER="$(docker exec "$RESTORE_CONTAINER" psql -X -U postgres -d postgres -Atq -c 'select count(*) from supabase_migrations.schema_migrations')" || fail
[[ "$RESTORED_LEDGER" == "$EXPECTED_LEDGER" ]] || fail
docker rm -f "$RESTORE_CONTAINER" >/dev/null
RESTORE_CONTAINER=""
G7_RESTORE_VERIFIED=1
BACKUP_COMPLETE=1
export G7_RESTORE_VERIFIED

CURRENT_STAGE="single_read_only_precheck"
db_tool psql -X -v ON_ERROR_STOP=1 -v expected_ledger="$EXPECTED_LEDGER" -v migration_version="$MIGRATION_VERSION" -f /workspace/scripts/operator/sql/g7-current-precheck.sql -o /run/g7-temp/precheck.txt || fail
G7_PRECHECK_STATUS=PASS
G7_PRECHECK_COUNT=1
export G7_PRECHECK_STATUS G7_PRECHECK_COUNT
db_tool psql -X -Atq -v ON_ERROR_STOP=1 -f /workspace/scripts/operator/sql/g7-current-row-counts.sql -o /run/g7-temp/row-counts-before.txt || fail

CURRENT_STAGE="migration_apply"
cat > "$SECRET_DIR/apply-g7.sql" <<SQL
\\set ON_ERROR_STOP on
begin;
set local lock_timeout='3s';
set local statement_timeout='120s';
\\i /workspace/supabase/migrations/20260728000100_high_remediation_batch.sql
insert into supabase_migrations.schema_migrations(version,statements,name)
values ('$MIGRATION_VERSION',array['$MIGRATION_LEDGER_FILE']::text[],'$MIGRATION_NAME');
insert into supabase_migrations.migration_integrity(version,checksum,kind,environment,state,applied_at,updated_at)
values ('$MIGRATION_VERSION','$MIGRATION_CHECKSUM','incremental','current_controlled_test','applied',clock_timestamp(),clock_timestamp());
insert into supabase_migrations.migration_runs(version,operation,environment,status,started_at,finished_at)
values ('$MIGRATION_VERSION','apply','current_controlled_test','succeeded',transaction_timestamp(),clock_timestamp());
commit;
SQL
chmod 600 "$SECRET_DIR/apply-g7.sql"
MIGRATION_START="$(date +%s)"
db_tool psql -X -v ON_ERROR_STOP=1 -f /run/g7-secret/apply-g7.sql >/dev/null || fail
MIGRATION_END="$(date +%s)"
MIGRATION_APPLIED=1
G7_MIGRATION_APPLIED=1
G7_MIGRATION_SECONDS="$((MIGRATION_END-MIGRATION_START))"
G7_MAX_LOCK_SECONDS='<3'
export G7_MIGRATION_APPLIED G7_MIGRATION_SECONDS G7_MAX_LOCK_SECONDS

CURRENT_STAGE="current_postcheck"
db_tool psql -X -v ON_ERROR_STOP=1 -v migration_version="$MIGRATION_VERSION" -v migration_checksum="$MIGRATION_CHECKSUM" -v migration_file="$MIGRATION_LEDGER_FILE" -v expected_ledger_after=49 -f /workspace/scripts/operator/sql/g7-current-postcheck.sql -o /run/g7-temp/postcheck.txt || fail
G7_LEDGER_AFTER="$(db_tool psql -X -Atq -v ON_ERROR_STOP=1 -c 'select count(*) from supabase_migrations.schema_migrations')" || fail
[[ "$G7_LEDGER_AFTER" == 49 ]] || fail
export G7_LEDGER_AFTER
db_tool psql -X -Atq -v ON_ERROR_STOP=1 -f /workspace/scripts/operator/sql/g7-current-row-counts.sql -o /run/g7-temp/row-counts-after.txt || fail
diff -u "$TEMP_DIR/row-counts-before.txt" "$TEMP_DIR/row-counts-after.txt" >/dev/null || fail
G7_UNEXPECTED_CHANGES=0
G7_UNEXPECTED_BACKFILL=0
G7_REGRESSION_STATUS=PASS
export G7_UNEXPECTED_CHANGES G7_UNEXPECTED_BACKFILL G7_REGRESSION_STATUS

cleanup_secrets
SECRET_DIR=""

CURRENT_STAGE="quality_regression"
pnpm test:db:fresh
pnpm test:security
pnpm test:api:g0b
pnpm test:line-link-s2s
pnpm test:l-link-inquiry-s2s
pnpm test:line-link-s2s-ack
pnpm test:inquiry-response-management
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e:local-chrome
G7_QUALITY_STATUS=PASS
export G7_QUALITY_STATUS

CURRENT_STAGE="complete"
export G7_STAGE="$CURRENT_STAGE"
node "$EVIDENCE_WRITER" success
FINALIZED=1
printf 'G7_CURRENT_PASS staging deploy may proceed only after separate operator approval.\n'
