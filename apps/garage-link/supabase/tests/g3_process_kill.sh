#!/usr/bin/env bash
set -euo pipefail
database="${1:-garage_g0}"
case "$database" in garage_g0*) ;; *) echo "G3 tests require garage_g0*" >&2; exit 2 ;; esac

cleanup() {
  psql -U supabase_admin -d "$database" -q -c "drop trigger if exists g3_test_pause_vehicle on public.vehicles; drop function if exists public.g3_test_pause_vehicle();" >/dev/null
}
trap cleanup EXIT

psql -U supabase_admin -d "$database" -v ON_ERROR_STOP=1 -q -c "
  update public.vehicle_sale_claims set status='cancelled', cancelled_at=now() where status='active';
  update public.vehicles set status='在庫中', sold_date=null where id='53000000-0000-0000-0000-000000000001';
  update public.deals set status='商談中' where deal_no like 'G3-W-%';
  delete from public.vehicle_sale_operations; delete from public.vehicle_sale_claims;
  create or replace function public.g3_test_pause_vehicle() returns trigger language plpgsql as \$\$ begin perform pg_sleep(30); return new; end \$\$;
  create trigger g3_test_pause_vehicle after update of status on public.vehicles
    for each row when (new.status='売約済み') execute function public.g3_test_pause_vehicle();
"

psql -U supabase_admin -d "$database" -v ON_ERROR_STOP=1 -q -c "
  set application_name='g3-process-kill'; begin; set local role authenticated;
  select set_config('request.jwt.claim.role','authenticated',true);
  select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
  select public.reserve_vehicle_sale((select id from public.deals where deal_no='G3-W-1'),'g3-process-kill-0001',null); commit;
" >/tmp/g3-process-kill.out 2>&1 &
worker_pid=$!

backend_pid=''
for _ in $(seq 1 50); do
  backend_pid="$(psql -U supabase_admin -d "$database" -Atq -c "select pid from pg_stat_activity where application_name='g3-process-kill' and state='active' limit 1")"
  test -n "$backend_pid" && break
  sleep 0.1
done
test -n "$backend_pid"
psql -U supabase_admin -d "$database" -Atq -c "select pg_terminate_backend($backend_pid)" | grep -q t
wait "$worker_pid" || true
cleanup
trap - EXIT

state="$(psql -U supabase_admin -d "$database" -Atq -c "
  select concat_ws('|',
    (select status from public.vehicles where id='53000000-0000-0000-0000-000000000001'),
    (select count(*) from public.deals where deal_no like 'G3-W-%' and status='成約'),
    (select count(*) from public.vehicle_sale_claims),
    (select count(*) from public.vehicle_sale_operations));")"
echo "process-kill state=$state"
test "$state" = "在庫中|0|0|0"
echo G3_PROCESS_KILL_PASS
