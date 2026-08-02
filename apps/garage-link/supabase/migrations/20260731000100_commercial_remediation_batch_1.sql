-- GARAGE LINK Commercial Remediation Batch 1
-- Stripe is the billing source of truth. Application access is derived from
-- verified webhook/reconciliation snapshots only.

alter table public.company_subscriptions
  add column if not exists stripe_status text,
  add column if not exists billing_state text not null default 'active',
  add column if not exists grace_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists current_period_end timestamptz,
  add column if not exists reconciliation_required boolean not null default false,
  add column if not exists reconciliation_requested_at timestamptz,
  add column if not exists last_invoice_id text;

alter table public.company_subscriptions
  drop constraint if exists company_subscriptions_billing_state_check;
alter table public.company_subscriptions
  add constraint company_subscriptions_billing_state_check check (
    billing_state in (
      'checkout_pending',
      'initial_payment_pending',
      'active',
      'grace_period',
      'restricted',
      'unpaid',
      'cancellation_scheduled',
      'canceled',
      'reconciliation_required'
    )
  );

create unique index if not exists company_subscriptions_stripe_subscription_uidx
  on public.company_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.stripe_webhook_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists diagnostic_code text,
  add column if not exists operator_action_required boolean not null default false;

alter table public.billing_sync_operations
  add column if not exists stripe_subscription_id text,
  add column if not exists requested_options jsonb not null default '{}'::jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists diagnostic_code text,
  add column if not exists operator_action_required boolean not null default false;

alter table public.billing_sync_operations
  drop constraint if exists billing_sync_operations_status_check;
alter table public.billing_sync_operations
  add constraint billing_sync_operations_status_check check (
    status in (
      'started',
      'stripe_applied',
      'completed',
      'reconciliation_required',
      'retry_scheduled',
      'dead_letter',
      'failed'
    )
  );

create unique index if not exists billing_sync_operations_one_open_checkout_uidx
  on public.billing_sync_operations(tenant_id)
  where operation_type = 'checkout'
    and status in ('started', 'stripe_applied', 'reconciliation_required', 'retry_scheduled');

