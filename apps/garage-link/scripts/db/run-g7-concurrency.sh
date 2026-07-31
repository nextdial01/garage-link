#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${1:?container name required}"
APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/garage-link-g7-concurrency.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

psql_sql() { docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1"; }
auth_sql() {
  local user_id="$1" sql="$2"
  docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$user_id',true); $sql commit;"
}

run_parallel() {
  local workers="$1" prefix="$2" command_fn="$3"
  local pids=() successes=0
  for i in $(seq 1 "$workers"); do
    "$command_fn" "$i" >"$TMP_DIR/$prefix.$i.out" 2>"$TMP_DIR/$prefix.$i.err" & pids+=("$!")
  done
  set +e
  for pid in "${pids[@]}"; do wait "$pid"; [[ $? -eq 0 ]] && successes=$((successes+1)); done
  set -e
  echo "$successes"
}

quota_worker() {
  local i="$1"
  psql_sql "insert into public.vehicles(store_id,management_no,status) values('$QUOTA_STORE','G7-Q-$i','in_stock');"
}

for workers in 2 10 100; do
  suffix="$(printf '%012d' "$workers")"
  tenant="58000000-0000-0000-0001-$suffix"
  store="58100000-0000-0000-0001-$suffix"
  psql_sql "begin; set local session_replication_role=replica; insert into public.tenants(id,name,status,plan_code) values('$tenant','G7 quota $workers','active','starter'); insert into public.stores(id,tenant_id,name,status,plan_code) values('$store','$tenant','G7 quota store','active','starter'); insert into public.company_subscriptions(company_id,tenant_id,plan,status,included_staff_count,included_store_count,current_inventory_limit) values('$store','$tenant','starter','active',1,1,50); insert into public.vehicles(store_id,management_no,status) select '$store','G7-SEED-'||g,'in_stock' from generate_series(1,49) g; set local session_replication_role=origin; commit;" >/dev/null
  export QUOTA_STORE="$store" CONTAINER
  success="$(run_parallel "$workers" "quota-$workers" quota_worker)"
  count="$(psql_sql "select count(*) from public.vehicles where store_id='$store' and deleted_at is null;")"
  [[ "$success" == "1" && "$count" == "50" ]] || { echo "quota concurrency failed workers=$workers success=$success rows=$count" >&2; exit 1; }
  psql_sql "begin; set local session_replication_role=replica; delete from public.company_subscriptions where tenant_id='$tenant'; delete from public.vehicles where store_id='$store'; delete from public.stores where id='$store'; delete from public.tenants where id='$tenant'; set local session_replication_role=origin; commit;" >/dev/null
  echo "quota_workers=$workers success=1 rows=50"
done

inventory_worker_same() {
  local i="$1"
  auth_sql '50000000-0000-0000-0000-000000000004' "select public.create_inventory_count('51100000-0000-0000-0000-000000000001','{\"count_no\":\"G7-C-SAME\",\"name\":\"same\"}'::jsonb,'[]'::jsonb,'g7-concurrency-same');" >/dev/null
}
inventory_worker_compete() {
  local i="$1"
  auth_sql '50000000-0000-0000-0000-000000000004' "select public.create_inventory_count('51100000-0000-0000-0000-000000000001','{\"count_no\":\"G7-C-$i\",\"name\":\"compete\"}'::jsonb,'[]'::jsonb,'g7-concurrency-$i');" >/dev/null
}

for workers in 2 10 100; do
  psql_sql "delete from public.inventory_count_items where inventory_count_id in(select id from public.inventory_counts where count_no like 'G7-C-%'); delete from public.inventory_counts where count_no like 'G7-C-%';" >/dev/null
  same_success="$(run_parallel "$workers" "inventory-same-$workers" inventory_worker_same)"
  same_rows="$(psql_sql "select count(*) from public.inventory_counts where idempotency_key='g7-concurrency-same';")"
  [[ "$same_success" == "$workers" && "$same_rows" == "1" ]] || { echo "inventory same-key failed workers=$workers success=$same_success rows=$same_rows" >&2; exit 1; }
  psql_sql "delete from public.inventory_counts where idempotency_key='g7-concurrency-same';" >/dev/null
  competing_success="$(run_parallel "$workers" "inventory-compete-$workers" inventory_worker_compete)"
  competing_rows="$(psql_sql "select count(*) from public.inventory_counts where idempotency_key like 'g7-concurrency-%';")"
  [[ "$competing_success" == "1" && "$competing_rows" == "1" ]] || { echo "inventory competing failed workers=$workers success=$competing_success rows=$competing_rows" >&2; exit 1; }
  psql_sql "delete from public.inventory_counts where idempotency_key like 'g7-concurrency-%';" >/dev/null
  echo "inventory_workers=$workers same_rows=1 competing_success=1"
done

service_worker() {
  local i="$1"
  auth_sql '50000000-0000-0000-0000-000000000001' "select public.cancel_maintenance_job('59000000-0000-0000-0000-000000000004','concurrency','g7-service-$SERVICE_WORKERS-$i');" >/dev/null
}

for workers in 2 10; do
  psql_sql "begin; set local session_replication_role=replica; delete from public.repair_part_stock_movements where source_id='59000000-0000-0000-0000-000000000004'; delete from public.maintenance_job_parts where job_id='59000000-0000-0000-0000-000000000004'; delete from public.maintenance_jobs where id='59000000-0000-0000-0000-000000000004'; delete from public.repair_parts where id='59000000-0000-0000-0000-000000000003'; insert into public.repair_parts(id,store_id,part_no,name,stock,status) values('59000000-0000-0000-0000-000000000003','51100000-0000-0000-0000-000000000001','G7-CONC','concurrency part',10,'在庫あり'); insert into public.maintenance_jobs(id,store_id,job_no,status) values('59000000-0000-0000-0000-000000000004','51100000-0000-0000-0000-000000000001','G7-CONC-JOB','working'); insert into public.maintenance_job_parts(id,store_id,job_id,part_id,name,quantity,stock_adjusted) values('59000000-0000-0000-0000-000000000005','51100000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000004','59000000-0000-0000-0000-000000000003','adjusted',2,true); set local session_replication_role=origin; commit;" >/dev/null
  export SERVICE_WORKERS="$workers"
  success="$(run_parallel "$workers" "service-$workers" service_worker)"
  state="$(psql_sql "select p.stock||'|'||j.status||'|'||(select count(*) from public.repair_part_stock_movements where source_id=j.id) from public.repair_parts p cross join public.maintenance_jobs j where p.id='59000000-0000-0000-0000-000000000003' and j.id='59000000-0000-0000-0000-000000000004';")"
  [[ "$success" == "$workers" && "$state" == "12|cancelled|1" ]] || { echo "service concurrency failed workers=$workers success=$success state=$state" >&2; exit 1; }
  echo "service_workers=$workers state=$state"
done

echo G7_CONCURRENCY_PASS
