\set ON_ERROR_STOP on

-- G7 High remediation regression. The shared G1-A/G1-D fixture is required.
begin;
set local session_replication_role=replica;
insert into auth.users(id,email) values
 ('50000000-0000-0000-0000-000000000016','invitee-g7@example.invalid'),
 ('50000000-0000-0000-0000-000000000017','signup-g7@example.invalid')
on conflict(id) do nothing;
insert into public.vehicles(id,store_id,management_no,status)
 values('57000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','G7-INV-VEH','in_stock')
on conflict(id) do nothing;
insert into public.customers(id,store_id,name,deleted_at,is_archived)
 values('57000000-0000-0000-0000-000000000002','51100000-0000-0000-0000-000000000001','Deleted fixture',now(),true)
on conflict(id) do update set deleted_at=excluded.deleted_at,is_archived=true;
insert into public.repair_parts(id,store_id,part_no,name,stock,status)
 values('57000000-0000-0000-0000-000000000003','51100000-0000-0000-0000-000000000001','G7-PART','G7 part',10,'在庫あり')
on conflict(id) do update set stock=10;
insert into public.maintenance_jobs(id,store_id,job_no,status)
 values('57000000-0000-0000-0000-000000000004','51100000-0000-0000-0000-000000000001','G7-JOB','working')
on conflict(id) do update set status='working',cancelled_at=null;
delete from public.maintenance_job_parts where job_id='57000000-0000-0000-0000-000000000004';
insert into public.maintenance_job_parts(id,store_id,job_id,part_id,part_no,name,quantity,stock_adjusted)
values
 ('57000000-0000-0000-0000-000000000005','51100000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000004','57000000-0000-0000-0000-000000000003','G7-PART','adjusted',2,true),
 ('57000000-0000-0000-0000-000000000006','51100000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000004','57000000-0000-0000-0000-000000000003','G7-PART','not adjusted',3,false);
set local session_replication_role=origin;
commit;

-- viewer: PII soft-delete visibility and all new mutation RPCs are denied.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
do $$ declare n bigint; begin
  select count(*) into n from public.customers where id='57000000-0000-0000-0000-000000000002';
  if n<>0 then raise exception 'G7_VIEWER_DELETED_PII_VISIBLE'; end if;
  begin perform public.create_inventory_count('51100000-0000-0000-0000-000000000001','{"count_no":"G7-VIEW","name":"viewer"}'::jsonb,'[]'::jsonb,'g7-view'); raise exception 'G7_VIEWER_INVENTORY_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.cancel_maintenance_job('57000000-0000-0000-0000-000000000004','viewer','g7-view-cancel'); raise exception 'G7_VIEWER_CANCEL_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- inactive, legacy-only and other-tenant users receive no G7 write scope.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000006',true);
do $$ begin
  begin perform public.create_inventory_count('51100000-0000-0000-0000-000000000001','{"count_no":"G7-INACTIVE","name":"deny"}'::jsonb,'[]'::jsonb,'g7-inactive'); raise exception 'G7_INACTIVE_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000012',true);
do $$ begin
  begin perform public.create_inventory_count('51100000-0000-0000-0000-000000000001','{"count_no":"G7-LEGACY","name":"deny"}'::jsonb,'[]'::jsonb,'g7-legacy'); raise exception 'G7_LEGACY_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000010',true);
do $$ begin
  begin perform public.create_inventory_count('51100000-0000-0000-0000-000000000001','{"count_no":"G7-OTHER","name":"deny"}'::jsonb,'[]'::jsonb,'g7-other'); raise exception 'G7_OTHER_TENANT_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- staff can atomically start a snapshot, but cannot finalize it or mutate identity.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
