-- Revert only after pause/drain and no outstanding option operation. Preserve ALL existing RPC ACL.
begin;
do $$ begin if coalesce(current_setting('garage.issue46_commercial_candidate_sha',true),'') !~ '^[0-9a-f]{40}$' then raise exception 'COMMERCIAL_REVIEWED_SHA_REQUIRED';end if;end $$;
-- Preserve the observed canonical owner/ACL and refuse stale or unreviewed bodies.
-- This guard does not grant executor privileges or replace exact-SHA Owner approval.
do $issue46_guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('public.apply_garage_subscription_snapshot_v3(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,integer,integer,integer,text)')
      and pg_catalog.md5(p.prosrc) = 'b5fdf216089d780caeb4cacfe33599bc'
      and p.proowner = 'postgres'::pg_catalog.regrole
      and p.prosecdef
      and p.proconfig = array['search_path=public, pg_temp']::text[]
      and (select array_agg(a::text order by a::text) from unnest(p.proacl) a)
          = array['postgres=X/postgres','service_role=X/postgres']::text[]
  ) then
    raise exception 'ROLLBACK_ADDON_REVISION_REQUIRED';
  end if;
end;
$issue46_guard$;

-- Admission must already be closed; retain webhook/reconciliation until drained.
lock table public.billing_sync_operations,public.garage_subscription_leases in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.billing_sync_operations where operation_type='change_option' and (status not in ('completed','failed') or operator_action_required))
 or exists(select 1 from public.garage_subscription_leases where lease_expires_at>clock_timestamp())
 then raise exception 'ADDON_ROLLBACK_DRAIN_REQUIRED';end if;
end $$;

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
    and status in ('stripe_applied','reconciliation_required','retry_scheduled');
  return jsonb_build_object('ok', true, 'applied', true, 'billing_state', v_state);
end $$;
drop function public.garage_addon_release_ready();
commit;