create or replace function public.apply_garage_subscription_event_v2(
  p_company_id uuid,
  p_plan text,
  p_stripe_status text,
  p_billing_state text,
  p_customer_id text,
  p_subscription_id text,
  p_event_id text,
  p_event_created bigint,
  p_grace_ends_at timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_current_period_end timestamptz default null,
  p_invoice_id text default null,
  p_extra_staff_count integer default null,
  p_extra_store_count integer default null,
  p_extra_storage_gb integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_row public.company_subscriptions%rowtype;
  v_staff integer;
  v_stores integer;
  v_storage integer;
  v_inventory integer;
  v_legacy_status text;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_event_created is null or nullif(p_event_id, '') is null then
    raise exception using errcode = '22023', message = 'stripe_event_version_required';
  end if;
  if p_plan not in ('starter', 'standard', 'pro') then
    raise exception using errcode = '22023', message = 'invalid_plan';
  end if;
  if p_stripe_status not in (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'unpaid', 'paused', 'canceled'
  ) then
    raise exception using errcode = '22023', message = 'invalid_stripe_status';
  end if;
  if p_billing_state not in (
    'initial_payment_pending', 'active', 'grace_period', 'restricted', 'unpaid',
    'cancellation_scheduled', 'canceled', 'reconciliation_required'
  ) then
    raise exception using errcode = '22023', message = 'invalid_billing_state';
  end if;

  select tenant_id into v_tenant
  from public.stores
  where id = p_company_id;
  if v_tenant is null then
    raise exception using errcode = '23503', message = 'subscription_store_scope_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text, 0));

  select * into v_row
  from public.company_subscriptions
  where tenant_id = v_tenant
  order by updated_at desc
  limit 1
  for update;

  if found and (
    v_row.last_stripe_event_created > p_event_created
    or (
      v_row.last_stripe_event_created = p_event_created
      and coalesce(v_row.last_stripe_event_id, '') >= p_event_id
    )
  ) then
    return jsonb_build_object('ok', true, 'applied', false, 'reason', 'superseded');
  end if;

  if p_plan = 'starter' then
    v_staff := 1; v_stores := 1; v_storage := 2048; v_inventory := 50;
  elsif p_plan = 'standard' then
    v_staff := 3; v_stores := 1; v_storage := 10240; v_inventory := 200;
  else
    v_staff := 10; v_stores := 3; v_storage := 51200; v_inventory := 500;
  end if;

  -- Keep the legacy status compatible while billing_state is the access source.
  v_legacy_status := case
    when p_billing_state in ('active', 'grace_period', 'cancellation_scheduled') then 'active'
    when p_billing_state = 'canceled' then 'cancelled'
    when p_billing_state = 'initial_payment_pending' then 'trialing'
    when p_billing_state = 'restricted' then 'suspended'
    else 'past_due'
  end;

  if found then
    update public.company_subscriptions
    set
      plan = p_plan,
      status = v_legacy_status,
      stripe_status = p_stripe_status,
      billing_state = p_billing_state,
      included_staff_count = v_staff,
      extra_staff_count = coalesce(p_extra_staff_count, extra_staff_count),
      included_store_count = v_stores,
      extra_store_count = coalesce(p_extra_store_count, extra_store_count),
      storage_limit_mb = v_storage,
      extra_storage_gb = coalesce(p_extra_storage_gb, extra_storage_gb),
      current_inventory_limit = v_inventory,
      -- L-LINK remains unavailable until its Production S2S E2E gate passes.
      l_link_integration_enabled = false,
      stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
      stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
      grace_ends_at = p_grace_ends_at,
      cancel_at_period_end = p_cancel_at_period_end,
      current_period_end = p_current_period_end,
      reconciliation_required = false,
      reconciliation_requested_at = null,
      last_invoice_id = coalesce(p_invoice_id, last_invoice_id),
      last_stripe_event_created = p_event_created,
      last_stripe_event_id = p_event_id,
      cancelled_at = case when p_billing_state = 'canceled' then coalesce(cancelled_at, now()) else null end,
      data_delete_scheduled_at = case
        when p_billing_state = 'canceled' then coalesce(data_delete_scheduled_at, now() + interval '1 year')
        else null
      end,
      updated_at = now()
    where id = v_row.id;
  else
    insert into public.company_subscriptions(
      company_id, tenant_id, plan, status, stripe_status, billing_state,
      included_staff_count, extra_staff_count, included_store_count, extra_store_count, storage_limit_mb, extra_storage_gb,
      current_inventory_limit, l_link_integration_enabled,
      stripe_customer_id, stripe_subscription_id, grace_ends_at,
      cancel_at_period_end, current_period_end, last_invoice_id,
      last_stripe_event_created, last_stripe_event_id,
      cancelled_at, data_delete_scheduled_at
    ) values (
      p_company_id, v_tenant, p_plan, v_legacy_status, p_stripe_status, p_billing_state,
      v_staff, coalesce(p_extra_staff_count, 0), v_stores, coalesce(p_extra_store_count, 0),
      v_storage, coalesce(p_extra_storage_gb, 0), v_inventory, false,
      p_customer_id, p_subscription_id, p_grace_ends_at,
      p_cancel_at_period_end, p_current_period_end, p_invoice_id,
      p_event_created, p_event_id,
      case when p_billing_state = 'canceled' then now() else null end,
      case when p_billing_state = 'canceled' then now() + interval '1 year' else null end
    );
  end if;

  update public.billing_sync_operations
  set
    status = 'completed',
    error_code = null,
    diagnostic_code = null,
    operator_action_required = false,
    updated_at = now()
  where (
      stripe_subscription_id = p_subscription_id
      or operation_type = 'checkout'
    )
    and requested_plan = p_plan
    and status in ('started', 'stripe_applied', 'reconciliation_required', 'retry_scheduled');

  update public.plan_change_requests
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where tenant_id = v_tenant
    and (
      (request_type = 'plan_change' and requested_plan = p_plan)
      or request_type in ('add_staff', 'add_store', 'add_storage')
    )
    and status = 'approved';

  return jsonb_build_object(
    'ok', true,
    'applied', true,
    'tenant_id', v_tenant,
    'billing_state', p_billing_state
  );
end;
$$;

revoke all on function public.apply_garage_subscription_event_v2(
  uuid,text,text,text,text,text,text,bigint,timestamptz,boolean,timestamptz,text,integer,integer,integer
) from public, anon, authenticated;
grant execute on function public.apply_garage_subscription_event_v2(
  uuid,text,text,text,text,text,text,bigint,timestamptz,boolean,timestamptz,text,integer,integer,integer
) to service_role;

create or replace function public.garage_billing_access_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_state text;
begin
  if tg_table_name in ('stores', 'memberships') then
    v_tenant := new.tenant_id;
  elsif tg_table_name = 'uploaded_files' then
    v_tenant := new.tenant_id;
  else
    select tenant_id into v_tenant from public.stores where id = new.store_id;
  end if;
  if v_tenant is null then
    raise exception using errcode = '23503', message = 'billing_tenant_scope_missing';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text, 0));

  select billing_state into v_state
  from public.company_subscriptions
  where tenant_id = v_tenant
  order by updated_at desc
  limit 1;

  if v_state is not null and v_state not in ('active', 'grace_period', 'cancellation_scheduled') then
    raise exception using errcode = '42501', message = 'billing_access_restricted';
  end if;
  return new;
