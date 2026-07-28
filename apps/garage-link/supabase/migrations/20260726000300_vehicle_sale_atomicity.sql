-- GARAGE LINK G3: vehicle sale atomicity
-- Fail closed on ambiguous legacy data. This migration never guesses which deal won.
begin;

do $$
begin
  if to_regclass('public.sale_correction_cases') is null then
    if exists (
      select 1
      from public.deals d
      where d.status = '成約' and d.deleted_at is null and not coalesce(d.is_archived, false)
      group by d.vehicle_id
      having d.vehicle_id is not null and count(*) > 1
    ) then
      raise exception 'G3_PRECHECK_DUPLICATE_ACTIVE_SALE';
    end if;

    if exists (
      select 1
      from public.deals d
      join public.vehicles v on v.id = d.vehicle_id
      where d.status = '成約'
        and d.deleted_at is null and not coalesce(d.is_archived, false)
        and (d.store_id <> v.store_id or v.status not in ('売約済み', '納車済み'))
    ) then
      raise exception 'G3_PRECHECK_INCONSISTENT_SALE_STATUS';
    end if;
  else
    -- A completed G4-B return deliberately preserves the original delivered deal
    -- and claim while the inspected vehicle can be restocked.  Exclude only that
    -- explicit, scoped history from G3's active-sale precheck; ambiguous legacy
    -- rows continue to fail closed.
    if exists (
      select 1
      from public.deals d
      where d.status = '成約'
        and d.deleted_at is null and not coalesce(d.is_archived, false)
        and not exists (
          select 1
          from public.sale_correction_cases c
          join public.vehicle_sale_claims sc
            on sc.id = c.original_sale_claim_id
           and sc.deal_id = d.id
           and sc.vehicle_id = d.vehicle_id
           and sc.store_id = d.store_id
          where c.deal_id = d.id
            and c.vehicle_id = d.vehicle_id
            and c.store_id = d.store_id
            and c.status in ('processing', 'completed')
            and c.restock_status = 'completed'
        )
      group by d.vehicle_id
      having d.vehicle_id is not null and count(*) > 1
    ) then
      raise exception 'G3_PRECHECK_DUPLICATE_ACTIVE_SALE';
    end if;

    if exists (
      select 1
      from public.deals d
      join public.vehicles v on v.id = d.vehicle_id
      where d.status = '成約'
        and d.deleted_at is null and not coalesce(d.is_archived, false)
        and (
          d.store_id <> v.store_id
          or (
            v.status not in ('売約済み', '納車済み')
            and not exists (
              select 1
              from public.sale_correction_cases c
              join public.vehicle_sale_claims sc
                on sc.id = c.original_sale_claim_id
               and sc.deal_id = d.id
               and sc.vehicle_id = d.vehicle_id
               and sc.store_id = d.store_id
              where c.deal_id = d.id
                and c.vehicle_id = d.vehicle_id
                and c.store_id = d.store_id
                and c.status in ('processing', 'completed')
                and c.restock_status = 'completed'
            )
          )
        )
    ) then
      raise exception 'G3_PRECHECK_INCONSISTENT_SALE_STATUS';
    end if;
  end if;
end;
$$;

create table if not exists public.vehicle_sale_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  store_id uuid not null references public.stores(id),
  vehicle_id uuid not null references public.vehicles(id),
  deal_id uuid not null references public.deals(id),
  status text not null check (status in ('active', 'cancelled', 'delivered')),
  previous_vehicle_status text not null,
  actor_user_id uuid references auth.users(id),
  actor_role text check (actor_role in ('owner', 'admin', 'staff')),
  reserved_at timestamptz not null default now(),
  cancelled_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_sale_claims_one_active_vehicle
  on public.vehicle_sale_claims(vehicle_id) where status = 'active';
create unique index if not exists vehicle_sale_claims_one_active_deal
  on public.vehicle_sale_claims(deal_id) where status = 'active';
create index if not exists vehicle_sale_claims_scope_idx
  on public.vehicle_sale_claims(tenant_id, store_id, vehicle_id, deal_id);

