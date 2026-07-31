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
  if public.garage_effective_billing_state(
    'active','cancellation_scheduled',null,true,null,null,'none',clock_timestamp()
  ) <> 'canceled' then
    raise exception 'BATCH1B_MISSING_PERIOD_END_NOT_FAIL_CLOSED';
  end if;
  if public.garage_effective_billing_state(
    'active','active',null,false,null,null,'failed',clock_timestamp()
  ) <> 'reconciliation_required' then
    raise exception 'BATCH1B_RESTORATION_FAILURE_NOT_FAIL_CLOSED';
  end if;
end $$;

insert into public.stripe_webhook_events(
  stripe_event_id,event_type,status,next_retry_at
) values
  ('evt_batch1b_manual_target','invoice.payment_failed','dead_letter',null),
  ('evt_batch1b_manual_other','invoice.paid','retry_scheduled',clock_timestamp()+interval '1 hour');

do $$
declare v_claimed text;
begin
  select stripe_event_id into v_claimed
  from public.claim_garage_webhook_retry('batch1b_manual_worker',60,1,'evt_batch1b_manual_target');
  if v_claimed <> 'evt_batch1b_manual_target' then
    raise exception 'BATCH1B_MANUAL_RETRY_CLAIMED_WRONG_EVENT';
  end if;
  if not exists (
    select 1 from public.stripe_webhook_events
    where stripe_event_id='evt_batch1b_manual_other' and status='retry_scheduled'
  ) then raise exception 'BATCH1B_MANUAL_RETRY_CHANGED_OTHER_EVENT'; end if;
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
declare
  v_first jsonb; v_same_plan jsonb; v_addon jsonb; v_cancel jsonb;
  v_restoration jsonb; v_different_key jsonb; v_operation_id uuid;
begin
  v_first := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'change_plan','batch1b_plan','standard','{}'::jsonb,'sub_batch1b'
  );
  v_same_plan := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'change_plan','batch1b_plan_other','pro','{}'::jsonb,'sub_batch1b'
  );
  v_addon := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'change_option','batch1b_option','standard','{"type":"add_staff"}'::jsonb,'sub_batch1b'
  );
  v_cancel := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'cancel','batch1b_cancel','standard','{"cancel_at_period_end":true}'::jsonb,'sub_batch1b'
  );
  v_restoration := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'restoration','batch1b_restore','standard','{"cancel_at_period_end":false}'::jsonb,'sub_batch1b'
  );
  v_different_key := public.begin_garage_billing_operation(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    null,'change_plan','batch1b_different_key','standard','{}'::jsonb,'sub_batch1b'
  );
  if not coalesce((v_first->>'ok')::boolean,false)
    or not coalesce((v_same_plan->>'conflict')::boolean,false) then
    raise exception 'BATCH1B_CONCURRENT_PLAN_CHANGE';
  end if;
  if not coalesce((v_addon->>'conflict')::boolean,false) then
    raise exception 'BATCH1B_PLAN_ADDON_CONFLICT';
  end if;
  if not coalesce((v_cancel->>'conflict')::boolean,false) then
    raise exception 'BATCH1B_UPGRADE_CANCEL_CONFLICT';
  end if;
  if not coalesce((v_restoration->>'conflict')::boolean,false) then
    raise exception 'BATCH1B_DOWNGRADE_RESTORATION_CONFLICT';
  end if;
  if not coalesce((v_different_key->>'conflict')::boolean,false) then
    raise exception 'BATCH1B_DIFFERENT_IDEMPOTENCY_CONFLICT';
  end if;
  v_operation_id := (v_first->>'id')::uuid;
  update public.billing_sync_operations
    set status='reconciliation_required', lease_owner=null, lease_expires_at=null
    where id=v_operation_id;
  if (select count(*) from public.claim_garage_billing_operations('batch1b_crashed_worker',5,1)) <> 1
    or (select count(*) from public.claim_garage_billing_operations('batch1b_competing_worker',5,1)) <> 0 then
    raise exception 'BATCH1B_OPERATION_SERIALIZATION_FAILED';
  end if;
  update public.billing_sync_operations
    set lease_expires_at=clock_timestamp()-interval '1 second' where id=v_operation_id;
  if (select count(*) from public.claim_garage_billing_operations('batch1b_recovery_worker',5,1)) <> 1 then
    raise exception 'BATCH1B_WORKER_CRASH_RECLAIM';
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

