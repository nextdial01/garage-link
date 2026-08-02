#!/usr/bin/env bash
set -euo pipefail

database="${1:-garage_g0}"
case "$database" in garage_g0*) ;; *) echo "G3 tests require garage_g0*" >&2; exit 2 ;; esac

reset_fixture() {
  psql -U supabase_admin -d "$database" -v ON_ERROR_STOP=1 -q -c "
    update public.vehicle_sale_claims set status='cancelled', cancelled_at=now() where status='active';
    update public.vehicles set status='在庫中', sold_date=null where id='53000000-0000-0000-0000-000000000001';
    update public.deals set status='商談中' where deal_no like 'G3-W-%';
    delete from public.vehicle_sale_operations;
    delete from public.vehicle_sale_claims;
  "
}

for workers in 2 10 100; do
  reset_fixture
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c '
    i="$1"; database="$2"; workers="$3"
    psql -U supabase_admin -d "$database" -Atq -v ON_ERROR_STOP=1 -c "
      begin;
      set local role authenticated;
      select set_config('\''request.jwt.claim.role'\'', '\''authenticated'\'', true);
      select set_config('\''request.jwt.claim.sub'\'', '\''50000000-0000-0000-0000-000000000001'\'', true);
      select public.reserve_vehicle_sale(
        (select id from public.deals where deal_no='\''G3-W-$i'\''),
        '\''g3-workers-$workers-'\'' || lpad('\''$i'\'', 4, '\''0'\''), null
      );
      commit;
    " > "/tmp/g3-result-$workers-$i.txt"
  ' _ '{}' "$database" "$workers"

  success_count="$(grep -l '"ok": true' /tmp/g3-result-"$workers"-*.txt | wc -l | tr -d ' ')"
  state="$(psql -U supabase_admin -d "$database" -Atq -c "
    select concat_ws('|',
      (select count(*) from public.vehicle_sale_claims where status='active'),
      (select count(*) from public.deals where deal_no like 'G3-W-%' and status='成約'),
      (select status from public.vehicles where id='53000000-0000-0000-0000-000000000001')
    );
  ")"
  echo "workers=$workers success=$success_count state=$state"
  test "$success_count" = "1"
  test "$state" = "1|1|売約済み"
done

echo G3_CONCURRENCY_PASS
