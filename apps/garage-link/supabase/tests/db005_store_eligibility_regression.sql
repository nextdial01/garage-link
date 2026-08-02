\set ON_ERROR_STOP on

do $$
begin
  if current_database()<>'postgres'
     or coalesce(current_setting('app.g0b_fixture',true),'')<>'enabled' then
    raise exception 'DB005_DISPOSABLE_DATABASE_REQUIRED';
  end if;
  if not public.store_is_authorization_eligible('active')
     or not public.store_is_authorization_eligible('trial')
     or public.store_is_authorization_eligible('inactive')
     or public.store_is_authorization_eligible('suspended')
     or public.store_is_authorization_eligible('cancelled')
     or public.store_is_authorization_eligible('deleted')
     or public.store_is_authorization_eligible('unexpected-status')
     or public.store_is_authorization_eligible(null) then
    raise exception 'DB005_HELPER_FAIL_CLOSED_REGRESSION';
  end if;
end;
$$;

begin;
update public.stores set status='trial'
where id='51100000-0000-0000-0000-000000000002';

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

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

do $$
declare
  v_user uuid;
begin
  foreach v_user in array array[
    '50000000-0000-0000-0000-000000000001'::uuid,
    '50000000-0000-0000-0000-000000000002'::uuid,
    '50000000-0000-0000-0000-000000000003'::uuid,
    '50000000-0000-0000-0000-000000000004'::uuid,
    '50000000-0000-0000-0000-000000000005'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub',v_user::text,true);
    if not public.current_user_can_access_store('51100000-0000-0000-0000-000000000002') then
      raise exception 'DB005_TRIAL_ACTIVE_MEMBERSHIP_DENIED:%',v_user;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000006',true);
  if public.current_user_can_access_store('51100000-0000-0000-0000-000000000002') then
    raise exception 'DB005_TRIAL_INACTIVE_MEMBERSHIP_GRANTED';
  end if;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000012',true);
  if public.current_user_can_access_store('51100000-0000-0000-0000-000000000002') then
    raise exception 'DB005_TRIAL_OLD_ONLY_GRANTED';
  end if;

  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000008',true);
  if public.current_user_can_access_store('51100000-0000-0000-0000-000000000002') then
    raise exception 'DB005_TRIAL_CROSS_TENANT_GRANTED';
  end if;
end;
$$;
rollback;

begin;
update public.stores set status='unexpected-status'
where id='51100000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
do $$
begin
  if public.current_user_can_access_store('51100000-0000-0000-0000-000000000001') then
    raise exception 'DB005_UNKNOWN_STATUS_GRANTED';
  end if;
end;
$$;
rollback;

select 'DB005_STORE_ELIGIBILITY_REGRESSION_PASS' result;
