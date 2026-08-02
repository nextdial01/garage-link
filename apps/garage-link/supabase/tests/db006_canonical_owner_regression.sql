-- DB-006 canonical-owner regression. Disposable G0-B database only.
\set ON_ERROR_STOP on

do $$
begin
  if current_database()<>'postgres'
     or coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled' then
    raise exception 'DB006_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end;
$$;

begin;

insert into auth.users(id,email) values
  ('56000000-0000-0000-0000-000000000001','db006-owner-none@example.invalid'),
  ('56000000-0000-0000-0000-000000000002','db006-owner-drift@example.invalid'),
  ('56000000-0000-0000-0000-000000000003','db006-legacy-only@example.invalid'),
  ('56000000-0000-0000-0000-000000000004','db006-inactive@example.invalid'),
  ('56000000-0000-0000-0000-000000000005','db006-trial@example.invalid'),
  ('56000000-0000-0000-0000-000000000006','db006-inactive-store@example.invalid'),
  ('56000000-0000-0000-0000-000000000007','db006-last-owner@example.invalid')
on conflict(id) do nothing;

insert into public.tenants(id,name,status,plan_code) values
  ('56100000-0000-0000-0000-000000000001','DB006 canonical no legacy','active','pro'),
  ('56100000-0000-0000-0000-000000000002','DB006 canonical legacy drift','active','pro'),
  ('56100000-0000-0000-0000-000000000003','DB006 legacy only','active','pro'),
  ('56100000-0000-0000-0000-000000000004','DB006 inactive canonical','active','pro'),
  ('56100000-0000-0000-0000-000000000005','DB006 trial','active','pro'),
  ('56100000-0000-0000-0000-000000000006','DB006 inactive store','active','pro'),
  ('56100000-0000-0000-0000-000000000007','DB006 last owner','active','pro')
on conflict(id) do nothing;

insert into public.stores(id,tenant_id,name,status,plan_code) values
  ('56200000-0000-0000-0000-000000000001','56100000-0000-0000-0000-000000000001','DB006 S1','active','pro'),
  ('56200000-0000-0000-0000-000000000002','56100000-0000-0000-0000-000000000002','DB006 S2','active','pro'),
  ('56200000-0000-0000-0000-000000000003','56100000-0000-0000-0000-000000000003','DB006 S3','active','pro'),
  ('56200000-0000-0000-0000-000000000004','56100000-0000-0000-0000-000000000004','DB006 S4','active','pro'),
  ('56200000-0000-0000-0000-000000000005','56100000-0000-0000-0000-000000000005','DB006 S5','trial','pro'),
  ('56200000-0000-0000-0000-000000000006','56100000-0000-0000-0000-000000000006','DB006 S6','inactive','pro'),
  ('56200000-0000-0000-0000-000000000007','56100000-0000-0000-0000-000000000007','DB006 S7','active','pro')
on conflict(id) do nothing;

insert into public.memberships(tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at) values
  ('56100000-0000-0000-0000-000000000001','56200000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001','db006-owner-none@example.invalid','owner','active',now(),now()),
  ('56100000-0000-0000-0000-000000000002','56200000-0000-0000-0000-000000000002','56000000-0000-0000-0000-000000000002','db006-owner-drift@example.invalid','owner','active',now(),now()),
  ('56100000-0000-0000-0000-000000000004','56200000-0000-0000-0000-000000000004','56000000-0000-0000-0000-000000000004','db006-inactive@example.invalid','owner','inactive',now(),now()),
  ('56100000-0000-0000-0000-000000000005','56200000-0000-0000-0000-000000000005','56000000-0000-0000-0000-000000000005','db006-trial@example.invalid','owner','active',now(),now()),
  ('56100000-0000-0000-0000-000000000006','56200000-0000-0000-0000-000000000006','56000000-0000-0000-0000-000000000006','db006-inactive-store@example.invalid','owner','active',now(),now()),
  ('56100000-0000-0000-0000-000000000007','56200000-0000-0000-0000-000000000007','56000000-0000-0000-0000-000000000007','db006-last-owner@example.invalid','owner','active',now(),now())
on conflict(tenant_id,user_id) do nothing;

