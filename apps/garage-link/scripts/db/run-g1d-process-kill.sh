#!/usr/bin/env bash
set -euo pipefail

container="${1:?usage: run-g1d-process-kill.sh <disposable-container>}"
case "$container" in garage-link-g0b-*) ;; *) echo 'G1-D requires a disposable G0-B container' >&2; exit 2 ;; esac

user_id='50000000-0000-0000-0000-000000000004'
tenant_id='51000000-0000-0000-0000-000000000001'
store_id='51100000-0000-0000-0000-000000000002'

docker exec "$container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "delete from public.user_active_store_preferences where user_id='$user_id' and tenant_id='$tenant_id';
   insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by)
   select id,tenant_id,'$store_id','50000000-0000-0000-0000-000000000001'
   from public.memberships where user_id='$user_id' and tenant_id='$tenant_id'
   on conflict (membership_id,store_id) do update set deleted_at=null,updated_at=now();" >/dev/null

docker exec -e PGAPPNAME=garage-link-g1d-kill-worker "$container" psql -X -Atq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  begin;
  set local role authenticated;
  select set_config('request.jwt.claim.role','authenticated',true);
  select set_config('request.jwt.claim.sub','$user_id',true);
  select public.switch_active_garage_store('$tenant_id','$store_id','g1d-kill-before-commit');
  select pg_sleep(30);
  commit;
" >/tmp/garage-link-g1d-kill.out 2>/tmp/garage-link-g1d-kill.err &
client_pid=$!

for _ in $(seq 1 50); do
  backend_pid="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
    select pid from pg_stat_activity
    where datname='postgres' and application_name='garage-link-g1d-kill-worker'
    order by query_start desc limit 1;
  ")"
  if [[ -n "$backend_pid" ]]; then break; fi
  sleep 0.1
done
test -n "${backend_pid:-}"
docker exec "$container" psql -X -Atq -U postgres -d postgres -c "select pg_terminate_backend($backend_pid);" >/dev/null
wait "$client_pid" || true

before_commit_count="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
  select count(*) from public.user_active_store_preferences where user_id='$user_id' and tenant_id='$tenant_id';
")"
test "$before_commit_count" = '0'

# A lost HTTP response after commit is represented by retrying the same target.
first="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
  begin; set local role authenticated;
  select set_config('request.jwt.claim.role','authenticated',true);
  select set_config('request.jwt.claim.sub','$user_id',true);
  select public.switch_active_garage_store('$tenant_id','$store_id','g1d-commit-response-lost'); commit;
")"
retry="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
  begin; set local role authenticated;
  select set_config('request.jwt.claim.role','authenticated',true);
  select set_config('request.jwt.claim.sub','$user_id',true);
  select public.switch_active_garage_store('$tenant_id','$store_id','g1d-commit-response-retry'); commit;
")"
state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
  select concat_ws('|',count(*),min(version),min(active_store_id::text))
  from public.user_active_store_preferences where user_id='$user_id' and tenant_id='$tenant_id';
")"
test "$state" = "1|1|$store_id"
grep -q '"changed": true' <<<"$first"
grep -q '"changed": false' <<<"$retry"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  delete from public.membership_store_assignments
  where store_id='$store_id' and membership_id in (
    select id from public.memberships where user_id='$user_id' and tenant_id='$tenant_id'
  );
  update public.user_active_store_preferences
  set active_store_id='51100000-0000-0000-0000-000000000001',version=1,
      correlation_id='g1d-process-kill-cleanup',updated_at=now()
  where user_id='$user_id' and tenant_id='$tenant_id';
" >/dev/null
echo "before_commit_rows=$before_commit_count after_commit_retry=$state"
echo G1D_PROCESS_KILL_PASS