create table if not exists public.vehicle_sale_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  store_id uuid not null references public.stores(id),
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  operation text not null check (operation in ('reserve', 'cancel', 'deliver')),
  vehicle_id uuid not null references public.vehicles(id),
  deal_id uuid not null references public.deals(id),
  request_fingerprint text not null,
  result jsonb not null,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index if not exists vehicle_sale_operations_lookup_idx
  on public.vehicle_sale_operations(tenant_id, store_id, vehicle_id, deal_id);

create unique index if not exists vehicles_id_store_unique on public.vehicles(id, store_id);
create unique index if not exists deals_id_store_unique on public.deals(id, store_id);
create unique index if not exists stores_id_tenant_unique on public.stores(id, tenant_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname='vehicle_sale_claims_vehicle_store_fk') then
    alter table public.vehicle_sale_claims add constraint vehicle_sale_claims_vehicle_store_fk
      foreign key (vehicle_id, store_id) references public.vehicles(id, store_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='vehicle_sale_claims_deal_store_fk') then
    alter table public.vehicle_sale_claims add constraint vehicle_sale_claims_deal_store_fk
      foreign key (deal_id, store_id) references public.deals(id, store_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='vehicle_sale_claims_store_tenant_fk') then
    alter table public.vehicle_sale_claims add constraint vehicle_sale_claims_store_tenant_fk
      foreign key (store_id, tenant_id) references public.stores(id, tenant_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='vehicle_sale_operations_vehicle_store_fk') then
    alter table public.vehicle_sale_operations add constraint vehicle_sale_operations_vehicle_store_fk
      foreign key (vehicle_id, store_id) references public.vehicles(id, store_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='vehicle_sale_operations_deal_store_fk') then
    alter table public.vehicle_sale_operations add constraint vehicle_sale_operations_deal_store_fk
      foreign key (deal_id, store_id) references public.deals(id, store_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='vehicle_sale_operations_store_tenant_fk') then
    alter table public.vehicle_sale_operations add constraint vehicle_sale_operations_store_tenant_fk
      foreign key (store_id, tenant_id) references public.stores(id, tenant_id);
  end if;
end;
$$;

alter table public.vehicle_sale_claims enable row level security;
alter table public.vehicle_sale_operations enable row level security;
drop policy if exists vehicle_sale_claims_select_scope on public.vehicle_sale_claims;
create policy vehicle_sale_claims_select_scope on public.vehicle_sale_claims
  for select to authenticated using (store_id in (select public.current_user_store_ids()));
drop policy if exists vehicle_sale_operations_select_scope on public.vehicle_sale_operations;
create policy vehicle_sale_operations_select_scope on public.vehicle_sale_operations
  for select to authenticated using (store_id in (select public.current_user_store_ids()));
revoke insert, update, delete on public.vehicle_sale_claims from authenticated, anon;
revoke insert, update, delete on public.vehicle_sale_operations from authenticated, anon;
grant select on public.vehicle_sale_claims, public.vehicle_sale_operations to authenticated;

create or replace function public.guard_deal_sale_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status <> '成約' and new.status = '成約' and not exists (
    select 1 from public.vehicle_sale_claims c
    where c.deal_id = new.id and c.vehicle_id = new.vehicle_id and c.store_id = new.store_id and c.status = 'active'
  ) then
    raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC';
  end if;
  if old.status = '成約' and new.status <> '成約' and coalesce((
    select c.status from public.vehicle_sale_claims c where c.deal_id = old.id order by c.created_at desc, c.id desc limit 1
  ), '') <> 'cancelled' then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  if exists (select 1 from public.vehicle_sale_claims c where c.deal_id = old.id and c.status in ('active', 'delivered'))
     and (new.deleted_at is distinct from old.deleted_at or new.is_archived is distinct from old.is_archived
       or new.vehicle_id is distinct from old.vehicle_id or new.store_id is distinct from old.store_id) then
    raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC';
  end if;
  return new;
end;
$$;

