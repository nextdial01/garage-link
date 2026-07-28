#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="/Users/ksk/garage-link-backups/pre-g7-20260728-104502"
PACKAGE="$APP_ROOT/docs/quality-audit/operator/g7-high-remediation/02-current-sql-editor-apply.sql"
COMPAT="$APP_ROOT/supabase/migrations/20260728000050_inventory_count_items_compatibility.sql"
ROLLBACK="$APP_ROOT/supabase/rollback/20260728000050_inventory_count_items_compatibility.down.sql"
CONTAINER="garage-link-g0b-g7compat-test-$$"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.136"
PASS_COUNT=0

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

psql_sql() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

query() {
  docker exec -i "$CONTAINER" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

expect_failure() {
  local expected="$1" file="$2" output code
  set +e
  output="$(psql_sql < "$file" 2>&1)"
  code=$?
  set -e
  if [[ $code -eq 0 || "$output" != *"$expected"* ]]; then
    printf 'FAIL expected=%s exit=%s\n%s\n' "$expected" "$code" "$output" >&2
    exit 1
  fi
}

restore_base() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres <<'SQL' >/dev/null
grant supabase_admin to postgres;
grant supabase_auth_admin to postgres;
do $$
declare event_row record;
begin
  for event_row in select evtname from pg_event_trigger where evtenabled<>'D' loop
    execute format('alter event trigger %I disable',event_row.evtname);
  end loop;
end $$;
SQL
  psql_sql -c 'drop schema if exists public cascade; drop schema if exists supabase_migrations cascade;' >/dev/null
  psql_sql < "$BACKUP_DIR/02-public-schema.sql" >/dev/null
  psql_sql < "$BACKUP_DIR/04-migration-schema.sql" >/dev/null
  { printf "begin; set local session_replication_role=replica;\n"; cat "$BACKUP_DIR/03-public-data.sql"; printf "\ncommit;\n"; } | psql_sql >/dev/null
  { printf "begin; set local session_replication_role=replica;\n"; cat "$BACKUP_DIR/05-migration-data.sql"; printf "\ncommit;\n"; } | psql_sql >/dev/null
  psql_sql <<'SQL' >/dev/null
insert into auth.users(id)
select distinct user_id from public.memberships where user_id is not null
on conflict(id) do nothing;
SQL
  [[ "$(query 'select count(*) from supabase_migrations.schema_migrations')" == "48" ]]
}

apply_compat_and_ledger() {
  psql_sql < "$COMPAT" >/dev/null
  psql_sql <<'SQL' >/dev/null
insert into supabase_migrations.schema_migrations(version,statements,name)
values('20260728000050',array['../migrations/20260728000050_inventory_count_items_compatibility.sql']::text[],'inventory_count_items_compatibility');
SQL
}

docker run -d --name "$CONTAINER" --network none -e POSTGRES_PASSWORD=local-only "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if [[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)" == "healthy" ]] \
     && docker exec "$CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1 \
     && [[ "$(docker exec -i "$CONTAINER" psql -X -Atq -U postgres -d postgres -c "select count(*) from pg_namespace where nspname in('auth','storage','extensions','realtime','vault','graphql')" 2>/dev/null || true)" == "6" ]]; then
    break
  fi
  sleep 1
done

# 1: Current state, both columns absent. One package applies compatibility + G7.
restore_base
psql_sql < "$PACKAGE" >/dev/null
[[ "$(query 'select count(*) from supabase_migrations.schema_migrations')" == "50" ]]
[[ "$(query "select count(*) from information_schema.columns where table_schema='public' and table_name='inventory_count_items' and column_name in('deleted_at','is_archived')")" == "2" ]]
PASS_COUNT=$((PASS_COUNT+1))

# 2: Correct compatibility already applied and ledger-aligned. G7 safely continues.
restore_base
apply_compat_and_ledger
psql_sql < "$PACKAGE" >/dev/null
[[ "$(query 'select count(*) from supabase_migrations.schema_migrations')" == "50" ]]
PASS_COUNT=$((PASS_COUNT+1))

