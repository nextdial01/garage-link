#!/usr/bin/env bash
set -euo pipefail
container="${1:?usage: run-g4b-process-kill.sh <disposable-container>}"
case "$container" in garage-link-g0b-*) ;; *) echo 'G4-B requires disposable G0-B container' >&2; exit 2;; esac
user_id='50000000-0000-0000-0000-000000000001'
claim='57300000-0000-0000-0000-000000000002'
docker exec -e PGAPPNAME=garage-link-g4b-kill "$container" psql -X -Atq -U postgres -d postgres -c "
  begin; set local role authenticated;
  select set_config('request.jwt.claim.role','authenticated',true);
  select set_config('request.jwt.claim.sub','$user_id',true);
  select public.create_sale_correction_case('$claim','administrative_correction','process kill case',0,null,'g4b-kill-create-0001',null);
  select pg_sleep(30); commit;" >/tmp/garage-link-g4b-kill.out 2>/tmp/garage-link-g4b-kill.err &
client_pid=$!
for _ in $(seq 1 50); do
  backend_pid="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select pid from pg_stat_activity where application_name='garage-link-g4b-kill' limit 1")"
  [[ -n "$backend_pid" ]] && break
  sleep 0.1
done
test -n "${backend_pid:-}"
docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select pg_terminate_backend($backend_pid)" >/dev/null
wait "$client_pid" 2>/dev/null || true
rows="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select count(*) from public.sale_correction_cases where original_sale_claim_id='$claim'")"
test "$rows" = 0
result="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$user_id',true); select public.create_sale_correction_case('$claim','administrative_correction','process kill case',0,null,'g4b-kill-create-0001',null); commit;")"
rows="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select count(*) from public.sale_correction_cases where original_sale_claim_id='$claim'")"
test "$rows" = 1
echo "process_kill_before_commit_rows=0 retry_rows=1"
echo G4B_PROCESS_KILL_PASS
