#!/usr/bin/env bash
set -euo pipefail
container="${1:?usage: run-g4b-concurrency.sh <disposable-container>}"
case "$container" in garage-link-g0b-*) ;; *) echo 'G4-B requires disposable G0-B container' >&2; exit 2;; esac
user_id='50000000-0000-0000-0000-000000000001'
store_id='51100000-0000-0000-0000-000000000001'
tenant_id='51000000-0000-0000-0000-000000000001'
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/garage-link-g4b.XXXXXX")"
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

setup_sale() {
  local suffix="$1" with_payment="$2" with_customer="${3:-0}" customer_sql='null'
  if [[ "$with_customer" = 1 ]]; then customer_sql="'57000000-0000-0000-0000-000000000001'"; fi
  local vehicle="58000000-0000-0000-0000-$(printf '%012d' "$suffix")"
  local deal="58100000-0000-0000-0000-$(printf '%012d' "$suffix")"
  local claim="58200000-0000-0000-0000-$(printf '%012d' "$suffix")"
  local invoice="58300000-0000-0000-0000-$(printf '%012d' "$suffix")"
  local payment="58400000-0000-0000-0000-$(printf '%012d' "$suffix")"
  docker exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    insert into public.vehicles(id,store_id,management_no,status) values('$vehicle','$store_id','G4B-CON-$suffix','納車済み');
    insert into public.deals(id,store_id,customer_id,vehicle_id,title,status) values('$deal','$store_id',$customer_sql,'$vehicle','G4B concurrency $suffix','成約');
    insert into public.vehicle_sale_claims(id,tenant_id,store_id,vehicle_id,deal_id,status,previous_vehicle_status,delivered_at)
      values('$claim','$tenant_id','$store_id','$vehicle','$deal','delivered','在庫中',now());
    select set_config('app.g4a_accounting_rpc','on',false);
    insert into public.invoices(id,store_id,deal_id,vehicle_id,invoice_no,status,issue_status,total_amount,paid_amount,unpaid_amount,issued_at)
      values('$invoice','$store_id','$deal','$vehicle','G4B-CON-$suffix',case when $with_payment=1 then 'paid' else 'issued' end,'issued',1000,case when $with_payment=1 then 1000 else 0 end,case when $with_payment=1 then 0 else 1000 end,now());
    select set_config('app.g4a_accounting_rpc','',false);
    insert into public.invoice_payment_ledger(id,tenant_id,store_id,invoice_id,deal_id,vehicle_id,entry_type,amount,payment_method,idempotency_key,request_fingerprint,actor_user_id,actor_role)
      select '$payment','$tenant_id','$store_id','$invoice','$deal','$vehicle','payment',1000,'cash','g4b-con-payment-$suffix',repeat('b',64),'$user_id','owner' where $with_payment=1;" >/dev/null
  printf '%s|%s|%s|%s|%s\n' "$vehicle" "$deal" "$claim" "$invoice" "$payment"
}

for workers in 2 10; do
  IFS='|' read -r vehicle deal claim invoice payment <<<"$(setup_sale "$workers" 0)"
  export claim invoice tmp_dir workers
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c \
    'rpc "select public.create_sale_correction_case('"'"'$claim'"'"','"'"'administrative_correction'"'"','"'"'同時case作成'"'"',0,'"'"'$invoice'"'"','"'"'g4b-case-same-'"$workers"'-0001'"'"',null)" "$tmp_dir/case-$workers-{}.out"'
  rows="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select count(*) from public.sale_correction_cases where original_sale_claim_id='$claim'")"
  test "$rows" = 1
  case_id="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select id from public.sale_correction_cases where original_sale_claim_id='$claim'")"
  rpc "select public.transition_sale_correction_case('$case_id','begin_review',null,null,null,'g4b-case-review-$workers',null)" "$tmp_dir/case-review-$workers.out"
  export case_id
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c \
    'rpc "select public.transition_sale_correction_case('"'"'$case_id'"'"','"'"'approve'"'"',null,0,'"'"'not_applicable'"'"','"'"'g4b-case-approve-'"$workers"'-0001'"'"',null)" "$tmp_dir/case-approve-$workers-{}.out"'
  test "$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select status from public.sale_correction_cases where id='$case_id'")" = approved
  rpc "select public.transition_sale_correction_case('$case_id','start_processing',null,null,null,'g4b-case-processing-$workers',null)" "$tmp_dir/case-processing-$workers.out"
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c \
    'rpc "select public.transition_sale_correction_case('"'"'$case_id'"'"','"'"'complete'"'"',null,null,null,'"'"'g4b-case-complete-'"$workers"'-0001'"'"',null)" "$tmp_dir/case-complete-$workers-{}.out"'
  test "$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select status from public.sale_correction_cases where id='$case_id'")" = completed
  echo "case_workers=$workers active_case=1 approval=1 completion=1"