do $$ declare r jsonb;cid uuid;n bigint; begin
  r:=public.create_inventory_count(
    '51100000-0000-0000-0000-000000000001',
    '{"count_no":"G7-COUNT","name":"G7 inventory","count_type":"vehicle"}'::jsonb,
    '[{"item_type":"vehicle","vehicle_id":"57000000-0000-0000-0000-000000000001","item_name":"vehicle"}]'::jsonb,
    'g7-count-create');
  cid:=(r->>'inventory_count_id')::uuid;
  select count(*) into n from public.inventory_count_items where inventory_count_id=cid;
  if n<>1 then raise exception 'G7_SNAPSHOT_ITEM_COUNT: %',n; end if;
  begin insert into public.inventory_count_items(store_id,inventory_count_id,item_type,vehicle_id) values('51100000-0000-0000-0000-000000000001',cid,'vehicle','57000000-0000-0000-0000-000000000001'); raise exception 'G7_DIRECT_ITEM_INSERT_ALLOWED'; exception when insufficient_privilege then null; end;
  update public.inventory_count_items set actual_quantity=1 where inventory_count_id=cid;
  if exists(select 1 from public.inventory_count_items where inventory_count_id=cid and (difference_quantity<>0 or check_status<>'checked')) then raise exception 'G7_DERIVED_QUANTITY_INVALID'; end if;
  begin update public.inventory_count_items set system_quantity=99 where inventory_count_id=cid; raise exception 'G7_SNAPSHOT_MUTATION_ALLOWED'; exception when insufficient_privilege then null; end;
  begin update public.inventory_count_items set item_name='mutated' where inventory_count_id=cid; raise exception 'G7_SNAPSHOT_LABEL_MUTATION_ALLOWED'; exception when insufficient_privilege then null; end;
  begin update public.inventory_count_items set deleted_at=now() where inventory_count_id=cid; raise exception 'G7_SNAPSHOT_DELETE_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.finalize_inventory_count(cid,'g7-staff-finalize'); raise exception 'G7_STAFF_FINALIZE_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- owner: finalize and maintenance cancellation are idempotent and atomic.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$ declare r jsonb;cid uuid;s int; begin
  r:=public.create_inventory_count('51100000-0000-0000-0000-000000000001','{"count_no":"G7-OWNER","name":"owner"}'::jsonb,'[{"item_type":"vehicle","vehicle_id":"57000000-0000-0000-0000-000000000001"}]'::jsonb,'g7-owner-count');
  cid:=(r->>'inventory_count_id')::uuid;
  update public.inventory_count_items set actual_quantity=1 where inventory_count_id=cid;
  perform public.finalize_inventory_count(cid,'g7-owner-finalize');
  perform public.finalize_inventory_count(cid,'g7-owner-finalize');
  if (select status from public.inventory_counts where id=cid)<>'completed' then raise exception 'G7_FINALIZE_FAILED'; end if;
  begin update public.inventory_count_items set actual_quantity=2 where inventory_count_id=cid; raise exception 'G7_COMPLETED_SNAPSHOT_MUTATION_ALLOWED'; exception when insufficient_privilege then null; end;
  perform public.cancel_maintenance_job('57000000-0000-0000-0000-000000000004','test','g7-cancel');
  perform public.cancel_maintenance_job('57000000-0000-0000-0000-000000000004','test','g7-cancel');
  select stock into s from public.repair_parts where id='57000000-0000-0000-0000-000000000003';
  if s<>12 then raise exception 'G7_CANCEL_STOCK_EXPECTED_12: %',s; end if;
  if (select count(*) from public.repair_part_stock_movements where operation_key='g7-cancel')<>1 then raise exception 'G7_CANCEL_MOVEMENT_COUNT'; end if;
end $$;
rollback;

-- Invite acceptance creates canonical assignment and never writes store_members.
begin;
set local session_replication_role=replica;
insert into public.memberships(id,tenant_id,store_id,email,role,status,invited_at,invite_token_hash,invite_expires_at)
values('57000000-0000-0000-0000-000000000007','51000000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','invitee-g7@example.invalid','staff','invited',now(),encode(extensions.digest('g7-token','sha256'),'hex'),now()+interval '1 day');
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000016',true);
do $$ begin
  perform public.accept_membership_invite('57000000-0000-0000-0000-000000000007','g7-token');
  if not exists(select 1 from public.membership_store_assignments where membership_id='57000000-0000-0000-0000-000000000007' and deleted_at is null) then raise exception 'G7_INVITE_ASSIGNMENT_MISSING'; end if;
  if exists(select 1 from public.store_members where user_id='50000000-0000-0000-0000-000000000016') then raise exception 'G7_INVITE_WROTE_LEGACY'; end if;
end $$;
rollback;

-- Ordered Stripe events never allow an older event to restore a newer state.
begin;
set local role service_role;
select public.apply_ordered_stripe_subscription_event('51100000-0000-0000-0000-000000000001','pro','cancelled',null,'sub_g7','evt_new',200);
select public.apply_ordered_stripe_subscription_event('51100000-0000-0000-0000-000000000001','starter','active',null,'sub_g7','evt_old',100);
do $$ begin
  if not exists(select 1 from public.company_subscriptions where tenant_id='51000000-0000-0000-0000-000000000001' and status='cancelled' and plan='pro' and last_stripe_event_id='evt_new') then raise exception 'G7_STRIPE_ORDERING_FAILED'; end if;
end $$;
rollback;

select 'G7_HIGH_REMEDIATION_REGRESSION_PASS' result;
