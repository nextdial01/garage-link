#!/usr/bin/env bash
set -euo pipefail
database="${1:-garage_g0}"
case "$database" in garage_g0*) ;; *) echo "G3 tests require garage_g0*" >&2; exit 2 ;; esac

for workers in 2 10; do
  psql -U supabase_admin -d "$database" -v ON_ERROR_STOP=1 -q -c "
    update public.vehicle_sale_claims set status='cancelled', cancelled_at=now() where status='active';
    update public.vehicles set status='在庫中', sold_date=null where id='53000000-0000-0000-0000-000000000001';
    update public.deals set status='商談中' where deal_no like 'G3-W-%';
    delete from public.vehicle_sale_operations; delete from public.vehicle_sale_claims;
    delete from public.audit_logs where action in ('vehicle_sale_reserved','vehicle_sale_cancelled') and target_id='53000000-0000-0000-0000-000000000001';
  "
  psql -U supabase_admin -d "$database" -Atq -v ON_ERROR_STOP=1 -c "
    begin; set local role authenticated;
    select set_config('request.jwt.claim.role','authenticated',true);
    select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
    select public.reserve_vehicle_sale((select id from public.deals where deal_no='G3-W-1'),'g3-cancel-reserve-$workers',null); commit;
  " >/dev/null
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c '
    i="$1"; database="$2"; workers="$3"
    psql -U supabase_admin -d "$database" -Atq -v ON_ERROR_STOP=1 -c "
      begin; set local role authenticated;
      select set_config('\''request.jwt.claim.role'\'', '\''authenticated'\'', true);
      select set_config('\''request.jwt.claim.sub'\'', '\''50000000-0000-0000-0000-000000000001'\'', true);
      select public.cancel_vehicle_sale((select id from public.deals where deal_no='\''G3-W-1'\''), '\''g3-cancel-$workers-'\'' || lpad('\''$i'\'', 4, '\''0'\''), null); commit;
    " > "/tmp/g3-cancel-$workers-$i.txt"
  ' _ '{}' "$database" "$workers"
  state="$(psql -U supabase_admin -d "$database" -Atq -c "select concat_ws('|',(select count(*) from public.vehicle_sale_claims where status='active'),(select status from public.vehicles where id='53000000-0000-0000-0000-000000000001'),(select status from public.deals where deal_no='G3-W-1'),(select count(*) from public.audit_logs where action='vehicle_sale_cancelled' and target_id='53000000-0000-0000-0000-000000000001'))")"
  echo "cancel-workers=$workers state=$state"
  test "$state" = "0|在庫中|失注|1"
done
echo G3_CANCEL_CONCURRENCY_PASS