done

for workers in 2 10 100; do
  suffix="$((1000+workers))"
  IFS='|' read -r vehicle deal claim invoice payment <<<"$(setup_sale "$suffix" 1)"
  create="$(rpc "select public.create_sale_correction_case('$claim','administrative_correction','同時返金case',1000,'$invoice','g4b-refund-case-$workers',null)" "$tmp_dir/refund-create-$workers.out"; tail -n 1 "$tmp_dir/refund-create-$workers.out")"
  case_id="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select id from public.sale_correction_cases where original_sale_claim_id='$claim'")"
  rpc "select public.transition_sale_correction_case('$case_id','begin_review',null,null,null,'g4b-refund-review-$workers',null)" "$tmp_dir/refund-review-$workers.out"
  rpc "select public.transition_sale_correction_case('$case_id','approve',null,1000,'not_applicable','g4b-refund-approve-$workers',null)" "$tmp_dir/refund-approve-$workers.out"
  rpc "select public.transition_sale_correction_case('$case_id','start_processing',null,null,null,'g4b-refund-process-$workers',null)" "$tmp_dir/refund-process-$workers.out"
  export case_id payment workers
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c \
    'rpc "select public.record_sale_correction_refund('"'"'$case_id'"'"','"'"'$payment'"'"',1000,'"'"'同時返金確認'"'"','"'"'g4b-refund-same-'"$workers"'-0001'"'"',null)" "$tmp_dir/refund-$workers-{}.out"'
  rows="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select count(*) from public.sale_correction_refunds where case_id='$case_id'")"
  amount="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select coalesce(sum(amount),0) from public.sale_correction_refunds where case_id='$case_id'")"
  test "$rows" = 1; test "$amount" = 1000
  echo "refund_workers=$workers refund_rows=1 refund_amount=1000"
done

for workers in 2 10; do
  suffix="$((2000+workers))"
  IFS='|' read -r vehicle deal claim invoice payment <<<"$(setup_sale "$suffix" 0 1)"
  rpc "select public.create_sale_correction_case('$claim','customer_return','同時在庫復帰case',0,'$invoice','g4b-restock-case-$workers',null)" "$tmp_dir/restock-create-$workers.out"
  case_id="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select id from public.sale_correction_cases where original_sale_claim_id='$claim'")"
  rpc "select public.transition_sale_correction_case('$case_id','begin_review',null,null,null,'g4b-restock-review-$workers',null)" "$tmp_dir/restock-review-$workers.out"
  rpc "select public.transition_sale_correction_case('$case_id','approve',null,0,'restock','g4b-restock-approve-$workers',null)" "$tmp_dir/restock-approve-$workers.out"
  rpc "select public.transition_sale_correction_case('$case_id','start_processing',null,null,null,'g4b-restock-process-$workers',null)" "$tmp_dir/restock-process-$workers.out"
  rpc "select public.complete_sale_correction_inspection('$case_id','同時復帰前検品','g4b-restock-inspection-$workers',null)" "$tmp_dir/restock-inspection-$workers.out"
  rpc "select public.resolve_sale_correction_ownership('$case_id','returned','同時復帰前返却確認','g4b-restock-ownership-$workers',null)" "$tmp_dir/restock-ownership-$workers.out"
  rpc "select public.resolve_sale_correction_external_procedure('$case_id','completed','同時復帰前外部確認','g4b-restock-external-$workers',null)" "$tmp_dir/restock-external-$workers.out"
  export case_id workers
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c \
    'rpc "select public.confirm_sale_correction_restock('"'"'$case_id'"'"','"'"'g4b-restock-same-'"$workers"'-0001'"'"',null)" "$tmp_dir/restock-$workers-{}.out"'
  state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select concat_ws('|',c.restock_status,v.status,(select count(*) from public.sale_correction_events e where e.case_id=c.id and e.event_type='vehicle_restocked')) from public.sale_correction_cases c join public.vehicles v on v.id=c.vehicle_id where c.id='$case_id'")"
  test "$state" = 'completed|在庫中|1'
  echo "restock_workers=$workers state=$state"
done
echo G4B_CONCURRENCY_PASS
