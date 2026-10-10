-- UNAPPLIED commercial review candidate. Exact SHA authorization and executor preflight required.
-- Addon-only Production candidate; execute only after exact-SHA Owner approval.
begin;
do $$ begin if coalesce(current_setting('garage.issue46_commercial_candidate_sha',true),'') !~ '^[0-9a-f]{40}$' then raise exception 'COMMERCIAL_REVIEWED_SHA_REQUIRED';end if;end $$;

-- Preserve the observed canonical owner/ACL and refuse stale or unreviewed bodies.
-- This guard does not grant executor privileges or replace exact-SHA Owner approval.
do $issue46_guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text)')
      and pg_catalog.md5(p.prosrc) = 'dba5b614cc53043d0613e51beaf06ce7'
      and p.proowner = 'postgres'::pg_catalog.regrole
      and p.prosecdef
      and p.proconfig = array['search_path=public, pg_temp']::text[]
      and (select array_agg(a::text order by a::text) from unnest(p.proacl) a)
          = array['postgres=X/postgres','service_role=X/postgres']::text[]
  ) then
    raise exception 'CANONICAL_ADDON_REVISION_REQUIRED';
  end if;
end;
$issue46_guard$;

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
  v_extra_staff integer;
  v_extra_store integer;
  v_extra_storage integer;
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
  v_extra_staff := greatest(p_extra_staff_count, 0);
  v_extra_store := greatest(p_extra_store_count, 0);
  v_extra_storage := greatest(p_extra_storage_gb, 0);
  -- Existing contract: downgrade entitlement is retained until the next cycle.
  -- A later authoritative period end also supports Stripe Test Clock renewal.
  if found and v_state in ('active','grace_period','cancellation_scheduled')
    and (v_row.current_period_end is null or p_current_period_end is null
      or (p_current_period_end <= v_row.current_period_end and v_row.current_period_end > clock_timestamp())) then
    v_extra_staff := greatest(v_extra_staff, coalesce(v_row.extra_staff_count,0));
    v_extra_store := greatest(v_extra_store, coalesce(v_row.extra_store_count,0));
    v_extra_storage := greatest(v_extra_storage, coalesce(v_row.extra_storage_gb,0));
  end if;
  if found then
    update public.company_subscriptions set
      plan = p_plan, status = v_legacy_status, stripe_status = p_stripe_status,
      billing_state = v_state, included_staff_count = v_contract.staff_limit,
      included_store_count = v_contract.store_limit, storage_limit_mb = v_contract.storage_limit_mb,
      current_inventory_limit = v_contract.inventory_limit,
      extra_staff_count = v_extra_staff,
      extra_store_count = v_extra_store,
      extra_storage_gb = v_extra_storage,
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
    and status in ('stripe_applied','reconciliation_required','retry_scheduled')
    and (operation_type <> 'change_option' or (
      target_options ? 'expected_quantity'
      and target_options->>'expected_quantity' ~ '^[0-9]+$'
      and case target_options->>'type'
        when 'add_staff' then p_extra_staff_count = (target_options->>'expected_quantity')::integer
        when 'add_store' then p_extra_store_count = (target_options->>'expected_quantity')::integer
        when 'add_storage' then p_extra_storage_gb = (target_options->>'expected_quantity')::integer * 10
        else false end
    ));
  return jsonb_build_object('ok', true, 'applied', true, 'billing_state', v_state);
end $$;
revoke all on function public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text) to service_role;
create or replace function public.garage_addon_release_ready() returns boolean
language sql stable set search_path=public,pg_temp as $$ select exists (
 select 1 from pg_catalog.pg_proc p
 where p.oid=pg_catalog.to_regprocedure('public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text)')
 and pg_catalog.md5(p.prosrc)='b5fdf216089d780caeb4cacfe33599bc'
 and p.proowner='postgres'::pg_catalog.regrole and p.prosecdef
 and p.proconfig=array['search_path=public, pg_temp']::text[]
 and (select array_agg(a::text order by a::text) from unnest(p.proacl) a)=array['postgres=X/postgres','service_role=X/postgres']::text[]
 ) $$;
revoke all on function public.garage_addon_release_ready() from public,anon,authenticated;
grant execute on function public.garage_addon_release_ready() to service_role;
commit;