create or replace function public.guard_vehicle_sale_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status not in ('売約済み', 'sold') and new.status in ('売約済み', 'sold') and not exists (
    select 1 from public.vehicle_sale_claims c where c.vehicle_id = new.id and c.store_id = new.store_id and c.status = 'active'
  ) then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  if old.status in ('売約済み', 'sold') and new.status in ('納車済み', 'delivered') and not exists (
    select 1 from public.vehicle_sale_claims c where c.vehicle_id = new.id and c.status = 'delivered'
  ) then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  if old.status in ('売約済み', '納車済み', 'sold', 'delivered')
     and new.status not in ('売約済み', '納車済み', 'sold', 'delivered') and coalesce((
    select c.status from public.vehicle_sale_claims c where c.vehicle_id = old.id order by c.created_at desc, c.id desc limit 1
  ), '') <> 'cancelled' then raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC'; end if;
  if exists (select 1 from public.vehicle_sale_claims c where c.vehicle_id = old.id and c.status in ('active', 'delivered'))
     and (new.store_id is distinct from old.store_id or new.deleted_at is distinct from old.deleted_at
       or new.is_archived is distinct from old.is_archived) then
    raise exception 'SALE_TRANSITION_REQUIRES_ATOMIC_RPC';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_deal_sale_transition on public.deals;
create trigger guard_deal_sale_transition before update on public.deals
  for each row execute function public.guard_deal_sale_transition();
drop trigger if exists guard_vehicle_sale_transition on public.vehicles;
create trigger guard_vehicle_sale_transition before update on public.vehicles
  for each row execute function public.guard_vehicle_sale_transition();

create or replace function public.reserve_vehicle_sale(
  p_deal_id uuid,
  p_idempotency_key text,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_deal public.deals%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_store public.stores%rowtype;
  v_role text;
  v_existing public.vehicle_sale_operations%rowtype;
  v_claim public.vehicle_sale_claims%rowtype;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  if not found or v_deal.deleted_at is not null or coalesce(v_deal.is_archived, false) then
    return jsonb_build_object('ok', false, 'code', 'DEAL_NOT_FOUND');
  end if;
  if v_deal.vehicle_id is null then return jsonb_build_object('ok', false, 'code', 'VEHICLE_NOT_FOUND'); end if;
  select * into v_vehicle from public.vehicles where id = v_deal.vehicle_id for update;
  if not found or v_vehicle.deleted_at is not null or coalesce(v_vehicle.is_archived, false) then
    return jsonb_build_object('ok', false, 'code', 'VEHICLE_NOT_FOUND');
  end if;
  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found or v_deal.vehicle_id is distinct from v_vehicle.id or v_deal.deleted_at is not null or coalesce(v_deal.is_archived, false) then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT');
  end if;
  select * into v_store from public.stores where id = v_deal.store_id and status = 'active';
  if not found or v_store.tenant_id is null or v_vehicle.store_id <> v_deal.store_id then
    return jsonb_build_object('ok', false, 'code', 'SCOPE_FORBIDDEN');
  end if;
  if v_deal.customer_id is not null and not exists (
    select 1 from public.customers c where c.id = v_deal.customer_id and c.store_id = v_deal.store_id
      and c.deleted_at is null and not coalesce(c.is_archived, false)
  ) then return jsonb_build_object('ok', false, 'code', 'SCOPE_FORBIDDEN'); end if;
  select public.current_user_store_role(v_deal.store_id) into v_role;
  if v_role is null then return jsonb_build_object('ok', false, 'code', 'SCOPE_FORBIDDEN'); end if;
  if v_role not in ('owner', 'admin', 'staff') then return jsonb_build_object('ok', false, 'code', 'ROLE_FORBIDDEN'); end if;

  v_fingerprint := encode(digest(concat_ws(':', 'reserve', v_store.tenant_id, v_deal.store_id, v_vehicle.id, v_deal.id), 'sha256'), 'hex');
  select * into v_existing from public.vehicle_sale_operations
    where tenant_id = v_store.tenant_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.result;
  end if;

  select * into v_claim from public.vehicle_sale_claims where vehicle_id = v_vehicle.id and status = 'active' for update;
  if found then
    if v_claim.deal_id <> v_deal.id then return jsonb_build_object('ok', false, 'code', 'ALREADY_RESERVED'); end if;
    v_result := jsonb_build_object('ok', true, 'code', 'ALREADY_COMPLETED', 'vehicleId', v_vehicle.id, 'dealId', v_deal.id, 'claimId', v_claim.id);
  else
    if v_vehicle.status not in ('在庫中', '展示中', '商談中', '整備中', 'in_stock')
       or v_deal.status in ('成約', '失注') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS');
    end if;
    insert into public.vehicle_sale_claims(tenant_id, store_id, vehicle_id, deal_id, status, previous_vehicle_status, actor_user_id, actor_role)
      values (v_store.tenant_id, v_deal.store_id, v_vehicle.id, v_deal.id, 'active', v_vehicle.status, v_actor, v_role)
      returning * into v_claim;
    update public.vehicles set status = '売約済み', sold_date = current_date, updated_at = now() where id = v_vehicle.id;
    update public.deals set status = '成約', updated_at = now() where id = v_deal.id;
    v_result := jsonb_build_object('ok', true, 'code', 'RESERVED', 'vehicleId', v_vehicle.id, 'dealId', v_deal.id, 'claimId', v_claim.id);
    insert into public.audit_logs(store_id, user_id, user_role, action, target_type, target_id, before_data, after_data, metadata)
      values (v_deal.store_id, v_actor, v_role, 'vehicle_sale_reserved', 'vehicle', v_vehicle.id,
        jsonb_build_object('vehicleStatus', v_vehicle.status, 'dealStatus', v_deal.status),
        jsonb_build_object('vehicleStatus', '売約済み', 'dealStatus', '成約'),
        jsonb_build_object('dealId', v_deal.id, 'idempotencyKeyHash', encode(digest(p_idempotency_key, 'sha256'), 'hex'), 'correlationId', left(p_correlation_id, 100)));
  end if;
  insert into public.vehicle_sale_operations(tenant_id, store_id, idempotency_key, operation, vehicle_id, deal_id, request_fingerprint, result, actor_user_id)
    values (v_store.tenant_id, v_deal.store_id, p_idempotency_key, 'reserve', v_vehicle.id, v_deal.id, v_fingerprint, v_result, v_actor);
  return v_result;
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'CONFLICT');
when serialization_failure or deadlock_detected then
  return jsonb_build_object('ok', false, 'code', 'TEMPORARY_FAILURE');
