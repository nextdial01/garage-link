#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.136"
RUN_ID="${G0B_RUN_ID:-$PPID-$$}"
FRESH="garage-link-g0b-fresh-$RUN_ID"
UPGRADE="garage-link-g0b-upgrade-$RUN_ID"
RESTORE="garage-link-g0b-restore-$RUN_ID"
OVERHAUL_FRESH="garage-link-g0b-overhaul-fresh-$RUN_ID"
OVERHAUL_UPGRADE="garage-link-g0b-overhaul-upgrade-$RUN_ID"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/garage-link-g0b.XXXXXX")"
MANIFEST="$APP_ROOT/supabase/baseline/manifest.json"
EXPECTED_LEDGER_COUNT="$(jq '.entries | length' "$MANIFEST")"

cleanup() {
  docker rm -f "$FRESH" "$UPGRADE" "$RESTORE" "$OVERHAUL_FRESH" "$OVERHAUL_UPGRADE" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

start_db() {
  local name="$1"
  docker run --pull=never --network none --name "$name" \
    -e POSTGRES_PASSWORD='g0b-local-disposable-only' -d "$IMAGE" >/dev/null
  bash "$APP_ROOT/scripts/db/wait-supabase-ready.sh" "$name"
}

psql_file() {
  local name="$1" file="$2"
  docker exec -i "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "set app.g0b_fixture='enabled'; set app.g0b_expected_ledger_count='$EXPECTED_LEDGER_COUNT'; set lock_timeout='3s'; set statement_timeout='120s';" \
    -f - < "$file"
}

runner() {
  node "$APP_ROOT/scripts/db/migration-runner.mjs" "$@" --manifest "$MANIFEST"
}

assert_zero() {
  local name="$1" sql="$2" label="$3" value
  value="$(docker exec "$name" psql -X -Atq -U postgres -d postgres -c "$sql")"
  if [[ "$value" != "0" ]]; then echo "$label expected 0, got $value" >&2; exit 1; fi
}

echo '[g0b] fresh baseline'
start_db "$FRESH"
runner apply --container "$FRESH" --environment g0b-ci-fresh
runner apply --container "$FRESH" --environment g0b-ci-fresh
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1a_fixture.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g3_fixture.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g0b_catalog_assertions.sql"
assert_zero "$FRESH" "select count(*) from pg_namespace where nspname='qa_internal'" 'production lane qa schema'
assert_zero "$FRESH" "select count(*) from pg_proc where proname like 'qa_lifecycle_%'" 'production lane qa functions'
assert_zero "$FRESH" "select count(*) from pg_proc where proname like 'qa_owner_preview_%'" 'production lane owner preview functions'
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g0b_extension_compatibility_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1d_active_store_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/db005_store_eligibility_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/db006_canonical_owner_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1b_role_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g3_sale_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g4a_accounting_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g4b_fixture.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g4b_delivered_sale_correction_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1c_tenant_integrity_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1c_relation_contract_assertions.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g7_high_remediation_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/release_blocker_batch_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/commercial_remediation_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/commercial_remediation_batch_1b_regression.sql"
"$APP_ROOT/scripts/db/run-g1d-concurrency.sh" "$FRESH"
"$APP_ROOT/scripts/db/run-g1d-process-kill.sh" "$FRESH"
"$APP_ROOT/scripts/db/run-g4a-concurrency.sh" "$FRESH"
"$APP_ROOT/scripts/db/run-g4a-process-kill.sh" "$FRESH"
bash "$APP_ROOT/scripts/db/run-g4b-concurrency.sh" "$FRESH"
bash "$APP_ROOT/scripts/db/run-g4b-process-kill.sh" "$FRESH"
bash "$APP_ROOT/scripts/db/run-g7-concurrency.sh" "$FRESH"
bash "$APP_ROOT/scripts/db/run-g7-process-kill.sh" "$FRESH"

echo '[g0b] security-preserving rollback and reapply'
runner rollback --container "$FRESH" --environment g0b-ci-fresh
assert_zero "$FRESH" "select count(*) from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and table_name='memberships' and privilege_type in ('INSERT','UPDATE','DELETE')" 'membership writes after rollback'
assert_zero "$FRESH" "select count(*) from information_schema.routine_privileges where grantee='authenticated' and routine_schema='public' and routine_name in ('reserve_vehicle_sale','cancel_vehicle_sale','complete_vehicle_delivery')" 'sale RPC execute after rollback'
assert_zero "$FRESH" "select count(*) where to_regprocedure('public.guard_scope_columns_immutable()') is null or to_regclass('public.line_link_connections') is null" 'G1-C guards after rollback'
assert_zero "$FRESH" "select count(*) from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema='public' and table_name in ('membership_store_assignments','user_active_store_preferences') and privilege_type in ('INSERT','UPDATE','DELETE')" 'G1-D direct writes after rollback'
assert_zero "$FRESH" "select count(*) where to_regprocedure('public.switch_active_garage_store(uuid,uuid,text)') is null" 'G1-D safe switch after rollback'
assert_zero "$FRESH" "select count(*) from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema='public' and table_name='invoice_payment_ledger' and privilege_type in ('INSERT','UPDATE','DELETE')" 'G4-A ledger writes after rollback'
assert_zero "$FRESH" "select count(*) from information_schema.routine_privileges where grantee='authenticated' and routine_schema='public' and routine_name in ('issue_garage_invoice','void_garage_invoice','record_garage_payment','record_garage_payment_reversal')" 'G4-A RPC execute after rollback'
assert_zero "$FRESH" "select count(*) where to_regprocedure('public.guard_payment_ledger_append_only()') is null or to_regprocedure('public.guard_invoice_accounting_state()') is null" 'G4-A guards after rollback'
assert_zero "$FRESH" "select count(*) from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema='public' and table_name in ('sale_correction_cases','sale_correction_operations','sale_correction_events','customer_vehicle_ownership_history','sale_correction_refunds') and privilege_type in ('INSERT','UPDATE','DELETE')" 'G4-B direct writes after rollback'
assert_zero "$FRESH" "select count(*) from information_schema.routine_privileges where grantee='authenticated' and routine_schema='public' and routine_name in ('create_sale_correction_case','transition_sale_correction_case','record_sale_correction_refund','complete_sale_correction_inspection','resolve_sale_correction_ownership','confirm_sale_correction_restock','resolve_sale_correction_external_procedure')" 'G4-B RPC execute after rollback'
runner apply --container "$FRESH" --environment g0b-ci-fresh
assert_zero "$FRESH" "select count(*) from pg_namespace where nspname='qa_internal'" 'production reapply qa schema'
assert_zero "$FRESH" "select count(*) from pg_proc where proname like 'qa_lifecycle_%'" 'production reapply qa functions'
assert_zero "$FRESH" "select count(*) from pg_proc where proname like 'qa_owner_preview_%'" 'production reapply owner preview functions'
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1d_active_store_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/db005_store_eligibility_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/db006_canonical_owner_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1b_role_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g3_sale_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g4a_accounting_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g4b_fixture.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g4b_delivered_sale_correction_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1c_tenant_integrity_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g1c_relation_contract_assertions.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/g7_high_remediation_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/release_blocker_batch_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/commercial_remediation_regression.sql"
psql_file "$FRESH" "$APP_ROOT/supabase/tests/commercial_remediation_batch_1b_regression.sql"

echo '[g0b] upgrade path'
start_db "$UPGRADE"
runner apply --container "$UPGRADE" --environment g0b-ci-upgrade --through 20260725010000
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g1c_current_relation_drift_fixture.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g0b_upgrade_fixture.sql"
runner apply --container "$UPGRADE" --environment g0b-ci-upgrade
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g0b_upgrade_assertions.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g0b_catalog_assertions.sql"
assert_zero "$UPGRADE" "select count(*) from pg_namespace where nspname='qa_internal'" 'production upgrade qa schema'
assert_zero "$UPGRADE" "select count(*) from pg_proc where proname like 'qa_lifecycle_%'" 'production upgrade qa functions'
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g1c_relation_contract_assertions.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g1a_fixture.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g1d_active_store_regression.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/g7_high_remediation_regression.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/release_blocker_batch_regression.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/commercial_remediation_regression.sql"
psql_file "$UPGRADE" "$APP_ROOT/supabase/tests/commercial_remediation_batch_1b_regression.sql"

echo '[g0b] backup and restore integrity'
docker exec "$FRESH" pg_dump -U supabase_admin -d postgres -Fc -n public -n supabase_migrations > "$TMP_DIR/app.dump"
docker exec "$FRESH" pg_dump -U supabase_admin -d postgres --data-only -t auth.users > "$TMP_DIR/auth.sql"
start_db "$RESTORE"
docker exec -i "$RESTORE" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < "$TMP_DIR/auth.sql"
docker exec "$RESTORE" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'drop schema public cascade; drop schema if exists supabase_migrations cascade;'
docker exec -i "$RESTORE" pg_restore -U supabase_admin -d postgres --exit-on-error < "$TMP_DIR/app.dump"
docker exec "$RESTORE" psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'grant usage on schema public to public;'
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g0b_catalog_assertions.sql"
assert_zero "$RESTORE" "select count(*) from pg_namespace where nspname='qa_internal'" 'production restore qa schema'
assert_zero "$RESTORE" "select count(*) from pg_proc where proname like 'qa_lifecycle_%'" 'production restore qa functions'
assert_zero "$RESTORE" "select count(*) from pg_proc where proname like 'qa_owner_preview_%'" 'production restore owner preview functions'
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g1d_active_store_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/db005_store_eligibility_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g1b_role_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g3_sale_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g4a_accounting_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g4b_fixture.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g4b_delivered_sale_correction_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g1c_tenant_integrity_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g1c_relation_contract_assertions.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/g7_high_remediation_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/release_blocker_batch_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/commercial_remediation_regression.sql"
psql_file "$RESTORE" "$APP_ROOT/supabase/tests/commercial_remediation_batch_1b_regression.sql"

for name in "$FRESH" "$RESTORE"; do
  docker exec "$name" psql -X -Atq -U postgres -d postgres -f - < "$APP_ROOT/supabase/tests/g0b_catalog_fingerprint.sql" > "$TMP_DIR/${name}.fingerprint"
done
diff -u "$TMP_DIR/${FRESH}.fingerprint" "$TMP_DIR/${RESTORE}.fingerprint"

# Keep post-baseline business contracts executable from package test:db:fresh.
# Separate disposable databases preserve the frozen baseline/catalog tests above.
run_overhaul_contracts() {
  local name="$1" mode="$2" file
  echo "[g0b] overhaul $mode"
  start_db "$name"
  runner apply --container "$name" --environment "g0b-ci-overhaul-$mode"
  if [[ "$mode" == fresh ]]; then
    psql_file "$name" "$APP_ROOT/supabase/migrations/20260925171308_garage_business_master_and_document_contract.sql"
  fi
  psql_file "$name" "$APP_ROOT/supabase/tests/g1a_fixture.sql"
  psql_file "$name" "$APP_ROOT/supabase/tests/overhaul_legacy_fixture.sql"
  # Apply/reapply before validating legacy values, then each dependent contract.
  for file in \
    migrations/20260925171308_garage_business_master_and_document_contract.sql \
    migrations/20260925171308_garage_business_master_and_document_contract.sql \
    tests/overhaul_business_contract.sql \
    migrations/20260925172207_garage_maintenance_inline_atomic.sql \
    tests/overhaul_inline_contract.sql \
    migrations/20260925000400_mobile_quote_atomic.sql \
    migrations/20260925174204_garage_document_atomic.sql \
    tests/overhaul_document_contract.sql \
    migrations/20260925175418_garage_customer_birth_and_job_stock_atomic.sql \
    tests/overhaul_birth_stock_contract.sql \
    migrations/20260925181120_garage_price_precision_and_maintenance_cancel_compat.sql \
    tests/overhaul_price_cancel_contract.sql \
    migrations/20260925182047_garage_inspection_reminder_skip_control.sql \
    tests/overhaul_reminder_contract.sql \
    migrations/20260925182218_garage_document_line_discount_snapshot.sql \
    tests/overhaul_line_discount_contract.sql \
    migrations/20260925193108_garage_customer_legacy_birth_lifecycle.sql \
    tests/overhaul_birth_lifecycle_contract.sql \
    migrations/20260926010000_retire_routine_email_otp.sql; do
    echo "[g0b] overhaul $mode: $file"
    psql_file "$name" "$APP_ROOT/supabase/$file"
  done
}
run_overhaul_contracts "$OVERHAUL_FRESH" fresh
run_overhaul_contracts "$OVERHAUL_UPGRADE" upgrade

echo '[g0b] PASS'
