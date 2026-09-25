-- Store-scoped idempotent status updates for the existing mobile maintenance API.
create table if not exists public.garage_mobile_maintenance_operations (
  store_id uuid not null references public.stores(id),
  idempotency_key text not null,
  request_fingerprint text not null,
  job_id uuid not null references public.maintenance_jobs(id),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(store_id,idempotency_key)
);
alter table public.garage_mobile_maintenance_operations enable row level security;
revoke all on public.garage_mobile_maintenance_operations from public,anon,authenticated;

create or replace function public.garage_mobile_update_maintenance(
  p_store_id uuid,p_job_id uuid,p_actor_user_id uuid,p_actor_role text,
  p_idempotency_key text,p_request_fingerprint text,p_status text,
  p_delivery_present boolean,p_delivery_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare
  v_existing public.garage_mobile_maintenance_operations%rowtype;
  v_job public.maintenance_jobs%rowtype;
  v_result jsonb;
begin
  if p_store_id is null or p_job_id is null or p_actor_user_id is null
    or p_actor_role not in ('owner','admin','staff','implementer')
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200
    or p_request_fingerprint is null or length(p_request_fingerprint) <> 64
    or p_status not in ('received','estimating','waiting','working','completed') then
    return jsonb_build_object('outcome','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_store_id::text || ':' || p_idempotency_key));
  select * into v_existing from public.garage_mobile_maintenance_operations
    where store_id = p_store_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint or v_existing.job_id <> p_job_id then
      return jsonb_build_object('outcome','conflict');
    end if;
    return jsonb_set(v_existing.result,'{outcome}','"replayed"'::jsonb);
  end if;
  select * into v_job from public.maintenance_jobs
    where id = p_job_id and store_id = p_store_id and deleted_at is null for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  update public.maintenance_jobs set status = p_status,
    scheduled_delivery_at = case when p_delivery_present then p_delivery_at else scheduled_delivery_at end,
    updated_at = now()
    where id = p_job_id and store_id = p_store_id returning * into v_job;
  v_result := jsonb_build_object('outcome','updated','job',to_jsonb(v_job));
  insert into public.garage_mobile_maintenance_operations(store_id,idempotency_key,request_fingerprint,job_id,result)
    values(p_store_id,p_idempotency_key,p_request_fingerprint,p_job_id,v_result);
  return v_result;
end $$;
revoke all on function public.garage_mobile_update_maintenance(uuid,uuid,uuid,text,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.garage_mobile_update_maintenance(uuid,uuid,uuid,text,text,text,text,boolean,timestamptz) to service_role;

-- Rollback: remove the function after all mobile callers have moved; retain the
-- receipt table until the idempotency window has closed.
