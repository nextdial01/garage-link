\set ON_ERROR_STOP on
begin;
set local app.g0b_fixture = 'enabled';

do $$
begin
  if public.garage_effective_billing_state(
    'past_due','grace_period',clock_timestamp(),false,null,null,'none',clock_timestamp()
  ) <> 'restricted' then
    raise exception 'BATCH1B_GRACE_BOUNDARY_NOT_FAIL_CLOSED';
  end if;
  if public.garage_effective_billing_state(
    'past_due','grace_period',clock_timestamp() + interval '1 second',false,null,null,'none',clock_timestamp()
  ) <> 'grace_period' then
    raise exception 'BATCH1B_GRACE_INSIDE_DENIED';
  end if;
  if public.garage_effective_billing_state(
    'active','cancellation_scheduled',null,true,clock_timestamp(),null,'none',clock_timestamp()
  ) <> 'canceled' then
    raise exception 'BATCH1B_PERIOD_END_NOT_CANCELED';
  end if;
  if public.garage_effective_billing_state(
    'active','active',null,false,null,null,'pending',clock_timestamp()
  ) <> 'reconciliation_required' then
    raise exception 'BATCH1B_RESTORATION_PENDING_NOT_FAIL_CLOSED';
  end if;
end $$;

do $$
declare v_first boolean; v_second boolean; v_recovered boolean;
begin
  v_first := public.claim_garage_subscription_lease('sub_batch1b','worker_one',60);
  v_second := public.claim_garage_subscription_lease('sub_batch1b','worker_two',60);
  update public.garage_subscription_leases
    set lease_expires_at = clock_timestamp() - interval '1 second'
    where stripe_subscription_id = 'sub_batch1b';
  v_recovered := public.claim_garage_subscription_lease('sub_batch1b','worker_two',60);
  if not v_first or v_second or not v_recovered then
    raise exception 'BATCH1B_SUBSCRIPTION_LEASE_FAILED';
  end if;
end $$;

do $$
declare v_first jsonb; v_conflict jsonb;
begin
  v_first := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'change_plan','batch1b_plan','standard','{}'::jsonb,'sub_batch1b'
  );
  v_conflict := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'change_option','batch1b_option','standard','{"type":"add_staff"}'::jsonb,'sub_batch1b'
  );
  if not coalesce((v_first->>'ok')::boolean,false)
    or not coalesce((v_conflict->>'conflict')::boolean,false) then
    raise exception 'BATCH1B_OPERATION_SERIALIZATION_FAILED';
  end if;
end $$;

insert into public.stripe_webhook_events(
  stripe_event_id,event_type,status,next_retry_at,lease_expires_at
) values
  ('evt_batch1b_retry_1','invoice.payment_failed','retry_scheduled',clock_timestamp()-interval '1 second',null),
  ('evt_batch1b_retry_2','invoice.paid','processing',null,clock_timestamp()-interval '1 second');

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.claim_garage_webhook_retry('batch1b_worker',60,25,null);
  if v_count <> 2 then raise exception 'BATCH1B_RETRY_ATOMIC_CLAIM_FAILED'; end if;
  if exists (
    select 1 from public.claim_garage_webhook_retry('batch1b_worker_two',60,25,null)
  ) then raise exception 'BATCH1B_RETRY_DOUBLE_CLAIM_ALLOWED'; end if;
end $$;

select public.apply_garage_subscription_snapshot_v3(
  '51100000-0000-0000-0000-000000000001','standard','active',
  'cus_batch1b','sub_batch1b','evt_batch1b_same_second_b',
  clock_timestamp(),null,false,clock_timestamp()+interval '30 days',null,2,1,10,'none'
);
select public.apply_garage_subscription_snapshot_v3(
  '51100000-0000-0000-0000-000000000001','standard','active',
  'cus_batch1b','sub_batch1b','evt_batch1b_same_second_a',
  clock_timestamp(),null,false,clock_timestamp()+interval '30 days',null,2,1,10,'none'
);

do $$
begin
  if not exists (
    select 1 from public.company_subscriptions
    where tenant_id='51000000-0000-0000-0000-000000000001'
      and plan='standard' and billing_state='active'
      and last_stripe_event_id='evt_batch1b_same_second_a'
      and included_staff_count=3 and current_inventory_limit=200
  ) then raise exception 'BATCH1B_AUTHORITATIVE_SNAPSHOT_CONVERGENCE_FAILED'; end if;
end $$;

rollback;
select 'COMMERCIAL_REMEDIATION_BATCH_1B_REGRESSION_PASS' as result;
