\set ON_ERROR_STOP on

-- G1-D runs only with the anonymous G0-B fixture in a disposable database.
do $$
begin
  if current_database()<>'postgres'
     or coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled' then
    raise exception 'G1D_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end;
$$;

delete from public.user_active_store_preferences
where user_id::text like '50000000-0000-0000-0000-%';
update public.memberships set status='active',disabled_at=null
where user_id='50000000-0000-0000-0000-000000000004';

-- The fixture is loaded after migration in fresh tests, so seed only explicit,
-- deterministic assignments. Owner/admin remain tenant-wide without assignments.
insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by)
select m.id,m.tenant_id,'51100000-0000-0000-0000-000000000002',
       '50000000-0000-0000-0000-000000000001'
from public.memberships m
where m.user_id in (
  '50000000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000004',
  '50000000-0000-0000-0000-000000000005'
)
on conflict (membership_id,store_id) do update set deleted_at=null;

insert into public.vehicles(id,store_id,management_no,status)
values
  ('53400000-0000-0000-0000-000000000001','51100000-0000-0000-0000-000000000001','G1D-A1','在庫中'),
  ('53400000-0000-0000-0000-000000000002','51100000-0000-0000-0000-000000000002','G1D-A2','在庫中')
on conflict (id) do update set store_id=excluded.store_id,status=excluded.status;

insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by)
select m.id,m.tenant_id,m.store_id,'50000000-0000-0000-0000-000000000001'
from public.memberships m
where m.store_id is not null
on conflict (membership_id,store_id) do update set deleted_at=null;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  v_user uuid;
  v_result jsonb;
  v_membership_store uuid;
  v_legacy_store uuid;
  v_version bigint;
  v_retry_version bigint;
