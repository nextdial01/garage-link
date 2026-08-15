-- Repair the PostgreSQL regex encoding used by the primary actual-email
-- adoption contract.  POSIX classes avoid transport-specific backslash
-- escaping; this migration does not broaden the accepted account state.
begin;

create or replace function public.qa_lifecycle_adopt_primary_unmarked_release_fixture(
  p_run_id uuid, p_tenant_id uuid, p_actual_tenant_name text, p_store_id uuid,
  p_user_id uuid, p_membership_id uuid, p_marker text, p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r qa_internal.runs%rowtype;
  v_metadata jsonb;
  v_callback jsonb;
  v_arrival jsonb;
  v_store_created jsonb;
  v_onboarding_completed jsonb;
  v_expected_next text;
  v_expected_name text;
  v_result jsonb;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,0));
  if r.product<>'garage-link' or r.environment<>'staging' or r.project_ref<>'gaytoojzwqkpuvfofeql'
     or r.purpose<>'release-critical-acquisition' or r.state<>'PROVISIONING'
     or r.source_sha !~ '^[0-9a-f]{40}$' or r.deployment_id !~ '^dpl_[A-Za-z0-9]+$' then
    raise exception 'PRIMARY_UNMARKED_RELEASE_RUN_CONTRACT_INVALID';
  end if;
  if p_marker !~ '^\[RELEASE QA [0-9]{8}\]$' or p_expires_at<=clock_timestamp()
     or p_actual_tenant_name is null or p_actual_tenant_name='' or p_actual_tenant_name like p_marker||'%' then
    raise exception 'PRIMARY_UNMARKED_RELEASE_INPUT_INVALID';
  end if;

  select u.raw_app_meta_data into strict v_metadata from auth.users u where u.id=p_user_id;
  if v_metadata->>'release_qa_run_id'<>p_run_id::text
     or v_metadata#>>'{release_qa_callback,run_id}'<>p_run_id::text then
    raise exception 'PRIMARY_UNMARKED_RELEASE_AUTH_BINDING_INVALID';
  end if;
  v_callback:=v_metadata#>'{release_qa_callback,signup,callback}';
  v_arrival:=v_metadata#>'{release_qa_callback,signup,arrival}';
  v_store_created:=v_metadata#>'{release_qa_callback,signup,store_created}';
  v_onboarding_completed:=v_metadata#>'{release_qa_callback,signup,onboarding_completed}';
  v_expected_next:='/signup?resume=1&qa_run='||p_run_id::text;
  if v_callback->>'next_path'<>v_expected_next or v_arrival->>'next_path'<>v_expected_next
     or v_store_created->>'next_path'<>v_expected_next or v_onboarding_completed->>'next_path'<>v_expected_next
     or v_callback->>'origin'<>'https://staging.garage-link.tech' or v_arrival->>'origin'<>'https://staging.garage-link.tech'
     or v_store_created->>'origin'<>'https://staging.garage-link.tech' or v_onboarding_completed->>'origin'<>'https://staging.garage-link.tech'
     or coalesce(v_callback->>'recorded_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z$'
     or coalesce(v_arrival->>'recorded_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z$'
     or coalesce(v_store_created->>'recorded_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z$'
     or coalesce(v_onboarding_completed->>'recorded_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z$'
     or (v_callback->>'recorded_at')::timestamptz>(v_arrival->>'recorded_at')::timestamptz
     or (v_arrival->>'recorded_at')::timestamptz>(v_store_created->>'recorded_at')::timestamptz
     or (v_store_created->>'recorded_at')::timestamptz>(v_onboarding_completed->>'recorded_at')::timestamptz
     or coalesce((v_store_created->>'server_bound_continuation')::boolean,false) is not true
     or coalesce((v_onboarding_completed->>'server_bound_continuation')::boolean,false) is not true
     or v_store_created->>'continuation_of_callback_at'<>v_callback->>'recorded_at'
     or v_onboarding_completed->>'continuation_of_callback_at'<>v_callback->>'recorded_at'
     or v_onboarding_completed#>>'{fixture,tenant_id}'<>p_tenant_id::text
     or v_onboarding_completed#>>'{fixture,store_id}'<>p_store_id::text
     or v_onboarding_completed#>>'{fixture,membership_id}'<>p_membership_id::text
     or v_onboarding_completed#>>'{fixture,tenant_name}'<>p_actual_tenant_name
     or v_onboarding_completed#>>'{fixture,account_state,garage_ui_context}'<>'active'
     or v_onboarding_completed#>>'{fixture,account_state,active_store}'<>'YES'
     or v_onboarding_completed#>>'{fixture,account_state,onboarding_completed}'<>'YES'
     or v_onboarding_completed#>>'{fixture,account_state,membership_role}'<>'owner'
     or v_onboarding_completed#>>'{fixture,account_state,membership_status}'<>'active'
     or coalesce(v_onboarding_completed#>>'{fixture,account_state,contract_access_state}','') !~ '^[[:alnum:]_]{2,48}$' then
    raise exception 'PRIMARY_UNMARKED_RELEASE_CALLBACK_BINDING_INVALID';
  end if;

  if not exists(
    select 1 from public.tenants t
    join public.stores s on s.id=p_store_id and s.tenant_id=t.id
    join public.memberships m on m.id=p_membership_id and m.tenant_id=t.id and m.store_id=s.id and m.user_id=p_user_id
    where t.id=p_tenant_id and t.name=p_actual_tenant_name and t.status='active'
      and public.store_is_authorization_eligible(s.status) and s.onboarding_completed_at is not null
      and m.role='owner' and m.status='active' and m.disabled_at is null and m.deleted_at is null
      and coalesce(m.invite_accepted_at,m.joined_at) is not null
      and public.membership_legacy_is_consistent(m.tenant_id,m.store_id,m.user_id,m.role)
  ) then
    raise exception 'PRIMARY_UNMARKED_RELEASE_GRAPH_INVALID';
  end if;

  v_expected_name:=p_marker||' Actual Email';
  update public.tenants set name=v_expected_name,updated_by=p_user_id
    where id=p_tenant_id and name=p_actual_tenant_name and status='active';
  if not found then raise exception 'PRIMARY_UNMARKED_RELEASE_TENANT_RENAME_CONFLICT'; end if;
  select public.qa_lifecycle_adopt_fixture(
    p_run_id,p_tenant_id,v_expected_name,p_store_id,p_user_id,p_membership_id,'release',p_marker,p_expires_at
  ) into v_result;
  return v_result||jsonb_build_object('canonical_marker',p_marker,'primary_unmarked_actual_email',true);
end;
$$;

revoke all on function public.qa_lifecycle_adopt_primary_unmarked_release_fixture(uuid,uuid,text,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.qa_lifecycle_adopt_primary_unmarked_release_fixture(uuid,uuid,text,uuid,uuid,uuid,text,timestamptz) to service_role;
alter function public.qa_lifecycle_adopt_primary_unmarked_release_fixture(uuid,uuid,text,uuid,uuid,uuid,text,timestamptz) owner to postgres;
notify pgrst, 'reload schema';
commit;
