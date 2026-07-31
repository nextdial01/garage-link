-- GARAGE LINK Commercial Remediation Batch 1B
-- Forward-only local migration. Production/Current application is prohibited.

alter table public.company_subscriptions
  add column if not exists restoration_state text not null default 'none',
  add column if not exists snapshot_observed_at timestamptz;
alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_restoration_state_check;
alter table public.company_subscriptions
  add constraint company_subscriptions_restoration_state_check
  check (restoration_state in ('none', 'pending', 'restored', 'failed'));

alter table public.stripe_webhook_events
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_attempt_at timestamptz;
alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_status_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_status_check
  check (status in ('processing', 'completed', 'failed', 'retry_scheduled', 'dead_letter'));

alter table public.billing_sync_operations
  add column if not exists stripe_request_id text,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists target_plan text,
  add column if not exists target_options jsonb not null default '{}'::jsonb;

create table if not exists public.garage_plan_entitlements (
  plan text primary key check (plan in ('free', 'starter', 'standard', 'pro')),
  gross_monthly_price integer not null check (gross_monthly_price >= 0),
  net_basis_monthly_price integer not null check (net_basis_monthly_price >= 0),
  inventory_limit integer not null check (inventory_limit > 0),
  staff_limit integer not null check (staff_limit > 0),
  store_limit integer not null check (store_limit > 0),
  storage_limit_mb integer not null check (storage_limit_mb > 0),
  quote_invoice_limit integer check (quote_invoice_limit is null or quote_invoice_limit > 0),
  extra_staff_allowed boolean not null,
  extra_store_allowed boolean not null,
  extra_storage_allowed boolean not null,
  l_link_availability text not null check (l_link_availability in ('unavailable', 'preparing')),
  updated_at timestamptz not null default now()
);
alter table public.garage_plan_entitlements enable row level security;
revoke insert, update, delete on public.garage_plan_entitlements from anon, authenticated;
grant select on public.garage_plan_entitlements to anon, authenticated;
grant all on public.garage_plan_entitlements to service_role;

insert into public.garage_plan_entitlements(
  plan, gross_monthly_price, net_basis_monthly_price, inventory_limit,
  staff_limit, store_limit, storage_limit_mb, quote_invoice_limit,
  extra_staff_allowed, extra_store_allowed, extra_storage_allowed, l_link_availability
) values
  ('free', 0, 0, 5, 1, 1, 500, 5, false, false, false, 'unavailable'),
  ('starter', 7480, 6800, 50, 1, 1, 2048, 20, true, false, true, 'unavailable'),
  ('standard', 16280, 14800, 200, 3, 1, 10240, null, true, true, true, 'preparing'),
  ('pro', 32780, 29800, 500, 10, 3, 51200, null, true, true, true, 'preparing')
on conflict (plan) do update set
  gross_monthly_price = excluded.gross_monthly_price,
  net_basis_monthly_price = excluded.net_basis_monthly_price,
  inventory_limit = excluded.inventory_limit,
  staff_limit = excluded.staff_limit,
  store_limit = excluded.store_limit,
  storage_limit_mb = excluded.storage_limit_mb,
  quote_invoice_limit = excluded.quote_invoice_limit,
  extra_staff_allowed = excluded.extra_staff_allowed,
  extra_store_allowed = excluded.extra_store_allowed,
  extra_storage_allowed = excluded.extra_storage_allowed,
  l_link_availability = excluded.l_link_availability,
  updated_at = now();