# 3: Type mismatch is rejected before G7.
restore_base
psql_sql -c "alter table public.inventory_count_items add column deleted_at text, add column is_archived boolean default false; insert into supabase_migrations.schema_migrations(version,name) values('20260728000050','inventory_count_items_compatibility');" >/dev/null
expect_failure DB007_DELETED_AT_CONTRACT_MISMATCH "$PACKAGE"
[[ "$(query 'select count(*) from supabase_migrations.schema_migrations')" == "49" ]]
PASS_COUNT=$((PASS_COUNT+1))

# 4: Default mismatch is rejected before G7.
restore_base
psql_sql -c "alter table public.inventory_count_items add column deleted_at timestamptz, add column is_archived boolean default true; insert into supabase_migrations.schema_migrations(version,name) values('20260728000050','inventory_count_items_compatibility');" >/dev/null
expect_failure DB007_IS_ARCHIVED_CONTRACT_MISMATCH "$PACKAGE"
PASS_COUNT=$((PASS_COUNT+1))

# 5: Nullability mismatch is rejected before G7.
restore_base
psql_sql -c "alter table public.inventory_count_items add column deleted_at timestamptz, add column is_archived boolean not null default false; insert into supabase_migrations.schema_migrations(version,name) values('20260728000050','inventory_count_items_compatibility');" >/dev/null
expect_failure DB007_IS_ARCHIVED_CONTRACT_MISMATCH "$PACKAGE"
PASS_COUNT=$((PASS_COUNT+1))

# 6: Ledger drift is rejected.
restore_base
psql_sql -c "insert into supabase_migrations.schema_migrations(version,name) values('20990101000000','unexpected');" >/dev/null
expect_failure DB007_PRECHECK_LEDGER_DRIFT "$PACKAGE"
PASS_COUNT=$((PASS_COUNT+1))

# 7: Column-only state without ledger is rejected.
restore_base
psql_sql < "$COMPAT" >/dev/null
expect_failure DB007_COLUMNS_WITHOUT_LEDGER "$PACKAGE"
PASS_COUNT=$((PASS_COUNT+1))

# 8: A G7 DDL failure rolls back compatibility columns and both ledger writes.
restore_base
psql_sql <<'SQL' >/dev/null
create or replace function public.g7_test_reject_billing_table() returns event_trigger
language plpgsql set search_path=pg_catalog as $$
declare command record;
begin
  for command in select * from pg_event_trigger_ddl_commands() loop
    if command.object_identity='public.billing_sync_operations' then
      raise exception 'G7_TEST_INJECTED_FAILURE';
    end if;
  end loop;
end $$;
create event trigger g7_test_reject_billing_table on ddl_command_end execute function public.g7_test_reject_billing_table();
SQL
expect_failure G7_TEST_INJECTED_FAILURE "$PACKAGE"
[[ "$(query 'select count(*) from supabase_migrations.schema_migrations')" == "48" ]]
[[ "$(query "select count(*) from information_schema.columns where table_schema='public' and table_name='inventory_count_items' and column_name in('deleted_at','is_archived')")" == "0" ]]
[[ "$(query "select count(*) from pg_class where oid=to_regclass('public.billing_sync_operations')")" == "0" ]]
psql_sql -c 'drop event trigger g7_test_reject_billing_table; drop function public.g7_test_reject_billing_table();' >/dev/null
PASS_COUNT=$((PASS_COUNT+1))

# 9: Security-preserving rollback retains the required contract and G7 can reapply.
restore_base
apply_compat_and_ledger
psql_sql < "$ROLLBACK" >/dev/null
psql_sql < "$PACKAGE" >/dev/null
[[ "$(query 'select count(*) from supabase_migrations.schema_migrations')" == "50" ]]
PASS_COUNT=$((PASS_COUNT+1))

printf 'G7_COMPATIBILITY_PACKAGE_TESTS_PASS=%s\n' "$PASS_COUNT"
