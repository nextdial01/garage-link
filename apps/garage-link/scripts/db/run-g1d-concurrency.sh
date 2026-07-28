#!/usr/bin/env bash
set -euo pipefail

container="${1:?usage: run-g1d-concurrency.sh <disposable-container>}"
case "$container" in garage-link-g0b-*) ;; *) echo 'G1-D requires a disposable G0-B container' >&2; exit 2 ;; esac

user_id='50000000-0000-0000-0000-000000000004'
tenant_id='51000000-0000-0000-0000-000000000001'
store_a1='51100000-0000-0000-0000-000000000001'
store_a2='51100000-0000-0000-0000-000000000002'
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/garage-link-g1d.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by)
  select id,tenant_id,'$store_a2','50000000-0000-0000-0000-000000000001'
  from public.memberships where user_id='$user_id' and tenant_id='$tenant_id'
  on conflict (membership_id,store_id) do update set deleted_at=null,updated_at=now();
" >/dev/null

run_switch() {
  local worker="$1" store_id="$2" result_file="$3"
  docker exec "$container" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.role','authenticated',true);
    select set_config('request.jwt.claim.sub','$user_id',true);
    select public.switch_active_garage_store('$tenant_id','$store_id','g1d-worker-$worker');
    commit;
  " > "$result_file"
}

for workers in 2 10; do
  docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    delete from public.user_active_store_preferences where user_id='$user_id' and tenant_id='$tenant_id';
    update public.memberships set status='active',disabled_at=null,deleted_at=null where user_id='$user_id' and tenant_id='$tenant_id';
  " >/dev/null

  export -f run_switch
  export container user_id tenant_id store_a2 tmp_dir
  seq 1 "$workers" | xargs -P "$workers" -I '{}' bash -c 'run_switch "$1" "$store_a2" "$tmp_dir/same-$2-$1.out"' _ '{}' "$workers"

  same_state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
    select concat_ws('|',count(*),min(active_store_id::text),min(version)::text)
    from public.user_active_store_preferences where user_id='$user_id' and tenant_id='$tenant_id';
  ")"
  same_ok="$(grep -l '"ok": true' "$tmp_dir"/same-"$workers"-*.out | wc -l | tr -d ' ')"
  test "$same_ok" = "$workers"
  case "$same_state" in "1|$store_a2|1") ;; *) echo "same-store workers=$workers invalid: $same_state" >&2; exit 1 ;; esac

  docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    delete from public.user_active_store_preferences where user_id='$user_id' and tenant_id='$tenant_id';
  " >/dev/null
  for worker in $(seq 1 "$workers"); do
    if (( worker % 2 == 0 )); then target="$store_a2"; else target="$store_a1"; fi
    run_switch "$worker" "$target" "$tmp_dir/different-$workers-$worker.out" &
  done
  wait

  different_state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
    select concat_ws('|',count(*),bool_and(active_store_id in ('$store_a1','$store_a2')),max(version)>=1)
    from public.user_active_store_preferences where user_id='$user_id' and tenant_id='$tenant_id';
  ")"
  different_ok="$(grep -l '"ok": true' "$tmp_dir"/different-"$workers"-*.out | wc -l | tr -d ' ')"
  test "$different_ok" = "$workers"
  test "$different_state" = '1|t|t'
  echo "workers=$workers same=$same_state different=$different_state"
done

membership_state="$(docker exec "$container" psql -X -Atq -U postgres -d postgres -c "
  select store_id from public.memberships where user_id='$user_id' and tenant_id='$tenant_id';
")"
test "$membership_state" = "$store_a1"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
  delete from public.membership_store_assignments
  where store_id='$store_a2' and membership_id in (
    select id from public.memberships where user_id='$user_id' and tenant_id='$tenant_id'
  );
  update public.user_active_store_preferences
  set active_store_id='$store_a1',version=1,correlation_id='g1d-concurrency-cleanup',updated_at=now()
  where user_id='$user_id' and tenant_id='$tenant_id';
" >/dev/null
echo G1D_CONCURRENCY_PASS