end;
$$;

create or replace function public.cancel_vehicle_sale(
  p_deal_id uuid,
  p_idempotency_key text,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid(); v_deal public.deals%rowtype; v_vehicle public.vehicles%rowtype;
  v_store public.stores%rowtype; v_role text; v_existing public.vehicle_sale_operations%rowtype;
  v_claim public.vehicle_sale_claims%rowtype; v_fingerprint text; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  select * into v_deal from public.deals where id = p_deal_id;
  if not found or v_deal.vehicle_id is null then return jsonb_build_object('ok', false, 'code', 'DEAL_NOT_FOUND'); end if;
  select * into v_vehicle from public.vehicles where id = v_deal.vehicle_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'VEHICLE_NOT_FOUND'); end if;
  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found or v_deal.vehicle_id is distinct from v_vehicle.id then return jsonb_build_object('ok', false, 'code', 'CONFLICT'); end if;
  select * into v_store from public.stores where id = v_deal.store_id and status = 'active';
  if not found or v_store.tenant_id is null or v_vehicle.store_id <> v_deal.store_id then return jsonb_build_object('ok', false, 'code', 'SCOPE_FORBIDDEN'); end if;
  select public.current_user_store_role(v_deal.store_id) into v_role;
  if v_role not in ('owner', 'admin', 'staff') then return jsonb_build_object('ok', false, 'code', case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fingerprint := encode(digest(concat_ws(':', 'cancel', v_store.tenant_id, v_deal.store_id, v_vehicle.id, v_deal.id), 'sha256'), 'hex');
  select * into v_existing from public.vehicle_sale_operations where tenant_id = v_store.tenant_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.result;
  end if;
  select * into v_claim from public.vehicle_sale_claims where vehicle_id = v_vehicle.id and deal_id = v_deal.id order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SALE_NOT_FOUND'); end if;
  if v_claim.status = 'cancelled' then
    v_result := jsonb_build_object('ok', true, 'code', 'ALREADY_COMPLETED', 'vehicleId', v_vehicle.id, 'dealId', v_deal.id, 'claimId', v_claim.id);
  elsif v_claim.status = 'delivered' or v_vehicle.status in ('納車済み', 'delivered') then
    return jsonb_build_object('ok', false, 'code', 'DELIVERED_CANNOT_CANCEL');
  elsif exists (select 1 from public.invoices i where i.deal_id = v_deal.id and i.deleted_at is null and coalesce(i.issue_status, '') <> 'cancelled')
     or exists (select 1 from public.payment_items p where p.deal_id = v_deal.id and coalesce(p.amount, 0) > 0) then
    return jsonb_build_object('ok', false, 'code', 'FINANCIAL_RECORD_EXISTS');
  else
    update public.vehicle_sale_claims set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = v_claim.id;
    update public.vehicles set status = v_claim.previous_vehicle_status, sold_date = null, updated_at = now() where id = v_vehicle.id;
    update public.deals set status = '失注', updated_at = now() where id = v_deal.id;
    v_result := jsonb_build_object('ok', true, 'code', 'CANCELLED', 'vehicleId', v_vehicle.id, 'dealId', v_deal.id, 'claimId', v_claim.id);
    insert into public.audit_logs(store_id, user_id, user_role, action, target_type, target_id, before_data, after_data, metadata)
      values (v_deal.store_id, v_actor, v_role, 'vehicle_sale_cancelled', 'vehicle', v_vehicle.id,
        jsonb_build_object('vehicleStatus', v_vehicle.status, 'dealStatus', v_deal.status),
        jsonb_build_object('vehicleStatus', v_claim.previous_vehicle_status, 'dealStatus', '失注'),
        jsonb_build_object('dealId', v_deal.id, 'idempotencyKeyHash', encode(digest(p_idempotency_key, 'sha256'), 'hex'), 'correlationId', left(p_correlation_id, 100)));
  end if;
  insert into public.vehicle_sale_operations(tenant_id, store_id, idempotency_key, operation, vehicle_id, deal_id, request_fingerprint, result, actor_user_id)
    values (v_store.tenant_id, v_deal.store_id, p_idempotency_key, 'cancel', v_vehicle.id, v_deal.id, v_fingerprint, v_result, v_actor);
  return v_result;
exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'CONFLICT');
when serialization_failure or deadlock_detected then return jsonb_build_object('ok', false, 'code', 'TEMPORARY_FAILURE');
end;
$$;

