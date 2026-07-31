\set ON_ERROR_STOP on

begin;
set local app.g0b_fixture = 'enabled';

select public.apply_garage_subscription_event_v2(
  '51100000-0000-0000-0000-000000000001',
  'standard',
  'active',
  'active',
  'cus_commercial_fixture',
  'sub_commercial_fixture',
  'evt_commercial_2000',
  2000,
  null,
  false,
  now() + interval '30 days',
  'in_commercial_2000',
  2,
  1,
  10
);

do $$
begin
  if not exists (
    select 1
    from public.company_subscriptions
    where tenant_id = '51000000-0000-0000-0000-000000000001'
      and plan = 'standard'
      and stripe_status = 'active'
      and billing_state = 'active'
      and included_staff_count = 3
      and extra_staff_count = 2
      and included_store_count = 1
      and extra_store_count = 1
      and storage_limit_mb = 10240
      and extra_storage_gb = 10
      and current_inventory_limit = 200
      and l_link_integration_enabled = false
      and stripe_subscription_id = 'sub_commercial_fixture'
  ) then
    raise exception 'COMMERCIAL_ACTIVE_SNAPSHOT_FAILED';
  end if;
end;
$$;

-- Concurrent first Checkout requests must not create separate open operations.
insert into public.billing_sync_operations(
  id, tenant_id, company_id, operation_type, idempotency_key, requested_plan, status
) values (
  '51900000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '51100000-0000-0000-0000-000000000001',
  'checkout',
  'commercial_checkout_one',
  'starter',
  'started'
);

do $$
begin
  begin
    insert into public.billing_sync_operations(
      id, tenant_id, company_id, operation_type, idempotency_key, requested_plan, status
    ) values (
      '51900000-0000-0000-0000-000000000002',
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001',
      'checkout',
      'commercial_checkout_two',
      'standard',
      'started'
    );
    raise exception 'COMMERCIAL_DUPLICATE_CHECKOUT_WAS_ALLOWED';
  exception
    when unique_violation then null;
  end;
end;
$$;

-- A late old event must not roll the subscription back.
select public.apply_garage_subscription_event_v2(
  '51100000-0000-0000-0000-000000000001',
  'pro',
  'active',
  'active',
  'cus_commercial_fixture',
  'sub_commercial_fixture',
  'evt_commercial_1999',
  1999
);

do $$
begin
  if not exists (
    select 1 from public.company_subscriptions
    where tenant_id = '51000000-0000-0000-0000-000000000001'
      and plan = 'standard'
      and last_stripe_event_id = 'evt_commercial_2000'
  ) then
    raise exception 'COMMERCIAL_OUT_OF_ORDER_FAILED';
  end if;
end;
$$;

-- No grace period means a failed payment is fail-closed for DB writes.
select public.apply_garage_subscription_event_v2(
  '51100000-0000-0000-0000-000000000001',
  'standard',
  'past_due',
  'restricted',
  'cus_commercial_fixture',
  'sub_commercial_fixture',
  'evt_commercial_2001',
  2001,
  null,
  false,
  now() + interval '30 days',
  'in_commercial_failed'
);

do $$
begin
  begin
    update public.vehicles
    set updated_at = now()
    where store_id = '51100000-0000-0000-0000-000000000001';
    raise exception 'COMMERCIAL_RESTRICTED_WRITE_WAS_ALLOWED';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'billing_access_restricted' then raise; end if;
  end;
end;
$$;

-- Verified recovery restores access, and cancellation can be followed by a new
-- verified active snapshot without retaining deletion metadata.
select public.apply_garage_subscription_event_v2(
  '51100000-0000-0000-0000-000000000001',
  'standard',
  'canceled',
  'canceled',
  'cus_commercial_fixture',
  'sub_commercial_fixture',
  'evt_commercial_2002',
  2002
);
select public.apply_garage_subscription_event_v2(
  '51100000-0000-0000-0000-000000000001',
  'starter',
  'active',
  'active',
  'cus_commercial_fixture',
  'sub_commercial_fixture',
  'evt_commercial_2003',
  2003
);

do $$
begin
  if not exists (
    select 1 from public.company_subscriptions
    where tenant_id = '51000000-0000-0000-0000-000000000001'
      and plan = 'starter'
      and billing_state = 'active'
      and cancelled_at is null
      and data_delete_scheduled_at is null
  ) then
    raise exception 'COMMERCIAL_RESTORATION_FAILED';
  end if;
end;
$$;

rollback;

select 'COMMERCIAL_REMEDIATION_REGRESSION_PASS' as result;
