-- Staging-only recovery for a registered, expired Release Critical fixture.
-- It renews neither application authorization nor user data: the exact
-- registry row is re-proven first, then the normal lifecycle teardown owns
-- every subsequent delete (business dependencies before Auth).
begin;

create or replace function public.qa_lifecycle_reclaim_expired_release_fixture(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r qa_internal.runs%rowtype;
  f qa_internal.fixtures%rowtype;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  select * into strict f from qa_internal.fixtures where run_id=p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));
  perform 1 from public.tenants where id=f.tenant_id for update;

  if r.product<>'garage-link' or r.environment<>'staging'
     or r.project_ref<>'gaytoojzwqkpuvfofeql'
     or r.purpose<>'release-critical-acquisition'
     or r.state<>'PROVISIONING' then
    raise exception 'EXPIRED_RELEASE_RECOVERY_RUN_CONTRACT_INVALID';
  end if;
  if f.fixture_type<>'release' or f.marker !~ '^\[RELEASE QA [0-9]{8}\]$'
     or f.expected_tenant_name not like f.marker || '%' then
    raise exception 'EXPIRED_RELEASE_RECOVERY_FIXTURE_CONTRACT_INVALID';
  end if;
  if r.cleanup_deadline>clock_timestamp() and f.expires_at>clock_timestamp() then
    raise exception 'EXPIRED_RELEASE_RECOVERY_NOT_REQUIRED';
  end if;
  if not exists(select 1 from public.tenants t where t.id=f.tenant_id and t.name=f.expected_tenant_name and t.name like f.marker || '%')
     or not exists(select 1 from public.stores s where s.id=f.store_id and s.tenant_id=f.tenant_id)
     or not exists(select 1 from public.memberships m where m.id=f.membership_id and m.tenant_id=f.tenant_id and m.store_id=f.store_id and m.user_id=f.user_id)
     or not exists(select 1 from auth.users u where u.id=f.user_id and coalesce(u.raw_app_meta_data->>'release_qa_run_id','')=p_run_id::text) then
    raise exception 'EXPIRED_RELEASE_RECOVERY_SCOPE_UNPROVEN';
  end if;

  update qa_internal.runs
  set cleanup_deadline=clock_timestamp()+interval '48 hours',
      next_action='adopt-signup-fixture',
      updated_at=clock_timestamp()
  where run_id=p_run_id;
  update qa_internal.fixtures
  set expires_at=clock_timestamp()+interval '24 hours',
      cleanup_state='REGISTERED'
  where run_id=p_run_id;
  insert into qa_internal.state_events(run_id,from_state,to_state,next_action,safe_detail)
  values(p_run_id,'PROVISIONING','PROVISIONING','adopt-signup-fixture',jsonb_build_object('expired_release_fixture_reclaimed',true));

  return jsonb_build_object('run_id',p_run_id,'reclaimed',true,'state','PROVISIONING');
end;
$$;

revoke all on function public.qa_lifecycle_reclaim_expired_release_fixture(uuid) from public, anon, authenticated;
grant execute on function public.qa_lifecycle_reclaim_expired_release_fixture(uuid) to service_role;
alter function public.qa_lifecycle_reclaim_expired_release_fixture(uuid) owner to postgres;

-- Keep the normal-path readiness contract closed over every callable
-- lifecycle function. The recovery function is service-role-only and is
-- therefore counted explicitly rather than becoming an untracked exception.
create or replace function public.qa_lifecycle_cleanup_readiness()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_private_schema boolean; v_trigger boolean; v_public_execute integer; v_service_execute integer;
begin
  perform qa_internal.assert_operator();
  select not has_schema_privilege('anon','qa_internal','USAGE') and not has_schema_privilege('authenticated','qa_internal','USAGE') into v_private_schema;
  select exists(select 1 from pg_trigger where tgrelid='public.memberships'::regclass and tgname='guard_membership_owner_and_identity' and tgenabled<>'D') into v_trigger;
  select count(*) into v_public_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_reclaim_expired_release_fixture(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('public',f.oid,'EXECUTE');
  select count(*) into v_service_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_reclaim_expired_release_fixture(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('service_role',f.oid,'EXECUTE');
  return jsonb_build_object('ready',v_private_schema and v_trigger and v_public_execute=0 and v_service_execute=15,'private_schema',v_private_schema,'last_owner_guard_enabled',v_trigger,'public_execute_count',v_public_execute,'service_execute_count',v_service_execute,'dry_run_supported',true,'auth_hard_delete_path','admin-api','cta_matrix','registry_bound','expired_release_recovery','service_role_only');
end;
$$;
revoke all on function public.qa_lifecycle_cleanup_readiness() from public, anon, authenticated;
grant execute on function public.qa_lifecycle_cleanup_readiness() to service_role;
alter function public.qa_lifecycle_cleanup_readiness() owner to postgres;

notify pgrst, 'reload schema';
commit;