create or replace function public.complete_vehicle_delivery(
  p_deal_id uuid,
  p_idempotency_key text,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid(); v_deal public.deals%rowtype; v_vehicle public.vehicles%rowtype;
  v_store public.stores%rowtype; v_role text; v_existing public.vehicle_sale_operations%rowtype;
  v_claim public.vehicle_sale_claims%rowtype; v_fingerprint text; v_result jsonb;
begin
  if v_actor is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  select * into v_deal from public.deals where id = p_deal_id;
  if not found or v_deal.vehicle_id is null then return jsonb_build_object('ok', false, 'code', 'DEAL_NOT_FOUND'); end if;
  select * into v_vehicle from public.vehicles where id = v_deal.vehicle_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'VEHICLE_NOT_FOUND'); end if;
  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found or v_deal.vehicle_id is distinct from v_vehicle.id then return jsonb_build_object('ok', false, 'code', 'CONFLICT'); end if;
  select * into v_store from public.stores where id = v_deal.store_id and status = 'active';
  if not found or v_store.tenant_id is null or v_vehicle.store_id <> v_deal.store_id then return jsonb_build_object('ok', false, 'code', 'SCOPE_FORBIDDEN'); end if;
  select public.current_user_store_role(v_deal.store_id) into v_role;
  if v_role not in ('owner', 'admin', 'staff') then return jsonb_build_object('ok', false, 'code', case when v_role is null then 'SCOPE_FORBIDDEN' else 'ROLE_FORBIDDEN' end); end if;
  v_fingerprint := encode(digest(concat_ws(':', 'deliver', v_store.tenant_id, v_deal.store_id, v_vehicle.id, v_deal.id), 'sha256'), 'hex');
  select * into v_existing from public.vehicle_sale_operations where tenant_id = v_store.tenant_id and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return v_existing.result;
  end if;
  select * into v_claim from public.vehicle_sale_claims where vehicle_id = v_vehicle.id and deal_id = v_deal.id order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SALE_NOT_FOUND'); end if;
  if v_claim.status = 'delivered' then
    v_result := jsonb_build_object('ok', true, 'code', 'ALREADY_COMPLETED', 'vehicleId', v_vehicle.id, 'dealId', v_deal.id, 'claimId', v_claim.id);
  elsif v_claim.status <> 'active' or v_vehicle.status <> '売約済み' or v_deal.status <> '成約' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS');
  else
    update public.vehicle_sale_claims set status = 'delivered', delivered_at = now(), updated_at = now() where id = v_claim.id;
    update public.vehicles set status = '納車済み', updated_at = now() where id = v_vehicle.id;
    v_result := jsonb_build_object('ok', true, 'code', 'DELIVERED', 'vehicleId', v_vehicle.id, 'dealId', v_deal.id, 'claimId', v_claim.id);
    insert into public.audit_logs(store_id, user_id, user_role, action, target_type, target_id, before_data, after_data, metadata)
      values (v_deal.store_id, v_actor, v_role, 'vehicle_delivery_completed', 'vehicle', v_vehicle.id,
        jsonb_build_object('vehicleStatus', v_vehicle.status, 'dealStatus', v_deal.status),
        jsonb_build_object('vehicleStatus', '納車済み', 'dealStatus', v_deal.status),
        jsonb_build_object('dealId', v_deal.id, 'idempotencyKeyHash', encode(digest(p_idempotency_key, 'sha256'), 'hex'), 'correlationId', left(p_correlation_id, 100)));
  end if;
  insert into public.vehicle_sale_operations(tenant_id, store_id, idempotency_key, operation, vehicle_id, deal_id, request_fingerprint, result, actor_user_id)
    values (v_store.tenant_id, v_deal.store_id, p_idempotency_key, 'deliver', v_vehicle.id, v_deal.id, v_fingerprint, v_result, v_actor);
  return v_result;
