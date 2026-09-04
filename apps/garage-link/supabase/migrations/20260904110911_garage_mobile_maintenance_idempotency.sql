-- Native maintenance mutations are server-authorized before this function is
-- called. The operation ledger makes a retry return the original read-back and
-- rejects the same key with a different payload.
begin;

create table if not exists public.garage_mobile_maintenance_operations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  job_id uuid not null references public.maintenance_jobs(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, job_id, idempotency_key)
);

alter table public.garage_mobile_maintenance_operations enable row level security;
revoke all on table public.garage_mobile_maintenance_operations from public, anon, authenticated;
grant select, insert, update on table public.garage_mobile_maintenance_operations to service_role;

create or replace function public.garage_mobile_update_maintenance(
  p_store_id uuid, p_job_id uuid, p_actor_user_id uuid, p_actor_role text,
  p_idempotency_key text, p_request_fingerprint text, p_status text,
  p_delivery_present boolean, p_delivery_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_operation public.garage_mobile_maintenance_operations%rowtype; v_job jsonb;
begin
  if p_store_id is null or p_job_id is null or p_actor_user_id is null
     or p_actor_role not in ('owner','admin','implementer','staff')
     or char_length(coalesce(p_idempotency_key,'')) not between 8 and 200
     or coalesce(p_request_fingerprint,'') !~ '^[0-9a-f]{64}$'
     or p_status not in ('received','estimating','waiting','working','completed') then
    raise exception using errcode = '22023', message = 'invalid mobile maintenance request';
  end if;
  insert into public.garage_mobile_maintenance_operations(store_id, job_id, idempotency_key, request_fingerprint)
  values (p_store_id, p_job_id, p_idempotency_key, p_request_fingerprint)
  on conflict (store_id, job_id, idempotency_key) do update set updated_at = public.garage_mobile_maintenance_operations.updated_at
  returning * into v_operation;
  if v_operation.request_fingerprint <> p_request_fingerprint then return jsonb_build_object('outcome', 'conflict'); end if;
  if v_operation.result is not null then return jsonb_build_object('outcome', 'replayed', 'job', v_operation.result); end if;
  update public.maintenance_jobs
  set status = p_status, scheduled_delivery_at = case when p_delivery_present then p_delivery_at else scheduled_delivery_at end
  where id = p_job_id and store_id = p_store_id and deleted_at is null returning to_jsonb(maintenance_jobs) into v_job;
  if v_job is null then delete from public.garage_mobile_maintenance_operations where id = v_operation.id; return jsonb_build_object('outcome', 'not_found'); end if;
  update public.garage_mobile_maintenance_operations set result = v_job, updated_at = now() where id = v_operation.id;
  return jsonb_build_object('outcome', 'updated', 'job', v_job);
end;
$$;

revoke all on function public.garage_mobile_update_maintenance(uuid,uuid,uuid,text,text,text,text,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.garage_mobile_update_maintenance(uuid,uuid,uuid,text,text,text,text,boolean,timestamptz) to service_role;
commit;