end;
$$;

revoke all on function public.garage_billing_access_guard() from public, anon, authenticated;

drop trigger if exists a00_billing_access_vehicle on public.vehicles;
create trigger a00_billing_access_vehicle before insert or update on public.vehicles
for each row execute function public.garage_billing_access_guard();
drop trigger if exists a00_billing_access_quote on public.quotes;
create trigger a00_billing_access_quote before insert on public.quotes
for each row execute function public.garage_billing_access_guard();
drop trigger if exists a00_billing_access_invoice on public.invoices;
create trigger a00_billing_access_invoice before insert on public.invoices
for each row execute function public.garage_billing_access_guard();
drop trigger if exists a00_billing_access_storage on public.uploaded_files;
create trigger a00_billing_access_storage before insert on public.uploaded_files
for each row execute function public.garage_billing_access_guard();
drop trigger if exists a00_billing_access_staff on public.store_members;
create trigger a00_billing_access_staff before insert or update on public.store_members
for each row execute function public.garage_billing_access_guard();
drop trigger if exists a00_billing_access_membership on public.memberships;
create trigger a00_billing_access_membership before insert or update of status, deleted_at, disabled_at on public.memberships
for each row execute function public.garage_billing_access_guard();
drop trigger if exists a00_billing_access_store on public.stores;
create trigger a00_billing_access_store before insert on public.stores
for each row execute function public.garage_billing_access_guard();

create or replace function public.get_member_contract_access()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_tenant_id uuid;
  v_subscription public.company_subscriptions%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('state', 'anonymous');
  end if;

  select m.tenant_id, coalesce(msa.store_id, m.store_id)
  into v_tenant_id, v_store_id
  from public.memberships m
  left join public.membership_store_assignments msa
    on msa.membership_id = m.id and msa.deleted_at is null
  where m.user_id = v_user_id
    and m.status = 'active'
    and m.disabled_at is null
    and m.deleted_at is null
  order by m.created_at asc, msa.created_at asc
  limit 1;

  if v_store_id is null or v_tenant_id is null then
    return jsonb_build_object('state', 'no_store');
  end if;

  select * into v_subscription
  from public.company_subscriptions
  where tenant_id = v_tenant_id
  order by updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object('state', 'active', 'store_id', v_store_id, 'plan', 'free');
  end if;

  return jsonb_build_object(
    'state', v_subscription.billing_state,
    'store_id', v_store_id,
    'plan', v_subscription.plan,
    'stripe_status', v_subscription.stripe_status,
    'grace_ends_at', v_subscription.grace_ends_at,
    'current_period_end', v_subscription.current_period_end,
    'cancel_at_period_end', v_subscription.cancel_at_period_end,
    'cancelled_at', v_subscription.cancelled_at,
    'data_delete_scheduled_at', v_subscription.data_delete_scheduled_at
  );
end;
$$;

revoke all on function public.get_member_contract_access() from public, anon;
grant execute on function public.get_member_contract_access() to authenticated;

comment on column public.company_subscriptions.billing_state is
  'Verified Stripe-derived access state. Never update from browser/UI.';
comment on column public.company_subscriptions.stripe_status is
  'Latest verified Stripe subscription status.';
