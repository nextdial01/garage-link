#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${1:?container name required}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/garage-link-g7-kill.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
psql_sql() { docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1"; }

psql_sql "delete from public.inventory_count_items where inventory_count_id in(select id from public.inventory_counts where idempotency_key='g7-kill-count'); delete from public.inventory_counts where idempotency_key='g7-kill-count';" >/dev/null
docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set application_name='g7-inventory-kill'; begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true); select public.create_inventory_count('51100000-0000-0000-0000-000000000001','{\"count_no\":\"G7-KILL\",\"name\":\"kill\"}'::jsonb,'[]'::jsonb,'g7-kill-count'); select pg_sleep(60); commit;" >"$TMP_DIR/inventory.out" 2>"$TMP_DIR/inventory.err" &
inventory_pid=$!
sleep 1
psql_sql "select pg_terminate_backend(pid) from pg_stat_activity where application_name='g7-inventory-kill' and pid<>pg_backend_pid();" >/dev/null
set +e; wait "$inventory_pid"; set -e
[[ "$(psql_sql "select count(*) from public.inventory_counts where idempotency_key='g7-kill-count';")" == "0" ]] || { echo 'inventory process kill left partial row' >&2; exit 1; }

psql_sql "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true); select public.create_inventory_count('51100000-0000-0000-0000-000000000001','{\"count_no\":\"G7-KILL\",\"name\":\"kill\"}'::jsonb,'[]'::jsonb,'g7-kill-count'); commit;" >/dev/null
[[ "$(psql_sql "select count(*) from public.inventory_counts where idempotency_key='g7-kill-count';")" == "1" ]] || { echo 'inventory retry failed' >&2; exit 1; }
psql_sql "delete from public.inventory_counts where idempotency_key='g7-kill-count';" >/dev/null

psql_sql "begin; set local session_replication_role=replica; delete from public.repair_part_stock_movements where source_id='59100000-0000-0000-0000-000000000004'; delete from public.maintenance_job_parts where job_id='59100000-0000-0000-0000-000000000004'; delete from public.maintenance_jobs where id='59100000-0000-0000-0000-000000000004'; delete from public.repair_parts where id='59100000-0000-0000-0000-000000000003'; insert into public.repair_parts(id,store_id,part_no,name,stock,status) values('59100000-0000-0000-0000-000000000003','51100000-0000-0000-0000-000000000001','G7-KILL-PART','kill part',10,'在庫あり'); insert into public.maintenance_jobs(id,store_id,job_no,status) values('59100000-0000-0000-0000-000000000004','51100000-0000-0000-0000-000000000001','G7-KILL-JOB','working'); insert into public.maintenance_job_parts(id,store_id,job_id,part_id,name,quantity,stock_adjusted) values('59100000-0000-0000-0000-000000000005','51100000-0000-0000-0000-000000000001','59100000-0000-0000-0000-000000000004','59100000-0000-0000-0000-000000000003','adjusted',2,true); set local session_replication_role=origin; commit;" >/dev/null
docker exec "$CONTAINER" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set application_name='g7-service-kill'; begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true); select public.cancel_maintenance_job('59100000-0000-0000-0000-000000000004','kill','g7-service-kill'); select pg_sleep(60); commit;" >"$TMP_DIR/service.out" 2>"$TMP_DIR/service.err" &
service_pid=$!
sleep 1
psql_sql "select pg_terminate_backend(pid) from pg_stat_activity where application_name='g7-service-kill' and pid<>pg_backend_pid();" >/dev/null
set +e; wait "$service_pid"; set -e
state="$(psql_sql "select p.stock||'|'||j.status||'|'||(select count(*) from public.repair_part_stock_movements where source_id=j.id) from public.repair_parts p cross join public.maintenance_jobs j where p.id='59100000-0000-0000-0000-000000000003' and j.id='59100000-0000-0000-0000-000000000004';")"
[[ "$state" == "10|working|0" ]] || { echo "service process kill partial state=$state" >&2; exit 1; }
psql_sql "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true); select public.cancel_maintenance_job('59100000-0000-0000-0000-000000000004','retry','g7-service-kill'); commit;" >/dev/null
[[ "$(psql_sql "select p.stock||'|'||j.status||'|'||(select count(*) from public.repair_part_stock_movements where source_id=j.id) from public.repair_parts p cross join public.maintenance_jobs j where p.id='59100000-0000-0000-0000-000000000003' and j.id='59100000-0000-0000-0000-000000000004';")" == "12|cancelled|1" ]] || { echo 'service retry failed' >&2; exit 1; }

echo G7_PROCESS_KILL_PASS