create or replace function public.garage_effective_billing_state(
  p_stripe_status text,
  p_billing_state text,
  p_grace_ends_at timestamptz,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz,
  p_cancelled_at timestamptz,
  p_restoration_state text,
  p_now timestamptz default clock_timestamp()
) returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_restoration_state in ('pending', 'failed') then 'reconciliation_required'
    when p_stripe_status = 'canceled' or p_cancelled_at is not null then 'canceled'
    when p_stripe_status = 'past_due'
      and p_grace_ends_at is not null
      and p_grace_ends_at > p_now then 'grace_period'
    when p_stripe_status = 'past_due' then 'restricted'
    when p_stripe_status = 'incomplete' then 'initial_payment_pending'
    when p_stripe_status in ('incomplete_expired', 'unpaid') then 'unpaid'
    when p_stripe_status = 'paused' then 'restricted'
    when p_cancel_at_period_end
      and (p_current_period_end is null or p_current_period_end <= p_now) then 'canceled'
    when p_cancel_at_period_end then 'cancellation_scheduled'
    when p_stripe_status in ('active', 'trialing') then 'active'
    else coalesce(nullif(p_billing_state, ''), 'reconciliation_required')
  end
$$;
revoke all on function public.garage_effective_billing_state(text,text,timestamptz,boolean,timestamptz,timestamptz,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.garage_effective_billing_state(text,text,timestamptz,boolean,timestamptz,timestamptz,text,timestamptz)
  to service_role, authenticated;

create table if not exists public.garage_subscription_leases (
  stripe_subscription_id text primary key,
  lease_owner text not null,
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.garage_subscription_leases enable row level security;
revoke all on public.garage_subscription_leases from public, anon, authenticated;
grant all on public.garage_subscription_leases to service_role;

create or replace function public.claim_garage_subscription_lease(
  p_subscription_id text,
  p_lease_owner text,
  p_lease_seconds integer default 60
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_claimed boolean;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if nullif(p_subscription_id, '') is null or nullif(p_lease_owner, '') is null
    or p_lease_seconds not between 5 and 300 then
    raise exception using errcode = '22023', message = 'invalid_subscription_lease';
  end if;
  insert into public.garage_subscription_leases(
    stripe_subscription_id, lease_owner, lease_expires_at
  ) values (
    p_subscription_id, p_lease_owner, clock_timestamp() + make_interval(secs => p_lease_seconds)
  )
  on conflict (stripe_subscription_id) do update set
    lease_owner = excluded.lease_owner,
    lease_expires_at = excluded.lease_expires_at,
    updated_at = now()
  where garage_subscription_leases.lease_owner = excluded.lease_owner
     or garage_subscription_leases.lease_expires_at <= clock_timestamp()
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end $$;

create or replace function public.release_garage_subscription_lease(
  p_subscription_id text, p_lease_owner text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  delete from public.garage_subscription_leases
  where stripe_subscription_id = p_subscription_id and lease_owner = p_lease_owner;
  return found;
end $$;
revoke all on function public.claim_garage_subscription_lease(text,text,integer) from public, anon, authenticated;
revoke all on function public.release_garage_subscription_lease(text,text) from public, anon, authenticated;
grant execute on function public.claim_garage_subscription_lease(text,text,integer) to service_role;
grant execute on function public.release_garage_subscription_lease(text,text) to service_role;

drop index if exists public.billing_sync_operations_one_open_checkout_uidx;
create unique index if not exists billing_sync_operations_one_open_mutation_uidx
  on public.billing_sync_operations(tenant_id)
  where operation_type in ('checkout', 'change_plan', 'change_option', 'cancel', 'restoration')
    and status in ('started', 'stripe_applied', 'reconciliation_required', 'retry_scheduled');

create or replace function public.begin_garage_billing_operation(
  p_tenant_id uuid,
  p_company_id uuid,
  p_actor_user_id uuid,
  p_operation_type text,
  p_idempotency_key text,
  p_target_plan text default null,
  p_target_options jsonb default '{}'::jsonb,
  p_stripe_subscription_id text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row public.billing_sync_operations%rowtype;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_operation_type not in ('checkout','change_plan','change_option','cancel','restoration') then
    raise exception using errcode = '22023', message = 'invalid_billing_operation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  select * into v_row from public.billing_sync_operations
  where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
  if found then
    if v_row.operation_type <> p_operation_type
      or v_row.requested_plan is distinct from p_target_plan
      or v_row.requested_options is distinct from coalesce(p_target_options, '{}'::jsonb) then
      raise exception using errcode = '23505', message = 'idempotency_payload_conflict';
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'id', v_row.id, 'status', v_row.status);
  end if;
  if exists (
    select 1 from public.billing_sync_operations
    where tenant_id = p_tenant_id
      and operation_type in ('checkout','change_plan','change_option','cancel','restoration')
      and status in ('started','stripe_applied','reconciliation_required','retry_scheduled')
  ) then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;
  insert into public.billing_sync_operations(
    tenant_id, company_id, actor_user_id, operation_type, idempotency_key,
    requested_plan, requested_options, target_plan, target_options,
    stripe_subscription_id, status
  ) values (
    p_tenant_id, p_company_id, p_actor_user_id, p_operation_type, p_idempotency_key,
    p_target_plan, coalesce(p_target_options, '{}'::jsonb), p_target_plan,
    coalesce(p_target_options, '{}'::jsonb), p_stripe_subscription_id, 'started'
  ) returning * into v_row;
  return jsonb_build_object('ok', true, 'duplicate', false, 'id', v_row.id, 'status', v_row.status);
end $$;
revoke all on function public.begin_garage_billing_operation(uuid,uuid,uuid,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.begin_garage_billing_operation(uuid,uuid,uuid,text,text,text,jsonb,text)
  to service_role;

create or replace function public.claim_garage_webhook_retry(
  p_worker_id text,
  p_lease_seconds integer default 60,
  p_limit integer default 25,
  p_event_id text default null
) returns setof public.stripe_webhook_events
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  return query
  with candidates as (
    select id from public.stripe_webhook_events
    where (p_event_id is null or stripe_event_id = p_event_id)
    and ((
      status in ('failed', 'retry_scheduled')
      and coalesce(next_retry_at, '-infinity'::timestamptz) <= clock_timestamp()
    ) or (
      status = 'processing' and lease_expires_at <= clock_timestamp()
    ) or (
      p_event_id is not null and stripe_event_id = p_event_id and status = 'dead_letter'
    ))
    order by created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.stripe_webhook_events e set
    status = 'processing',
    lease_owner = p_worker_id,
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
    last_attempt_at = clock_timestamp(),
    operator_action_required = false
  from candidates c where e.id = c.id
  returning e.*;
end $$;
revoke all on function public.claim_garage_webhook_retry(text,integer,integer,text)
  from public, anon, authenticated;
grant execute on function public.claim_garage_webhook_retry(text,integer,integer,text) to service_role;

create or replace function public.claim_garage_billing_operations(
  p_worker_id text, p_lease_seconds integer default 60, p_limit integer default 25
) returns setof public.billing_sync_operations
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  return query
  with candidates as (
    select id from public.billing_sync_operations
    where (
        status in ('stripe_applied','reconciliation_required','retry_scheduled')
        or (
          status = 'started'
          and stripe_subscription_id is not null
          and started_at <= clock_timestamp() - interval '1 minute'
        )
      )
      and coalesce(next_retry_at, '-infinity'::timestamptz) <= clock_timestamp()
      and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
    order by created_at for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.billing_sync_operations o set
    lease_owner = p_worker_id,
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  from candidates c where o.id = c.id returning o.*;
end $$;
revoke all on function public.claim_garage_billing_operations(text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_garage_billing_operations(text,integer,integer) to service_role;

create or replace function public.apply_garage_subscription_snapshot_v3(
  p_company_id uuid,
  p_plan text,
  p_stripe_status text,
  p_customer_id text,
  p_subscription_id text,
  p_source_event_id text,
  p_snapshot_observed_at timestamptz,
  p_grace_ends_at timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_current_period_end timestamptz default null,
  p_invoice_id text default null,
  p_extra_staff_count integer default 0,
  p_extra_store_count integer default 0,
  p_extra_storage_gb integer default 0,
  p_restoration_state text default 'none'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_row public.company_subscriptions%rowtype;
  v_contract public.garage_plan_entitlements%rowtype;
  v_state text;
  v_legacy_status text;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_snapshot_observed_at is null or nullif(p_source_event_id, '') is null then
    raise exception using errcode = '22023', message = 'authoritative_snapshot_required';
  end if;
  select tenant_id into v_tenant from public.stores where id = p_company_id;
  if v_tenant is null then raise exception using errcode = '23503', message = 'subscription_store_scope_not_found'; end if;
  select * into v_contract from public.garage_plan_entitlements where plan = p_plan;
  if not found or p_plan = 'free' then raise exception using errcode = '22023', message = 'invalid_paid_plan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_subscription_id, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text, 0));
  select * into v_row from public.company_subscriptions
  where tenant_id = v_tenant order by updated_at desc limit 1 for update;
  if found
    and v_row.stripe_subscription_id is not null
    and v_row.stripe_subscription_id <> p_subscription_id
    and v_row.billing_state <> 'canceled' then
    return jsonb_build_object(
      'ok', true, 'applied', false, 'reason', 'superseded_subscription'
    );
  end if;
  v_state := public.garage_effective_billing_state(
    p_stripe_status, null, p_grace_ends_at, p_cancel_at_period_end,
    p_current_period_end, case when p_stripe_status = 'canceled' then now() else null end,
    p_restoration_state, clock_timestamp()
  );
  v_legacy_status := case
    when v_state in ('active','grace_period','cancellation_scheduled') then 'active'
    when v_state = 'canceled' then 'cancelled'
    when v_state = 'initial_payment_pending' then 'trialing'
    when v_state = 'restricted' then 'suspended'
    else 'past_due'
  end;
  if found then
    update public.company_subscriptions set
      plan = p_plan, status = v_legacy_status, stripe_status = p_stripe_status,
      billing_state = v_state, included_staff_count = v_contract.staff_limit,
      included_store_count = v_contract.store_limit, storage_limit_mb = v_contract.storage_limit_mb,
      current_inventory_limit = v_contract.inventory_limit,
      extra_staff_count = greatest(p_extra_staff_count, 0),
      extra_store_count = greatest(p_extra_store_count, 0),
      extra_storage_gb = greatest(p_extra_storage_gb, 0),
      l_link_integration_enabled = false,
      stripe_customer_id = p_customer_id, stripe_subscription_id = p_subscription_id,
      grace_ends_at = p_grace_ends_at, cancel_at_period_end = p_cancel_at_period_end,
      current_period_end = p_current_period_end, last_invoice_id = coalesce(p_invoice_id, last_invoice_id),
      last_stripe_event_id = p_source_event_id, snapshot_observed_at = p_snapshot_observed_at,
      restoration_state = p_restoration_state, reconciliation_required = false,
      reconciliation_requested_at = null,
      cancelled_at = case when v_state = 'canceled' then coalesce(cancelled_at, now()) else null end,
      data_delete_scheduled_at = case when v_state = 'canceled'
        then coalesce(data_delete_scheduled_at, now() + interval '1 year') else null end,
      updated_at = now()
    where id = v_row.id;
  else
    insert into public.company_subscriptions(
      company_id, tenant_id, plan, status, stripe_status, billing_state,
      included_staff_count, included_store_count, storage_limit_mb, current_inventory_limit,
      extra_staff_count, extra_store_count, extra_storage_gb, l_link_integration_enabled,
      stripe_customer_id, stripe_subscription_id, grace_ends_at, cancel_at_period_end,
      current_period_end, last_invoice_id, last_stripe_event_id, snapshot_observed_at,
      restoration_state, cancelled_at, data_delete_scheduled_at
    ) values (
      p_company_id, v_tenant, p_plan, v_legacy_status, p_stripe_status, v_state,
      v_contract.staff_limit, v_contract.store_limit, v_contract.storage_limit_mb,
      v_contract.inventory_limit, greatest(p_extra_staff_count,0), greatest(p_extra_store_count,0),
      greatest(p_extra_storage_gb,0), false, p_customer_id, p_subscription_id,
      p_grace_ends_at, p_cancel_at_period_end, p_current_period_end, p_invoice_id,
      p_source_event_id, p_snapshot_observed_at, p_restoration_state,
      case when v_state = 'canceled' then now() else null end,
      case when v_state = 'canceled' then now() + interval '1 year' else null end
    );
  end if;
  update public.billing_sync_operations set
    status = 'completed', completed_at = now(), lease_owner = null, lease_expires_at = null,
    error_code = null, diagnostic_code = null, operator_action_required = false
  where tenant_id = v_tenant
    and (stripe_subscription_id = p_subscription_id or operation_type = 'checkout')
    and status in ('started','stripe_applied','reconciliation_required','retry_scheduled');
  return jsonb_build_object('ok', true, 'applied', true, 'billing_state', v_state);
end $$;
revoke all on function public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text)
  from public, anon, authenticated;
grant execute on function public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text)
  to service_role;

create or replace function public.garage_plan_limit_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_store_id uuid; v_tenant_id uuid; v_store_ids uuid[];
  v_subscription public.company_subscriptions%rowtype;
  v_contract public.garage_plan_entitlements%rowtype;
  v_count bigint; v_limit bigint; v_used_bytes bigint;
begin
  if tg_table_name = 'stores' then v_store_id:=new.id; v_tenant_id:=new.tenant_id;
  elsif tg_table_name = 'memberships' then v_store_id:=new.store_id; v_tenant_id:=new.tenant_id;
  else v_store_id:=new.store_id; end if;
  if v_tenant_id is null then select tenant_id into v_tenant_id from public.stores where id=v_store_id; end if;
  if v_tenant_id is null then raise exception using errcode='23514',message='tenant scope is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text,714001));
  select coalesce(array_agg(id),array[]::uuid[]) into v_store_ids from public.stores where tenant_id=v_tenant_id;
  select * into v_subscription from public.company_subscriptions
    where tenant_id=v_tenant_id order by updated_at desc nulls last limit 1 for share;
  select * into v_contract from public.garage_plan_entitlements
    where plan=case when found then v_subscription.plan else 'free' end;
  if not found then raise exception using errcode='23514',message='plan entitlement contract missing'; end if;

  if tg_table_name='vehicles' then
    if new.deleted_at is null and coalesce(new.is_archived,false)=false
      and lower(coalesce(new.status,'')) not in ('売却済み','納車済み','sold','delivered','archived','deleted') then
      select count(*) into v_count from public.vehicles v where v.store_id=any(v_store_ids)
        and v.id is distinct from new.id and v.deleted_at is null and coalesce(v.is_archived,false)=false
        and lower(coalesce(v.status,'')) not in ('売却済み','納車済み','sold','delivered','archived','deleted');
      if v_count>=v_contract.inventory_limit then
        raise exception using errcode='P0001',message='契約全店舗の在庫登録上限に達しています。';
      end if;
    end if;
  elsif tg_table_name in ('quotes','invoices') and v_contract.quote_invoice_limit is not null then
    select (select count(*) from public.quotes q where q.store_id=any(v_store_ids) and q.created_at>=date_trunc('month',now()))
      +(select count(*) from public.invoices i where i.store_id=any(v_store_ids) and i.created_at>=date_trunc('month',now()))
      into v_count;
    if v_count>=v_contract.quote_invoice_limit then
      raise exception using errcode='P0001',message='契約全店舗の今月の帳票作成上限に達しています。';
    end if;
  elsif tg_table_name='uploaded_files' then
    v_limit:=(v_contract.storage_limit_mb+coalesce(v_subscription.extra_storage_gb,0)*1024)::bigint*1024*1024;
    select coalesce(sum(size_bytes),0) into v_used_bytes from public.uploaded_files
      where tenant_id=v_tenant_id and deleted_at is null;
    if v_used_bytes+new.size_bytes>v_limit then
      raise exception using errcode='P0001',message='契約全店舗のストレージ上限に達しています。';
    end if;
  elsif tg_table_name='memberships' then
    if new.status='active' and new.deleted_at is null then
      v_limit:=v_contract.staff_limit+coalesce(v_subscription.extra_staff_count,0);
      select count(distinct m.user_id) into v_count from public.memberships m
        where m.tenant_id=v_tenant_id and m.id is distinct from new.id and m.status='active'
          and m.deleted_at is null and m.disabled_at is null and m.user_id is not null;
      if v_count>=v_limit then
        raise exception using errcode='P0001',message='契約全店舗のスタッフ上限に達しています。';
      end if;
    end if;
  elsif tg_table_name='stores' then
    v_limit:=v_contract.store_limit+coalesce(v_subscription.extra_store_count,0);
    select count(*) into v_count from public.stores s where s.tenant_id=v_tenant_id and s.id is distinct from new.id;
    if v_count>=v_limit then
      raise exception using errcode='P0001',message='契約の店舗上限に達しています。';
    end if;
  end if;
  return new;
end $$;

create or replace function public.garage_billing_access_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_tenant uuid; v_subscription public.company_subscriptions%rowtype; v_state text;
begin
  if tg_table_name in ('stores', 'memberships', 'uploaded_files') then
    v_tenant := new.tenant_id;
  else
    select tenant_id into v_tenant from public.stores where id = new.store_id;
  end if;
  if v_tenant is null then raise exception using errcode='23503', message='billing_tenant_scope_missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text, 0));
  select * into v_subscription from public.company_subscriptions
  where tenant_id = v_tenant order by updated_at desc limit 1 for update;
  if found then
    v_state := public.garage_effective_billing_state(
      v_subscription.stripe_status, v_subscription.billing_state, v_subscription.grace_ends_at,
      v_subscription.cancel_at_period_end, v_subscription.current_period_end,
      v_subscription.cancelled_at, v_subscription.restoration_state, clock_timestamp()
    );
    if v_state not in ('active','grace_period','cancellation_scheduled') then
      raise exception using errcode='42501', message='billing_access_restricted';
    end if;
  end if;
  return new;
end $$;

create or replace function public.get_member_contract_access()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user_id uuid := auth.uid(); v_store_id uuid; v_tenant_id uuid;
  v_subscription public.company_subscriptions%rowtype; v_state text;
begin
  if v_user_id is null then return jsonb_build_object('state','anonymous'); end if;
  select m.tenant_id, coalesce(msa.store_id,m.store_id) into v_tenant_id,v_store_id
  from public.memberships m left join public.membership_store_assignments msa
    on msa.membership_id=m.id and msa.deleted_at is null
  where m.user_id=v_user_id and m.status='active' and m.disabled_at is null and m.deleted_at is null
  order by m.created_at,msa.created_at limit 1;
  if v_store_id is null or v_tenant_id is null then return jsonb_build_object('state','no_store'); end if;
  select * into v_subscription from public.company_subscriptions
  where tenant_id=v_tenant_id order by updated_at desc limit 1;
  if not found then return jsonb_build_object('state','active','store_id',v_store_id,'plan','free'); end if;
  v_state := public.garage_effective_billing_state(
    v_subscription.stripe_status,v_subscription.billing_state,v_subscription.grace_ends_at,
    v_subscription.cancel_at_period_end,v_subscription.current_period_end,
    v_subscription.cancelled_at,v_subscription.restoration_state,clock_timestamp()
  );
  return jsonb_build_object(
    'state',v_state,'store_id',v_store_id,'plan',v_subscription.plan,
    'stripe_status',v_subscription.stripe_status,'grace_ends_at',v_subscription.grace_ends_at,
    'current_period_end',v_subscription.current_period_end,
    'cancel_at_period_end',v_subscription.cancel_at_period_end,
    'restoration_state',v_subscription.restoration_state,
    'cancelled_at',v_subscription.cancelled_at,
    'data_delete_scheduled_at',v_subscription.data_delete_scheduled_at
  );
end $$;
revoke all on function public.get_member_contract_access() from public, anon;
grant execute on function public.get_member_contract_access() to authenticated;
