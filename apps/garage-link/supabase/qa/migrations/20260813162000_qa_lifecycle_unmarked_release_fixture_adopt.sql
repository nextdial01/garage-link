-- Staging-only bridge for an already-created, run-bound Release Critical
-- fixture whose human-entered tenant name predates the controlled resume
-- prefill. It never broadens the normal adoption contract: it proves the
-- exact synthetic graph, restores the canonical marker on that tenant, then
-- delegates to the ordinary qa_lifecycle_adopt_fixture path.
begin;

create or replace function public.qa_lifecycle_adopt_unmarked_release_fixture(
  p_run_id uuid, p_source_run_id uuid, p_tenant_id uuid, p_actual_tenant_name text,
  p_store_id uuid, p_user_id uuid, p_membership_id uuid, p_marker text, p_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r qa_internal.runs%rowtype; v_expected_name text; v_result jsonb;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,0));
  if r.product<>'garage-link' or r.environment<>'staging' or r.project_ref<>'gaytoojzwqkpuvfofeql'
     or r.purpose<>'release-critical-acquisition' or r.state<>'PROVISIONING'
     or r.source_sha !~ '^[0-9a-f]{40}$' or r.deployment_id !~ '^dpl_[A-Za-z0-9]+$' then
    raise exception 'UNMARKED_RELEASE_RECOVERY_RUN_CONTRACT_INVALID';
  end if;
  if p_source_run_id=p_run_id or p_marker !~ '^\[RELEASE QA [0-9]{8}\]$' or p_expires_at<=clock_timestamp() then
    raise exception 'UNMARKED_RELEASE_RECOVERY_INPUT_INVALID';
  end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id
    and u.raw_app_meta_data->>'release_qa_run_id'=p_run_id::text
    and u.raw_app_meta_data->>'release_qa_recovered_from_run_id'=p_source_run_id::text) then
    raise exception 'UNMARKED_RELEASE_RECOVERY_AUTH_BINDING_INVALID';
  end if;
  if not exists(select 1 from public.tenants t where t.id=p_tenant_id and t.name=p_actual_tenant_name)
    or not exists(select 1 from public.stores s where s.id=p_store_id and s.tenant_id=p_tenant_id)
    or not exists(select 1 from public.memberships m where m.id=p_membership_id and m.user_id=p_user_id and m.tenant_id=p_tenant_id and m.store_id=p_store_id and m.role='owner' and m.status='active') then
    raise exception 'UNMARKED_RELEASE_RECOVERY_GRAPH_INVALID';
  end if;
  v_expected_name:=p_marker || ' Recovered';
  update public.tenants set name=v_expected_name, updated_by=p_user_id
    where id=p_tenant_id and name=p_actual_tenant_name;
  if not found then raise exception 'UNMARKED_RELEASE_RECOVERY_TENANT_RENAME_CONFLICT'; end if;
  select public.qa_lifecycle_adopt_fixture(p_run_id,p_tenant_id,v_expected_name,p_store_id,p_user_id,p_membership_id,'release',p_marker,p_expires_at) into v_result;
  return v_result || jsonb_build_object('canonical_marker',p_marker,'unmarked_recovery',true);
end;
$$;

revoke all on function public.qa_lifecycle_adopt_unmarked_release_fixture(uuid,uuid,uuid,text,uuid,uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.qa_lifecycle_adopt_unmarked_release_fixture(uuid,uuid,uuid,text,uuid,uuid,uuid,text,timestamptz) to service_role;
alter function public.qa_lifecycle_adopt_unmarked_release_fixture(uuid,uuid,uuid,text,uuid,uuid,uuid,text,timestamptz) owner to postgres;

notify pgrst, 'reload schema';
commit;