exception when unique_violation then return jsonb_build_object('ok', false, 'code', 'CONFLICT');
when serialization_failure or deadlock_detected then return jsonb_build_object('ok', false, 'code', 'TEMPORARY_FAILURE');
end;
$$;

revoke all on function public.reserve_vehicle_sale(uuid, text, text) from public, anon;
revoke all on function public.cancel_vehicle_sale(uuid, text, text) from public, anon;
revoke all on function public.complete_vehicle_delivery(uuid, text, text) from public, anon;
grant execute on function public.reserve_vehicle_sale(uuid, text, text) to authenticated;
grant execute on function public.cancel_vehicle_sale(uuid, text, text) to authenticated;
grant execute on function public.complete_vehicle_delivery(uuid, text, text) to authenticated;

-- Backfill only records that are already unambiguous and status-consistent.
insert into public.vehicle_sale_claims(tenant_id, store_id, vehicle_id, deal_id, status, previous_vehicle_status, actor_user_id, actor_role)
select s.tenant_id, d.store_id, d.vehicle_id, d.id,
  case when v.status = '納車済み' then 'delivered' else 'active' end,
  '在庫中', null, null
from public.deals d
join public.vehicles v on v.id = d.vehicle_id and v.store_id = d.store_id
join public.stores s on s.id = d.store_id
where d.status = '成約' and d.deleted_at is null and not coalesce(d.is_archived, false)
  and v.status in ('売約済み', '納車済み')
  and not exists (select 1 from public.vehicle_sale_claims c where c.deal_id = d.id)
on conflict do nothing;

commit;
