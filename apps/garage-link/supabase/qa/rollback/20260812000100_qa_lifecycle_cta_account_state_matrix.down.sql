begin;

drop function if exists public.qa_lifecycle_cta_matrix(uuid,text,jsonb);
drop function if exists qa_internal.cta_matrix_reset_context_matches(uuid,uuid,uuid,uuid);
drop function if exists qa_internal.cta_matrix_assert_auth_user(uuid,uuid);
drop function if exists qa_internal.cta_matrix_subject_id(jsonb,text,text);
drop table if exists qa_internal.cta_matrix_fixtures;

create or replace function public.guard_membership_owner_and_identity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_other_owner_count bigint;
begin
  if tg_op='UPDATE' and (new.tenant_id,new.store_id,new.user_id) is distinct from (old.tenant_id,old.store_id,old.user_id)
     and current_user not in ('postgres','supabase_admin','service_role') then
    raise exception using errcode='42501',message='membershipの所属先は直接変更できません。';
  end if;
  if old.role='owner' and old.status='active' and old.disabled_at is null and old.deleted_at is null and
     (tg_op='DELETE' or new.role<>'owner' or new.status<>'active' or new.disabled_at is not null or new.deleted_at is not null) then
    if qa_internal.teardown_context_matches(old.tenant_id,old.id,old.user_id)
       or qa_internal.owner_preview_reset_context_matches(old.tenant_id,old.id,old.user_id,old.store_id) then
      if tg_op='DELETE' then return old; end if; return new;
    end if;
    perform 1 from public.tenants where id=old.tenant_id for update;
    select count(*) into v_other_owner_count from public.memberships m
      join public.stores s on s.id=m.store_id and s.tenant_id=m.tenant_id and public.store_is_authorization_eligible(s.status)
     where m.tenant_id=old.tenant_id and m.id<>old.id and m.role='owner' and m.status='active'
       and m.disabled_at is null and m.deleted_at is null and coalesce(m.invite_accepted_at,m.joined_at) is not null
       and public.membership_legacy_is_consistent(m.tenant_id,m.store_id,m.user_id,m.role);
    if v_other_owner_count=0 then raise exception using errcode='23514',message='最後のownerは変更できません。'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
alter function public.guard_membership_owner_and_identity() owner to postgres;

create or replace function public.qa_lifecycle_cleanup_readiness()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_private_schema boolean; v_trigger boolean; v_public_execute integer; v_service_execute integer;
begin
  perform qa_internal.assert_operator();
  select not has_schema_privilege('anon','qa_internal','USAGE') and not has_schema_privilege('authenticated','qa_internal','USAGE') into v_private_schema;
  select exists(select 1 from pg_trigger where tgrelid='public.memberships'::regclass and tgname='guard_membership_owner_and_identity' and tgenabled<>'D') into v_trigger;
  select count(*) into v_public_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('public',f.oid,'EXECUTE');
  select count(*) into v_service_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('service_role',f.oid,'EXECUTE');
  return jsonb_build_object('ready',v_private_schema and v_trigger and v_public_execute=0 and v_service_execute=13,'private_schema',v_private_schema,'last_owner_guard_enabled',v_trigger,'public_execute_count',v_public_execute,'service_execute_count',v_service_execute,'dry_run_supported',true,'auth_hard_delete_path','admin-api');
end;
$$;
revoke all on function public.qa_lifecycle_cleanup_readiness() from public, anon, authenticated;
grant execute on function public.qa_lifecycle_cleanup_readiness() to service_role;
alter function public.qa_lifecycle_cleanup_readiness() owner to postgres;

notify pgrst, 'reload schema';
commit;