begin
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
  perform public.set_membership_store_assignment(
    (select id from public.memberships where user_id='50000000-0000-0000-0000-000000000003'),
    '51100000-0000-0000-0000-000000000002',true,'g1d-owner-assignment'
  );
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
  perform public.set_membership_store_assignment(
    (select id from public.memberships where user_id='50000000-0000-0000-0000-000000000005'),
    '51100000-0000-0000-0000-000000000002',true,'g1d-admin-viewer-assignment'
  );
  begin
    perform public.set_membership_store_assignment(
      (select id from public.memberships where user_id='50000000-0000-0000-0000-000000000003'),
      '51100000-0000-0000-0000-000000000002',true,'g1d-admin-implementer-forbidden'
    );
    raise exception 'G1D_ADMIN_ASSIGNED_IMPLEMENTER';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
  begin
    perform public.set_membership_store_assignment(
      (select id from public.memberships where user_id='50000000-0000-0000-0000-000000000004'),
      '51100000-0000-0000-0000-000000000002',true,'g1d-staff-self-assignment-forbidden'
    );
    raise exception 'G1D_STAFF_SELF_ASSIGNED';
  exception when insufficient_privilege then null;
  end;

  foreach v_user in array array[
    '50000000-0000-0000-0000-000000000001'::uuid,
    '50000000-0000-0000-0000-000000000002'::uuid,
    '50000000-0000-0000-0000-000000000003'::uuid,
    '50000000-0000-0000-0000-000000000004'::uuid,
    '50000000-0000-0000-0000-000000000005'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub',v_user::text,true);
    v_result:=public.switch_active_garage_store(
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000002',
      'g1d-role-'||v_user::text
    );
    if v_result->>'store_id'<>'51100000-0000-0000-0000-000000000002'
       or public.current_user_active_store_id()<>'51100000-0000-0000-0000-000000000002' then
      raise exception 'G1D_ROLE_SWITCH_FAILED: %',v_user;
    end if;
    select store_id into v_membership_store from public.memberships where user_id=v_user;
    select store_id into v_legacy_store from public.store_members where user_id=v_user limit 1;
    if v_membership_store<>'51100000-0000-0000-0000-000000000001'
       or v_legacy_store<>'51100000-0000-0000-0000-000000000001' then
      raise exception 'G1D_SWITCH_MUTATED_MEMBERSHIP: %',v_user;
    end if;
  end loop;

  -- Same store retry is idempotent and does not increment the version.
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
  select version into strict v_version
  from public.user_active_store_preferences
  where user_id='50000000-0000-0000-0000-000000000005'
    and tenant_id='51000000-0000-0000-0000-000000000001';
  v_result:=public.switch_active_garage_store(
    '51000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000002','g1d-viewer-retry'
  );
  select version into strict v_retry_version
  from public.user_active_store_preferences
  where user_id='50000000-0000-0000-0000-000000000005'
    and tenant_id='51000000-0000-0000-0000-000000000001';
  if v_retry_version<>v_version or (v_result->>'changed')::boolean then
    raise exception 'G1D_RETRY_NOT_IDEMPOTENT';
  end if;
end;
$$;
rollback;

-- Re-run the successful switches outside rollback for membership-loss checks.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
select public.switch_active_garage_store(
  '51000000-0000-0000-0000-000000000001',
  '51100000-0000-0000-0000-000000000002',
  'g1d-membership-loss'
);

do $$
declare
  v_visible bigint;
  v_changed bigint;
begin
  select count(*) into v_visible from public.vehicles
  where id in ('53400000-0000-0000-0000-000000000001','53400000-0000-0000-0000-000000000002');
  if v_visible<>1 or not exists (
    select 1 from public.vehicles where id='53400000-0000-0000-0000-000000000002'
  ) then
    raise exception 'G1D_ACTIVE_STORE_RLS_SCOPE_FAILED';
  end if;
  update public.vehicles set status=status where id='53400000-0000-0000-0000-000000000001';
  get diagnostics v_changed=row_count;
  if v_changed<>0 then raise exception 'G1D_OLD_TAB_WRITE_NOT_REJECTED'; end if;
end;
$$;
commit;

do $$
begin
  -- Inactive membership invalidates preference without deleting or granting it.
  update public.memberships set status='inactive',disabled_at=now()
  where user_id='50000000-0000-0000-0000-000000000004';
end;
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',true);
do $$
begin
  if public.current_user_active_store_id() is not null then
    raise exception 'G1D_INACTIVE_PREFERENCE_GRANTED_ACCESS';
  end if;
  if not exists (
    select 1 from public.user_active_store_preferences
    where user_id='50000000-0000-0000-0000-000000000004'
  ) then raise exception 'G1D_PREFERENCE_WAS_NOT_RETAINED'; end if;
end;
$$;
rollback;

-- Restore fixture membership for later G1-B/G3 regression.
update public.memberships set status='active',disabled_at=null
where user_id='50000000-0000-0000-0000-000000000004';

delete from public.vehicles where id in (
  '53400000-0000-0000-0000-000000000001',
  '53400000-0000-0000-0000-000000000002'
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

do $$
begin
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',true);
  begin
    perform public.switch_active_garage_store(
      '52000000-0000-0000-0000-000000000001',
      '52100000-0000-0000-0000-000000000001','g1d-cross-tenant'
    );
    raise exception 'G1D_CROSS_TENANT_SWITCH_SUCCEEDED';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000006',true);
  begin
    perform public.switch_active_garage_store(
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001','g1d-inactive'
    );
    raise exception 'G1D_INACTIVE_SWITCH_SUCCEEDED';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000012',true);
  begin
    perform public.switch_active_garage_store(
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001','g1d-old-only'
    );
    raise exception 'G1D_OLD_ONLY_SWITCH_SUCCEEDED';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.switch_active_garage_store('51100000-0000-0000-0000-000000000001');
    raise exception 'G1D_LEGACY_SWITCH_EXECUTABLE';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- Leave the shared fixture in a deterministic A1 state for G1-A/B/G3 tests.
delete from public.user_active_store_preferences
where user_id::text like '50000000-0000-0000-0000-%';
delete from public.membership_store_assignments
where store_id='51100000-0000-0000-0000-000000000002'
  and membership_id in (
    select id from public.memberships
    where user_id in (
      '50000000-0000-0000-0000-000000000003',
      '50000000-0000-0000-0000-000000000004',
      '50000000-0000-0000-0000-000000000005'
    )
  );
insert into public.user_active_store_preferences(
  user_id,tenant_id,active_store_id,version,correlation_id
)
select m.user_id,m.tenant_id,'51100000-0000-0000-0000-000000000001',1,'g1d-shared-fixture-a1'
from public.memberships m
where m.user_id in (
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000004',
  '50000000-0000-0000-0000-000000000005'
)
on conflict (user_id,tenant_id) do update
set active_store_id=excluded.active_store_id,
    version=1,
    correlation_id=excluded.correlation_id,
    updated_at=now();

select 'G1D_ACTIVE_STORE_REGRESSION_PASS' result;
