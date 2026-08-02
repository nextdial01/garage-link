#!/usr/bin/env bash
set -euo pipefail
container="${1:?usage: run-g4a-concurrency.sh <disposable-container>}"
case "$container" in garage-link-g0b-*) ;; *) echo 'G4-A requires disposable G0-B container' >&2; exit 2;; esac

user_id='50000000-0000-0000-0000-000000000001'
store_id='51100000-0000-0000-0000-000000000001'
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/garage-link-g4a.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

rpc() {
  local sql="$1" output="$2"
  docker exec "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    begin; set local role authenticated;
    select set_config('request.jwt.claim.role','authenticated',true);
    select set_config('request.jwt.claim.sub','$user_id',true);
    $sql; commit;" >"$output"
}
export -f rpc
export container user_id

for workers in 2 10 100; do
  invoice_id="55000000-0000-0000-0000-$(printf '%012d' "$workers")"
  docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    select set_config('app.g4a_accounting_rpc','on',false);
    insert into public.invoices(id,store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
    values('$invoice_id','$store_id','G4A-SAME-$workers','issued','issued',1000,0,1000);" >/dev/null
  export invoice_id tmp_dir workers
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c \
    'rpc "select public.record_garage_payment('"'"'$invoice_id'"'"',1000,'"'"'bank'"'"','"'"'g4a-same-'"$workers"'-0001'"'"',null)" "$tmp_dir/same-$workers-{}.out"'
  rows="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select count(*) from public.invoice_payment_ledger where invoice_id='$invoice_id' and entry_type='payment'")"
  status="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select concat_ws('|',status,paid_amount,unpaid_amount) from public.invoices where id='$invoice_id'")"
  test "$rows" = 1; test "$status" = 'paid|1000|0'

  invoice_id="55000000-0000-0000-0000-$(printf '%012d' "$((1000+workers))")"
  docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    select set_config('app.g4a_accounting_rpc','on',false);
    insert into public.invoices(id,store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
    values('$invoice_id','$store_id','G4A-DISTINCT-$workers','issued','issued',1000,0,1000);" >/dev/null
  for worker in $(seq 1 "$workers"); do rpc "select public.record_garage_payment('$invoice_id',1000,'bank','g4a-distinct-$workers-$worker',null)" "$tmp_dir/distinct-$workers-$worker.out" & done
  wait
  rows="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select count(*) from public.invoice_payment_ledger where invoice_id='$invoice_id' and entry_type='payment'")"
  test "$rows" = 1
  echo "workers=$workers idempotent_rows=1 competing_success=1"
done

invoice_id='55000000-0000-0000-0000-000000000200'
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  select set_config('app.g4a_accounting_rpc','on',false);
  insert into public.invoices(id,store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
  values('$invoice_id','$store_id','G4A-REVERSAL-CON','issued','issued',1000,0,1000);
" >/dev/null
rpc "select public.record_garage_payment('$invoice_id',1000,'cash','g4a-reversal-base-0001',null)" "$tmp_dir/base.out"
payment_id="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select id from public.invoice_payment_ledger where invoice_id='$invoice_id' and entry_type='payment'")"
for workers in 2 10; do
  for worker in $(seq 1 "$workers"); do rpc "select public.record_garage_payment_reversal('$payment_id',1000,'reversal','同時取消','g4a-reversal-same-$workers',null)" "$tmp_dir/reversal-$workers-$worker.out" & done
  wait
  rows="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select count(*) from public.invoice_payment_ledger where original_payment_id='$payment_id'")"
  test "$rows" = 1
done

# Payment vs invoice void: exactly one accounting transition wins.
invoice_id='55000000-0000-0000-0000-000000000300'
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  select set_config('app.g4a_accounting_rpc','on',false);
  insert into public.invoices(id,store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
  values('$invoice_id','$store_id','G4A-VOID-PAY-RACE','issued','issued',1000,0,1000);" >/dev/null
rpc "select public.record_garage_payment('$invoice_id',1000,'cash','g4a-race-payment-0001',null)" "$tmp_dir/race-payment.out" &
rpc "select public.void_garage_invoice('$invoice_id','同時取消','g4a-race-void-0001',null)" "$tmp_dir/race-void.out" &
wait
state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select concat_ws('|',status,issue_status,paid_amount,unpaid_amount,(select count(*) from public.invoice_payment_ledger where invoice_id='$invoice_id' and entry_type='payment')) from public.invoices where id='$invoice_id'")"
[[ "$state" == 'paid|issued|1000|0|1' || "$state" == 'void|cancelled|0|1000|0' ]]

# Payment vs sale cancellation: invoice, claim, deal and vehicle remain one coherent state.
vehicle_id='55000000-0000-0000-0000-000000000401'
deal_id='55000000-0000-0000-0000-000000000402'
invoice_id='55000000-0000-0000-0000-000000000403'
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  insert into public.vehicles(id,store_id,management_no,status) values('$vehicle_id','$store_id','G4A-RACE-V','在庫中');
  insert into public.deals(id,store_id,vehicle_id,title,status) values('$deal_id','$store_id','$vehicle_id','G4A race sale','商談中');" >/dev/null
rpc "select public.reserve_vehicle_sale('$deal_id','g4a-race-reserve-0001',null)" "$tmp_dir/race-reserve.out"
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  insert into public.invoices(id,store_id,deal_id,vehicle_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
  values('$invoice_id','$store_id','$deal_id','$vehicle_id','G4A-SALE-PAY-RACE','draft','draft',1000,0,1000);" >/dev/null
rpc "select public.issue_garage_invoice('$invoice_id','g4a-race-issue-0001',null)" "$tmp_dir/race-issue.out"
rpc "select public.record_garage_payment('$invoice_id',1000,'cash','g4a-sale-race-payment-0001',null)" "$tmp_dir/sale-race-payment.out" &
rpc "select public.cancel_vehicle_sale('$deal_id','g4a-sale-race-cancel-0001',null)" "$tmp_dir/sale-race-cancel.out" &
wait
state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select concat_ws('|',i.status,i.issue_status,i.paid_amount,c.status,v.status,d.status,(select count(*) from public.invoice_payment_ledger where invoice_id=i.id and entry_type='payment')) from public.invoices i join public.vehicle_sale_claims c on c.deal_id=i.deal_id join public.vehicles v on v.id=c.vehicle_id join public.deals d on d.id=c.deal_id where i.id='$invoice_id'")"
[[ "$state" == 'paid|issued|1000|active|売約済み|成約|1' || "$state" == 'void|cancelled|0|cancelled|在庫中|失注|0' ]]
echo "race_invoice=$state"
echo G4A_CONCURRENCY_PASS
