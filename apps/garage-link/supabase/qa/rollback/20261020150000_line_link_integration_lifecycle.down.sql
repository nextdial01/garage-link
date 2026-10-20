begin;
do $$
begin
  if exists(select 1 from qa_internal.line_link_integration_runs where state<>'CLEANED') then
    raise exception 'L_LINK_INTEGRATION_ROLLBACK_ACTIVE_RUNS';
  end if;
  if exists(
    select 1 from qa_internal.line_link_integration_runs i
    where exists(select 1 from public.inspection_reminder_events e where e.id=any(i.event_ids) and e.store_id=i.store_id)
       or exists(select 1 from public.line_link_connections c where c.id=i.connection_id and c.store_id=i.store_id)
       or exists(select 1 from public.line_link_inbound_nonces n where n.store_id=i.store_id)
       or exists(select 1 from public.company_subscriptions s where s.id=i.subscription_id and s.company_id=i.store_id and s.l_link_integration_enabled)
  ) then raise exception 'L_LINK_INTEGRATION_ROLLBACK_RESIDUALS'; end if;
end;
$$;

drop function public.qa_l_link_integration_verify_clean(uuid);
drop function public.qa_l_link_integration_cleanup(uuid);
drop function public.qa_l_link_integration_dry_run(uuid);
drop function public.qa_l_link_integration_reset_event(uuid,uuid);
drop function public.qa_l_link_integration_provision(uuid,text);
drop table qa_internal.line_link_integration_runs;

create or replace function public.qa_lifecycle_cleanup_readiness()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_private_schema boolean; v_trigger boolean; v_public_execute integer; v_service_execute integer;
begin
  perform qa_internal.assert_operator();
  select not has_schema_privilege('anon','qa_internal','USAGE') and not has_schema_privilege('authenticated','qa_internal','USAGE') into v_private_schema;
  select exists(select 1 from pg_trigger where tgrelid='public.memberships'::regclass and tgname='guard_membership_owner_and_identity' and tgenabled<>'D') into v_trigger;
  select count(*) into v_public_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_reclaim_expired_release_fixture(uuid)'::regprocedure),('public.qa_lifecycle_adopt_primary_unmarked_release_fixture(uuid,uuid,text,uuid,uuid,uuid,text,timestamptz)'::regprocedure)
  ) f(oid) where has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('public',f.oid,'EXECUTE');
  select count(*) into v_service_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_reclaim_expired_release_fixture(uuid)'::regprocedure),('public.qa_lifecycle_adopt_primary_unmarked_release_fixture(uuid,uuid,text,uuid,uuid,uuid,text,timestamptz)'::regprocedure)
  ) f(oid) where has_function_privilege('service_role',f.oid,'EXECUTE');
  return jsonb_build_object('ready',v_private_schema and v_trigger and v_public_execute=0 and v_service_execute=16,
    'private_schema',v_private_schema,'last_owner_guard_enabled',v_trigger,'public_execute_count',v_public_execute,
    'service_execute_count',v_service_execute,'dry_run_supported',true,'auth_hard_delete_path','admin-api',
    'cta_matrix','registry_bound','expired_release_recovery','service_role_only','primary_unmarked_actual_email_adoption','service_role_only');
end;
$$;
revoke all on function public.qa_lifecycle_cleanup_readiness() from public,anon,authenticated;
grant execute on function public.qa_lifecycle_cleanup_readiness() to service_role;
alter function public.qa_lifecycle_cleanup_readiness() owner to postgres;
notify pgrst,'reload schema';
commit;