set local session_replication_role=replica;
insert into public.store_members(store_id,user_id,email,role,status,joined_at) values
  ('56200000-0000-0000-0000-000000000002','56000000-0000-0000-0000-000000000002','db006-owner-drift@example.invalid','staff','active',now()),
  ('56200000-0000-0000-0000-000000000003','56000000-0000-0000-0000-000000000003','db006-legacy-only@example.invalid','owner','active',now()),
  ('56200000-0000-0000-0000-000000000004','56000000-0000-0000-0000-000000000004','db006-inactive@example.invalid','owner','active',now())
on conflict(store_id,user_id) do nothing;
set local session_replication_role=origin;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  v_count integer;
begin
  -- 1 canonical owner / no legacy => PASS.
  perform set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000001',true);
  select count(*) into v_count from public.current_user_tenant_ids()
   where current_user_tenant_ids='56100000-0000-0000-0000-000000000001';
  if v_count<>1 then raise exception 'DB006_CASE1_CANONICAL_WITHOUT_LEGACY_DENIED'; end if;

  -- 2 canonical owner / legacy role mismatch => PASS; drift remains observable.
  perform set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000002',true);
  select count(*) into v_count from public.current_user_tenant_ids()
   where current_user_tenant_ids='56100000-0000-0000-0000-000000000002';
  if v_count<>1 then raise exception 'DB006_CASE2_CANONICAL_WITH_LEGACY_DRIFT_DENIED'; end if;
  if not exists(select 1 from public.store_members where user_id='56000000-0000-0000-0000-000000000002' and role='staff') then
    raise exception 'DB006_CASE2_LEGACY_DRIFT_NOT_RECORDED';
  end if;

  -- 3 legacy owner / no canonical => FAIL closed.
  perform set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000003',true);
  select count(*) into v_count from public.current_user_tenant_ids();
  if v_count<>0 then raise exception 'DB006_CASE3_LEGACY_ONLY_GRANTED'; end if;

  -- 4 inactive canonical / active legacy => FAIL closed.
  perform set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000004',true);
  select count(*) into v_count from public.current_user_tenant_ids();
  if v_count<>0 then raise exception 'DB006_CASE4_INACTIVE_CANONICAL_GRANTED'; end if;

  -- 7 trial store / canonical active owner => PASS.
  perform set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000005',true);
  select count(*) into v_count from public.current_user_tenant_ids()
   where current_user_tenant_ids='56100000-0000-0000-0000-000000000005';
  if v_count<>1 then raise exception 'DB006_CASE7_TRIAL_CANONICAL_DENIED'; end if;

  -- 8 inactive store / canonical owner => FAIL closed.
  perform set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000006',true);
  select count(*) into v_count from public.current_user_tenant_ids();
  if v_count<>0 then raise exception 'DB006_CASE8_INACTIVE_STORE_GRANTED'; end if;
end;
$$;

reset role;

-- 5/6 cross-tenant and nonexistent-store canonical rows are rejected by the
-- exact composite FK used by the precheck contract.
do $$
begin
  begin
    insert into public.memberships(tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at)
    values('56100000-0000-0000-0000-000000000001','56200000-0000-0000-0000-000000000002',gen_random_uuid(),'cross-tenant@example.invalid','owner','inactive',now(),now());
    raise exception 'DB006_CASE5_CROSS_TENANT_ACCEPTED';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.memberships(tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at)
    values('56100000-0000-0000-0000-000000000001','56200000-0000-0000-0000-000000000099',gen_random_uuid(),'missing-store@example.invalid','owner','inactive',now(),now());
    raise exception 'DB006_CASE6_MISSING_STORE_ACCEPTED';
  exception when foreign_key_violation then null;
  end;
end;
$$;

-- 9 last canonical owner removal must fail.
do $$
begin
  begin
    delete from public.memberships where user_id='56000000-0000-0000-0000-000000000007';
    raise exception 'DB006_CASE9_LAST_OWNER_DELETE_ACCEPTED';
  exception when check_violation then null;
  end;
end;
$$;

rollback;
select 'DB006_CANONICAL_OWNER_REGRESSION_PASS' result;
