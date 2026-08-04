begin;
create or replace function public.qa_lifecycle_adopt_fixture(
  p_run_id uuid,p_tenant_id uuid,p_expected_tenant_name text,p_store_id uuid,
  p_user_id uuid,p_membership_id uuid,p_fixture_type text,p_marker text,p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_state text;v_fixture qa_internal.fixtures%rowtype;
begin
  perform qa_internal.assert_operator();
  select state into strict v_state from qa_internal.runs where run_id=p_run_id for update;
  if v_state<>'PROVISIONING' then raise exception 'ADOPT_STATE_INVALID:%',v_state;end if;
  if p_fixture_type not in ('role','boundary','security','ux','release') then raise exception 'ADOPT_TYPE_INVALID';end if;
  if p_expires_at<=clock_timestamp() then raise exception 'ADOPT_EXPIRY_INVALID';end if;
  if p_expected_tenant_name not like p_marker||'%' then raise exception 'ADOPT_NAME_MARKER_MISMATCH';end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id and name=p_expected_tenant_name) then raise exception 'ADOPT_TENANT_MISMATCH';end if;
  if not exists(select 1 from public.stores where id=p_store_id and tenant_id=p_tenant_id) then raise exception 'ADOPT_STORE_MISMATCH';end if;
  if not exists(select 1 from public.memberships where id=p_membership_id and tenant_id=p_tenant_id and store_id=p_store_id and user_id=p_user_id and role='owner') then raise exception 'ADOPT_MEMBERSHIP_MISMATCH';end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'ADOPT_AUTH_USER_MISSING';end if;
  insert into qa_internal.fixtures(run_id,tenant_id,expected_tenant_name,store_id,user_id,membership_id,fixture_type,marker,expires_at)
  values(p_run_id,p_tenant_id,p_expected_tenant_name,p_store_id,p_user_id,p_membership_id,p_fixture_type,p_marker,p_expires_at)
  on conflict(run_id) do nothing;
  select * into strict v_fixture from qa_internal.fixtures where run_id=p_run_id;
  if (v_fixture.tenant_id,v_fixture.expected_tenant_name,v_fixture.store_id,v_fixture.user_id,v_fixture.membership_id,v_fixture.fixture_type,v_fixture.marker)
     is distinct from (p_tenant_id,p_expected_tenant_name,p_store_id,p_user_id,p_membership_id,p_fixture_type,p_marker) then raise exception 'ADOPT_CONTRACT_MISMATCH';end if;
  return jsonb_build_object('fixture_id',v_fixture.fixture_id,'registered',true,'dependencies_verified',true);
end;
$$;
revoke all on function public.qa_lifecycle_adopt_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.qa_lifecycle_adopt_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz) to service_role;
alter function public.qa_lifecycle_adopt_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz) owner to postgres;
commit;