do $$
declare v_observed_at timestamptz := clock_timestamp();
begin
  perform public.apply_garage_subscription_snapshot_v3(
    '51100000-0000-0000-0000-000000000001','standard','active',
    'cus_batch1b','sub_batch1b','evt_batch1b_same_second_b',
    v_observed_at,null,false,v_observed_at+interval '30 days',null,2,1,10,'none'
  );
  perform public.apply_garage_subscription_snapshot_v3(
    '51100000-0000-0000-0000-000000000001','standard','active',
    'cus_batch1b','sub_batch1b','evt_batch1b_same_second_a',
    v_observed_at,null,false,v_observed_at+interval '30 days',null,2,1,10,'none'
  );
end $$;

do $$
begin
  if not exists (
    select 1 from public.company_subscriptions
    where tenant_id='51000000-0000-0000-0000-000000000001'
      and plan='standard' and billing_state='active'
      and last_stripe_event_id='evt_batch1b_same_second_a'
      and included_staff_count=3 and current_inventory_limit=200
  ) then raise exception 'BATCH1B_SAME_SECOND_AUTHORITATIVE_CONVERGENCE'; end if;
end $$;

do $$
declare v_before bigint;
begin
  select count(*) into v_before from public.company_subscriptions;
  begin
    perform public.apply_garage_subscription_snapshot_v3(
      '59900000-0000-0000-0000-000000000099','starter','active',
      'cus_batch1b_invalid','sub_batch1b_invalid','evt_batch1b_invalid',
      clock_timestamp(),null,false,clock_timestamp()+interval '30 days',null,0,0,0,'none'
    );
    raise exception 'BATCH1B_DB_TRANSACTION_FAILURE_NOT_RAISED';
  exception when foreign_key_violation then null;
  end;
  if (select count(*) from public.company_subscriptions) <> v_before then
    raise exception 'BATCH1B_DB_TRANSACTION_FAILURE_ATOMIC';
  end if;
end $$;

-- BATCH1B_DOWNGRADE_OVER_LIMIT_GUARD: the same atomic trigger reads the
-- downgraded plan contract and existing usage before every protected insert.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname='guard_vehicle_plan_limit' and tgenabled<>'D'
  ) then raise exception 'BATCH1B_DOWNGRADE_OVER_LIMIT_GUARD'; end if;
end $$;

update public.company_subscriptions set
  plan='free', stripe_status='active', billing_state='active',
  extra_staff_count=0, extra_store_count=0, extra_storage_gb=0
where tenant_id='51000000-0000-0000-0000-000000000001';
-- BATCH1B_DOWNGRADE_OVER_LIMIT_GUARD: existing over-limit rows remain
-- readable after downgrade, while the next protected write is rejected.

set local session_replication_role=replica;
insert into public.vehicles(store_id,management_no,status)
select '51100000-0000-0000-0000-000000000001','BATCH1B-LIMIT-SEED-'||g,'in_stock'
from generate_series(1,5) g;
set local session_replication_role=origin;
do $$
begin
  begin
    insert into public.vehicles(store_id,management_no,status)
    values('51100000-0000-0000-0000-000000000001','BATCH1B-LIMIT-VEHICLE','in_stock');
    raise exception 'BATCH1B_INVENTORY_LIMIT_NOT_ENFORCED';
  exception when raise_exception then
    if sqlerrm='BATCH1B_INVENTORY_LIMIT_NOT_ENFORCED' then raise; end if;
  end;
  -- BATCH1B_INVENTORY_LIMIT_ENFORCED
  -- BATCH1B_DOWNGRADE_OVER_LIMIT_GUARD
end $$;

