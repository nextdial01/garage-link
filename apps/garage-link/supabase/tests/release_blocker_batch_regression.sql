-- AUTH-004 / BILL-003 / CRON-001 disposable database regression.
\set ON_ERROR_STOP on

do $$
begin
  if current_database()<>'postgres'
     or coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled' then
    raise exception 'RELEASE_BLOCKER_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end;
$$;

begin;
set local session_replication_role=replica;

insert into auth.users(id,email,raw_user_meta_data) values
  ('57000000-0000-0000-0000-000000000001','release-owner@example.invalid','{"purpose":"release-preview-fixture"}'),
  ('57000000-0000-0000-0000-000000000002','release-admin@example.invalid','{"purpose":"release-preview-fixture"}'),
  ('57000000-0000-0000-0000-000000000003','release-implementer@example.invalid','{"purpose":"release-preview-fixture"}'),
  ('57000000-0000-0000-0000-000000000004','release-staff@example.invalid','{"purpose":"release-preview-fixture"}'),
  ('57000000-0000-0000-0000-000000000005','outside-owner@example.invalid','{}'),
  ('57000000-0000-0000-0000-000000000006','release-inactive@example.invalid','{"purpose":"release-preview-fixture"}')
on conflict(id) do update set raw_user_meta_data=excluded.raw_user_meta_data;

insert into public.tenants(id,name,status,plan_code) values
  ('57100000-0000-0000-0000-000000000001','[RELEASE QA] Tenant','active','pro'),
  ('57100000-0000-0000-0000-000000000002','Other Tenant','active','pro')
on conflict(id) do nothing;

insert into public.stores(id,tenant_id,name,status,plan_code) values
  ('57200000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000001','[RELEASE QA] Store','trial','pro'),
  ('57200000-0000-0000-0000-000000000002','57100000-0000-0000-0000-000000000002','Other Store','active','pro')
on conflict(id) do nothing;

insert into public.memberships(id,tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at) values
  ('57300000-0000-0000-0000-000000000001','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000001','release-owner@example.invalid','owner','active',now(),now()),
  ('57300000-0000-0000-0000-000000000002','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000002','release-admin@example.invalid','admin','active',now(),now()),
  ('57300000-0000-0000-0000-000000000003','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000003','release-implementer@example.invalid','implementer','active',now(),now()),
  ('57300000-0000-0000-0000-000000000004','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000004','release-staff@example.invalid','staff','active',now(),now()),
  ('57300000-0000-0000-0000-000000000005','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000005','outside-owner@example.invalid','owner','active',now(),now()),
  ('57300000-0000-0000-0000-000000000006','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000006','release-inactive@example.invalid','owner','inactive',now(),now())
on conflict(id) do nothing;

insert into public.membership_store_assignments(membership_id,tenant_id,store_id)
values('57300000-0000-0000-0000-000000000003','57100000-0000-0000-0000-000000000001','57200000-0000-0000-0000-000000000001')
on conflict(membership_id,store_id) do nothing;

set local session_replication_role=origin;

do $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);

  foreach v in array array[
    public.release_qa_admin_bootstrap_context('57000000-0000-0000-0000-000000000001','57400000-0000-0000-0000-000000000001','preview'),
    public.release_qa_admin_bootstrap_context('57000000-0000-0000-0000-000000000002','57400000-0000-0000-0000-000000000002','preview'),
    public.release_qa_admin_bootstrap_context('57000000-0000-0000-0000-000000000003','57400000-0000-0000-0000-000000000003','preview')
  ] loop
    if coalesce(v->>'tenant_id','')<>'57100000-0000-0000-0000-000000000001' then
      raise exception 'AUTH004_VALID_QA_CONTEXT_DENIED';
    end if;
  end loop;

  if public.release_qa_admin_bootstrap_context('57000000-0000-0000-0000-000000000004','57400000-0000-0000-0000-000000000004','preview') is not null then
    raise exception 'AUTH004_STAFF_GRANTED';
  end if;
  if public.release_qa_admin_bootstrap_context('57000000-0000-0000-0000-000000000005','57400000-0000-0000-0000-000000000005','preview') is not null then
    raise exception 'AUTH004_ALLOWLIST_OUTSIDE_GRANTED';
  end if;
  if public.release_qa_admin_bootstrap_context('57000000-0000-0000-0000-000000000006','57400000-0000-0000-0000-000000000006','preview') is not null then
    raise exception 'AUTH004_INACTIVE_GRANTED';
  end if;
  if public.release_qa_admin_bootstrap_context('57000000-0000-0000-0000-000000000001','57400000-0000-0000-0000-000000000001','production') is not null then
    raise exception 'AUTH004_PRODUCTION_GRANTED';
  end if;
end;
$$;

insert into public.admin_trusted_sessions(user_id,session_id,device_token_hash,expires_at)
values('57000000-0000-0000-0000-000000000002','57400000-0000-0000-0000-000000000002','release-test-token-hash',now()+interval '1 day');

update public.memberships set role='staff'
where id='57300000-0000-0000-0000-000000000002';

do $$
begin
  if exists(select 1 from public.admin_trusted_sessions where user_id='57000000-0000-0000-0000-000000000002' and revoked_at is null) then
    raise exception 'AUTH004_ROLE_CHANGE_DID_NOT_REVOKE';
  end if;
  if (select tenant_id from public.service_resolve_garage_store_scope('57200000-0000-0000-0000-000000000001')) <>
     '57100000-0000-0000-0000-000000000001'::uuid then
    raise exception 'BILL003_STORE_SCOPE_NOT_RESOLVED';
  end if;
  if not exists(select 1 from public.service_list_eligible_garage_stores() where store_id='57200000-0000-0000-0000-000000000001') then
    raise exception 'CRON001_STORE_SCOPE_NOT_LISTED';
  end if;
end;
$$;

rollback;
select 'RELEASE_BLOCKER_BATCH_REGRESSION_PASS' result;
