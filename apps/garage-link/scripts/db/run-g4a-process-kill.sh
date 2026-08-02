#!/usr/bin/env bash
set -euo pipefail
container="${1:?usage: run-g4a-process-kill.sh <disposable-container>}"
case "$container" in garage-link-g0b-*) ;; *) exit 2;; esac
invoice_id='56000000-0000-0000-0000-000000000001'
user_id='50000000-0000-0000-0000-000000000001'
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
 select set_config('app.g4a_accounting_rpc','on',false);
 insert into public.invoices(id,store_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount)
 values('$invoice_id','51100000-0000-0000-0000-000000000001','G4A-KILL','issued','issued',1000,0,1000);" >/dev/null

docker exec -e PGAPPNAME=garage-link-g4a-kill "$container" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
 begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true);
 select set_config('request.jwt.claim.sub','$user_id',true);
 select public.record_garage_payment('$invoice_id',1000,'bank','g4a-kill-before-commit',null);
 select pg_sleep(30); commit;" >/tmp/garage-link-g4a-kill.out 2>/tmp/garage-link-g4a-kill.err & client_pid=$!
for _ in $(seq 1 50); do
  backend_pid="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select pid from pg_stat_activity where application_name='garage-link-g4a-kill' limit 1")"
  [[ -n "$backend_pid" ]] && break; sleep 0.1
done
test -n "${backend_pid:-}"
docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select pg_terminate_backend($backend_pid)" >/dev/null
wait "$client_pid" || true
state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select concat_ws('|',(select count(*) from public.invoice_payment_ledger where invoice_id='$invoice_id'),paid_amount,unpaid_amount) from public.invoices where id='$invoice_id'")"
test "$state" = '0|0|1000'
for key in g4a-commit-response-lost g4a-commit-response-lost; do
 docker exec "$container" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$user_id',true); select public.record_garage_payment('$invoice_id',1000,'bank','$key',null); commit;" >/dev/null
done
state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select concat_ws('|',(select count(*) from public.invoice_payment_ledger where invoice_id='$invoice_id'),paid_amount,unpaid_amount) from public.invoices where id='$invoice_id'")"
test "$state" = '1|1000|0'
echo "rollback_state=0|0|1000 retry_state=$state"

# Kill a sale cancellation after the RPC returns but before COMMIT.
vehicle_id='56000000-0000-0000-0000-000000000101'
deal_id='56000000-0000-0000-0000-000000000102'
sale_invoice_id='56000000-0000-0000-0000-000000000103'
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
 insert into public.vehicles(id,store_id,management_no,status) values('$vehicle_id','51100000-0000-0000-0000-000000000001','G4A-KILL-SALE','在庫中');
 insert into public.deals(id,store_id,vehicle_id,title,status) values('$deal_id','51100000-0000-0000-0000-000000000001','$vehicle_id','G4A kill sale','商談中');" >/dev/null
docker exec "$container" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$user_id',true); select public.reserve_vehicle_sale('$deal_id','g4a-kill-reserve-0001',null); commit;" >/dev/null
docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "insert into public.invoices(id,store_id,deal_id,vehicle_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount) values('$sale_invoice_id','51100000-0000-0000-0000-000000000001','$deal_id','$vehicle_id','G4A-KILL-SALE-INV','draft','draft',1000,0,1000);" >/dev/null
docker exec "$container" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$user_id',true); select public.issue_garage_invoice('$sale_invoice_id','g4a-kill-issue-0001',null); commit;" >/dev/null
docker exec -e PGAPPNAME=garage-link-g4a-cancel-kill "$container" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$user_id',true); select public.cancel_vehicle_sale('$deal_id','g4a-kill-cancel-0001',null); select pg_sleep(30); commit;" >/tmp/garage-link-g4a-cancel-kill.out 2>/tmp/garage-link-g4a-cancel-kill.err & cancel_client_pid=$!
for _ in $(seq 1 50); do cancel_backend_pid="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select pid from pg_stat_activity where application_name='garage-link-g4a-cancel-kill' limit 1")"; [[ -n "$cancel_backend_pid" ]] && break; sleep 0.1; done
test -n "${cancel_backend_pid:-}"
docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select pg_terminate_backend($cancel_backend_pid)" >/dev/null
wait "$cancel_client_pid" || true
cancel_state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select concat_ws('|',c.status,v.status,d.status,i.status,i.issue_status) from public.vehicle_sale_claims c join public.vehicles v on v.id=c.vehicle_id join public.deals d on d.id=c.deal_id join public.invoices i on i.deal_id=d.id where d.id='$deal_id'")"
test "$cancel_state" = 'active|売約済み|成約|issued|issued'
echo "cancel_rollback_state=$cancel_state"
echo G4A_PROCESS_KILL_PASS