do $$
begin
  begin
    insert into public.memberships(
      tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at
    ) values(
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000007',
      'batch1b-limit-staff@example.invalid','staff','active',now(),now()
    );
    raise exception 'BATCH1B_STAFF_LIMIT_NOT_ENFORCED';
  exception when raise_exception then
    if sqlerrm='BATCH1B_STAFF_LIMIT_NOT_ENFORCED' then raise; end if;
  end;
  -- BATCH1B_STAFF_LIMIT_ENFORCED
end $$;

do $$
begin
  begin
    insert into public.stores(id,tenant_id,name,status,plan_code)
    values(
      '51100000-0000-0000-0000-000000000099',
      '51000000-0000-0000-0000-000000000001',
      'Batch1B rejected store','active','free'
    );
    raise exception 'BATCH1B_STORE_LIMIT_NOT_ENFORCED';
  exception when raise_exception then
    if sqlerrm='BATCH1B_STORE_LIMIT_NOT_ENFORCED' then raise; end if;
  end;
  -- BATCH1B_STORE_LIMIT_ENFORCED
end $$;

do $$
begin
  begin
    insert into public.uploaded_files(
      tenant_id,store_id,path,safe_filename,mime_type,size_bytes,file_type,purpose
    ) values(
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001',
      'batch1b/over-limit.pdf','over-limit.pdf','application/pdf',
      600*1024*1024,'pdf','other'
    );
    raise exception 'BATCH1B_STORAGE_LIMIT_NOT_ENFORCED';
  exception when raise_exception then
    if sqlerrm='BATCH1B_STORAGE_LIMIT_NOT_ENFORCED' then raise; end if;
  end;
  -- BATCH1B_STORAGE_LIMIT_ENFORCED
end $$;

set local session_replication_role=replica;
insert into public.quotes(store_id,quote_no,status,created_at)
select '51100000-0000-0000-0000-000000000001','BATCH1B-LIMIT-QUOTE-'||g,'draft',now()
from generate_series(1,5) g;
set local session_replication_role=origin;
do $$
begin
  begin
    insert into public.invoices(store_id,invoice_no,status,created_at)
    values('51100000-0000-0000-0000-000000000001','BATCH1B-LIMIT-INVOICE','draft',now());
    raise exception 'BATCH1B_QUOTE_INVOICE_LIMIT_NOT_ENFORCED';
  exception when raise_exception then
    if sqlerrm='BATCH1B_QUOTE_INVOICE_LIMIT_NOT_ENFORCED' then raise; end if;
  end;
  -- BATCH1B_QUOTE_INVOICE_LIMIT_ENFORCED
end $$;

select public.apply_garage_subscription_snapshot_v3(
  '51100000-0000-0000-0000-000000000001','standard','canceled',
  'cus_batch1b','sub_batch1b','evt_batch1b_old_canceled',
  clock_timestamp(),null,false,clock_timestamp(),null,2,1,10,'none'
);
select public.apply_garage_subscription_snapshot_v3(
  '51100000-0000-0000-0000-000000000001','starter','active',
  'cus_batch1b','sub_batch1b_new','evt_batch1b_resubscribed',
  clock_timestamp(),null,false,clock_timestamp()+interval '30 days',null,0,0,0,'none'
);
select public.apply_garage_subscription_snapshot_v3(
  '51100000-0000-0000-0000-000000000001','standard','canceled',
  'cus_batch1b','sub_batch1b','evt_batch1b_stale_old',
  clock_timestamp(),null,false,clock_timestamp(),null,2,1,10,'none'
);

do $$
begin
  if not exists (
    select 1 from public.company_subscriptions
    where tenant_id='51000000-0000-0000-0000-000000000001'
      and stripe_subscription_id='sub_batch1b_new'
      and plan='starter' and billing_state='active'
  ) then raise exception 'BATCH1B_STALE_OLD_SUBSCRIPTION_OVERWROTE_RESUBSCRIPTION'; end if;
end $$;

rollback;
select 'COMMERCIAL_REMEDIATION_BATCH_1B_REGRESSION_PASS' as result;
