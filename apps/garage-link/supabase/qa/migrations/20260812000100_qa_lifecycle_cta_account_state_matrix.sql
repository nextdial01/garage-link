-- Staging-only, registry-bound account-state fixtures for the Release Critical
-- vehicle CTA differential. This never grants application roles extra access,
-- never disables RLS/triggers, and never writes Stripe identifiers.
begin;

create table if not exists qa_internal.cta_matrix_fixtures (
  run_id uuid not null references qa_internal.runs(run_id) on delete cascade,
  state text not null check (state in (
    'active_owner','active_non_owner','selection_required',
    'onboarding_incomplete','contract_restricted','admin_security_unverified'
  )),
  marker text not null check (marker ~ '^\[RELEASE QA [0-9]{8}\]$'),
  subject_user_id uuid not null references auth.users(id) on delete restrict,
  support_user_id uuid references auth.users(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  primary_store_id uuid not null references public.stores(id) on delete restrict,
  secondary_store_id uuid references public.stores(id) on delete restrict,
  subject_membership_id uuid not null references public.memberships(id) on delete restrict,
  support_membership_id uuid references public.memberships(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_id, state),
  unique (tenant_id),
  check ((state='active_non_owner') = (support_user_id is not null and support_membership_id is not null)),
  check ((state='selection_required') = (secondary_store_id is not null))
);
revoke all on table qa_internal.cta_matrix_fixtures from public, anon, authenticated, service_role;

create or replace function qa_internal.cta_matrix_subject_id(p_subjects jsonb,p_state text,p_key text)
returns uuid language plpgsql immutable set search_path = '' as $$
declare v_text text;
begin
  v_text:=p_subjects->p_state->>p_key;
  if v_text is null or v_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'CTA_MATRIX_SUBJECT_INVALID:%:%',p_state,p_key;
  end if;
  return v_text::uuid;
end;
$$;
revoke all on function qa_internal.cta_matrix_subject_id(jsonb,text,text) from public, anon, authenticated, service_role;

create or replace function qa_internal.cta_matrix_assert_auth_user(p_user_id uuid,p_run_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  select lower(email) into v_email
  from auth.users
  where id=p_user_id
    and coalesce(raw_app_meta_data->>'purpose','')='release-cta-matrix'
    and coalesce(raw_app_meta_data->>'release_qa_cta_matrix_run_id','')=p_run_id::text;
  if v_email is null or v_email !~ '@[^@]+\.invalid$' then raise exception 'CTA_MATRIX_AUTH_SUBJECT_UNPROVEN'; end if;
  return v_email;
end;
$$;
revoke all on function qa_internal.cta_matrix_assert_auth_user(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function qa_internal.cta_matrix_reset_context_matches(
  p_tenant_id uuid,p_membership_id uuid,p_user_id uuid,p_store_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from qa_internal.cta_matrix_fixtures f
    join qa_internal.runs r on r.run_id=f.run_id
    join public.tenants t on t.id=f.tenant_id and t.name like f.marker || ' CTA % Tenant'
    join auth.users u on u.id=p_user_id
    where f.run_id=current_setting('qa.cta_matrix_run_id',true)::uuid
      and r.environment='staging' and r.project_ref='gaytoojzwqkpuvfofeql'
      and f.tenant_id=p_tenant_id
      and (f.subject_membership_id=p_membership_id or f.support_membership_id=p_membership_id)
      and (f.subject_user_id=p_user_id or f.support_user_id=p_user_id)
      and (f.primary_store_id=p_store_id or f.secondary_store_id=p_store_id)
      and coalesce(u.raw_app_meta_data->>'purpose','')='release-cta-matrix'
      and coalesce(u.raw_app_meta_data->>'release_qa_cta_matrix_run_id','')=f.run_id::text
  );
$$;
revoke all on function qa_internal.cta_matrix_reset_context_matches(uuid,uuid,uuid,uuid) from public, anon, authenticated, service_role;

-- Keep the normal last-owner invariant. Matrix teardown is allowed only while
-- its exact private registry row and transaction-local run context agree.
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
       or qa_internal.owner_preview_reset_context_matches(old.tenant_id,old.id,old.user_id,old.store_id)
       or qa_internal.cta_matrix_reset_context_matches(old.tenant_id,old.id,old.user_id,old.store_id) then
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

create or replace function public.qa_lifecycle_cta_matrix(p_run_id uuid,p_action text,p_subjects jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r qa_internal.runs%rowtype;
  f qa_internal.fixtures%rowtype;
  x qa_internal.cta_matrix_fixtures%rowtype;
  v_state text;
  v_subject uuid;
  v_support uuid;
  v_subject_email text;
  v_support_email text;
  v_tenant uuid;
  v_store uuid;
  v_second_store uuid;
  v_membership uuid;
  v_support_membership uuid;
  v_marker text;
  v_store_count integer;
  v_membership_count integer;
  v_auth_ids jsonb := '[]'::jsonb;
  v_auth_residual bigint;
  v_tenant_residual bigint;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  select * into strict f from qa_internal.fixtures where run_id=p_run_id;
  if r.environment<>'staging' or r.project_ref<>'gaytoojzwqkpuvfofeql' or r.state not in ('TEST_RUNNING','TEST_COMPLETE') then
    raise exception 'CTA_MATRIX_RUN_CONTRACT_INVALID';
  end if;
  v_marker:=f.marker;
  if p_action='provision' then
    if jsonb_typeof(p_subjects)<>'object' then raise exception 'CTA_MATRIX_SUBJECTS_REQUIRED'; end if;
    for v_state in select unnest(array['active_owner','active_non_owner','selection_required','onboarding_incomplete','contract_restricted','admin_security_unverified']) loop
      v_subject:=qa_internal.cta_matrix_subject_id(p_subjects,v_state,'subject_user_id');
      v_support:=case when v_state='active_non_owner' then qa_internal.cta_matrix_subject_id(p_subjects,v_state,'support_user_id') else null end;
      v_subject_email:=qa_internal.cta_matrix_assert_auth_user(v_subject,p_run_id);
      if v_support is not null then
        if v_support=v_subject then raise exception 'CTA_MATRIX_SUBJECT_COLLISION'; end if;
        v_support_email:=qa_internal.cta_matrix_assert_auth_user(v_support,p_run_id);
      end if;
      select * into x from qa_internal.cta_matrix_fixtures where run_id=p_run_id and state=v_state for update;
      if found then
        if x.subject_user_id<>v_subject or x.support_user_id is distinct from v_support or x.marker<>v_marker then raise exception 'CTA_MATRIX_IDEMPOTENCY_MISMATCH'; end if;
        continue;
      end if;
      insert into public.tenants(name,status,plan_code,created_by,updated_by)
      values(v_marker||' CTA '||v_state||' Tenant','active','free',v_subject,v_subject) returning id into v_tenant;
      insert into public.stores(name,company_name,email,status,plan_code,tenant_id,created_by,updated_by,onboarding_completed_at)
      values(v_marker||' CTA '||v_state||' Store',v_marker||' CTA Tenant',v_subject_email,'active','free',v_tenant,v_subject,v_subject,
        case when v_state='onboarding_incomplete' then null else clock_timestamp() end) returning id into v_store;
      v_second_store:=null;
      if v_state='selection_required' then
        insert into public.stores(name,company_name,email,status,plan_code,tenant_id,created_by,updated_by,onboarding_completed_at)
        values(v_marker||' CTA '||v_state||' Store B',v_marker||' CTA Tenant',v_subject_email,'active','free',v_tenant,v_subject,v_subject,clock_timestamp()) returning id into v_second_store;
      end if;
      if v_state='active_non_owner' then
        insert into public.memberships(tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at,created_by,updated_by)
        values(v_tenant,v_store,v_support,v_support_email,'owner','active',clock_timestamp(),clock_timestamp(),v_support,v_support) returning id into v_support_membership;
        insert into public.memberships(tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at,created_by,updated_by)
        values(v_tenant,v_store,v_subject,v_subject_email,'staff','active',clock_timestamp(),clock_timestamp(),v_support,v_support) returning id into v_membership;
        insert into public.store_members(store_id,user_id,email,role,status,joined_at) values(v_store,v_support,v_support_email,'owner','active',clock_timestamp());
        insert into public.store_members(store_id,user_id,email,role,status,joined_at) values(v_store,v_subject,v_subject_email,'staff','active',clock_timestamp());
        insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by) values(v_support_membership,v_tenant,v_store,v_support);
        insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by) values(v_membership,v_tenant,v_store,v_support);
      else
        insert into public.memberships(tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at,created_by,updated_by)
        values(v_tenant,v_store,v_subject,v_subject_email,'owner','active',clock_timestamp(),clock_timestamp(),v_subject,v_subject) returning id into v_membership;
        v_support_membership:=null;
        insert into public.store_members(store_id,user_id,email,role,status,joined_at) values(v_store,v_subject,v_subject_email,'owner','active',clock_timestamp());
        insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by) values(v_membership,v_tenant,v_store,v_subject);
        if v_second_store is not null then
          insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by) values(v_membership,v_tenant,v_second_store,v_subject);
        end if;
      end if;
      insert into public.company_subscriptions(company_id,tenant_id,plan,status,billing_state,included_staff_count,extra_staff_count,included_store_count,extra_store_count,storage_limit_mb,extra_storage_gb,current_inventory_limit,l_link_integration_enabled)
      values(
        v_store,v_tenant,
        case when v_state='active_non_owner' then 'standard' when v_state='selection_required' then 'pro' else 'free' end,
        case when v_state='contract_restricted' then 'suspended' else 'active' end,
        case when v_state='contract_restricted' then 'restricted' else 'active' end,
        case when v_state='active_non_owner' then 3 when v_state='selection_required' then 10 else 1 end,0,
        case when v_state='selection_required' then 3 else 1 end,0,
        case when v_state='selection_required' then 51200 when v_state='active_non_owner' then 10240 else 500 end,0,
        case when v_state='selection_required' then 500 when v_state='active_non_owner' then 200 else 5 end,false
      );
      insert into qa_internal.cta_matrix_fixtures(run_id,state,marker,subject_user_id,support_user_id,tenant_id,primary_store_id,secondary_store_id,subject_membership_id,support_membership_id)
      values(p_run_id,v_state,v_marker,v_subject,v_support,v_tenant,v_store,v_second_store,v_membership,v_support_membership);
    end loop;
    return jsonb_build_object('run_id',p_run_id,'state','PROVISIONED','fixture_count',6,'marker',v_marker);
  elsif p_action='reset' then
    perform set_config('qa.cta_matrix_run_id',p_run_id::text,true);
    for x in select * from qa_internal.cta_matrix_fixtures where run_id=p_run_id order by state for update loop
      if not exists(select 1 from public.tenants where id=x.tenant_id and name=x.marker||' CTA '||x.state||' Tenant')
         or not exists(select 1 from public.stores where id=x.primary_store_id and tenant_id=x.tenant_id and name=x.marker||' CTA '||x.state||' Store')
         or (x.secondary_store_id is not null and not exists(select 1 from public.stores where id=x.secondary_store_id and tenant_id=x.tenant_id and name=x.marker||' CTA '||x.state||' Store B')) then
        raise exception 'CTA_MATRIX_SCOPE_MISMATCH';
      end if;
      perform qa_internal.cta_matrix_assert_auth_user(x.subject_user_id,p_run_id);
      if x.support_user_id is not null then perform qa_internal.cta_matrix_assert_auth_user(x.support_user_id,p_run_id); end if;
      delete from public.admin_trusted_sessions where user_id in (x.subject_user_id,x.support_user_id);
      delete from public.admin_email_otp_challenges where user_id in (x.subject_user_id,x.support_user_id);
      delete from public.user_active_store_preferences where tenant_id=x.tenant_id and user_id in (x.subject_user_id,x.support_user_id);
      delete from public.company_subscriptions where tenant_id=x.tenant_id and company_id in (x.primary_store_id,x.secondary_store_id);
      delete from public.membership_store_assignments where tenant_id=x.tenant_id and membership_id in (x.subject_membership_id,x.support_membership_id);
      delete from public.store_members where store_id in (x.primary_store_id,x.secondary_store_id) and user_id in (x.subject_user_id,x.support_user_id);
      delete from public.memberships where id in (x.subject_membership_id,x.support_membership_id) and tenant_id=x.tenant_id;
      get diagnostics v_membership_count=row_count;
      if v_membership_count<>(case when x.support_membership_id is null then 1 else 2 end) then raise exception 'CTA_MATRIX_MEMBERSHIP_DELETE_COUNT'; end if;
      delete from public.stores where id in (x.primary_store_id,x.secondary_store_id) and tenant_id=x.tenant_id;
      get diagnostics v_store_count=row_count;
      if v_store_count<>(case when x.secondary_store_id is null then 1 else 2 end) then raise exception 'CTA_MATRIX_STORE_DELETE_COUNT'; end if;
      delete from public.tenants where id=x.tenant_id and name=x.marker||' CTA '||x.state||' Tenant';
      if not found then raise exception 'CTA_MATRIX_TENANT_DELETE_COUNT'; end if;
      v_auth_ids:=v_auth_ids || jsonb_build_array(x.subject_user_id::text);
      if x.support_user_id is not null then v_auth_ids:=v_auth_ids || jsonb_build_array(x.support_user_id::text); end if;
    end loop;
    delete from qa_internal.cta_matrix_fixtures where run_id=p_run_id;
    return jsonb_build_object('run_id',p_run_id,'state','DB_CLEANED','auth_user_ids',v_auth_ids);
  elsif p_action='verify_clean' then
    if jsonb_typeof(p_subjects->'auth_user_ids')<>'array' then raise exception 'CTA_MATRIX_AUTH_READBACK_REQUIRED'; end if;
    select count(*) into v_auth_residual from auth.users u
    where u.id in (select value::uuid from jsonb_array_elements_text(p_subjects->'auth_user_ids') value);
    select count(*) into v_tenant_residual from public.tenants where name like v_marker || ' CTA % Tenant';
    if v_auth_residual<>0 or v_tenant_residual<>0 or exists(select 1 from qa_internal.cta_matrix_fixtures where run_id=p_run_id) then
      raise exception 'CTA_MATRIX_RESIDUAL:%:%',v_auth_residual,v_tenant_residual;
    end if;
    return jsonb_build_object('run_id',p_run_id,'clean',true,'auth_user_residual',0,'tenant_residual',0,'fixture_residual',0);
  end if;
  raise exception 'CTA_MATRIX_ACTION_INVALID';
end;
$$;
revoke all on function public.qa_lifecycle_cta_matrix(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.qa_lifecycle_cta_matrix(uuid,text,jsonb) to service_role;
alter function public.qa_lifecycle_cta_matrix(uuid,text,jsonb) owner to postgres;

create or replace function public.qa_lifecycle_cleanup_readiness()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_private_schema boolean; v_trigger boolean; v_public_execute integer; v_service_execute integer;
begin
  perform qa_internal.assert_operator();
  select not has_schema_privilege('anon','qa_internal','USAGE') and not has_schema_privilege('authenticated','qa_internal','USAGE') into v_private_schema;
  select exists(select 1 from pg_trigger where tgrelid='public.memberships'::regclass and tgname='guard_membership_owner_and_identity' and tgenabled<>'D') into v_trigger;
  select count(*) into v_public_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure)
  ) f(oid) where has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('public',f.oid,'EXECUTE');
  select count(*) into v_service_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),('public.qa_lifecycle_finalize(uuid)'::regprocedure),('public.qa_lifecycle_status(uuid)'::regprocedure),('public.qa_lifecycle_abort_clean(uuid,text)'::regprocedure),('public.qa_lifecycle_record_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_advance_cleanup(uuid,text,text,text)'::regprocedure),('public.qa_lifecycle_record_auth_evidence(uuid,uuid)'::regprocedure),('public.qa_lifecycle_record_verified_evidence(uuid,text,jsonb)'::regprocedure),('public.qa_lifecycle_record_public_marker_evidence(uuid)'::regprocedure),('public.qa_lifecycle_cta_matrix(uuid,text,jsonb)'::regprocedure)
  ) f(oid) where has_function_privilege('service_role',f.oid,'EXECUTE');
  return jsonb_build_object('ready',v_private_schema and v_trigger and v_public_execute=0 and v_service_execute=14,'private_schema',v_private_schema,'last_owner_guard_enabled',v_trigger,'public_execute_count',v_public_execute,'service_execute_count',v_service_execute,'dry_run_supported',true,'auth_hard_delete_path','admin-api','cta_matrix','registry_bound');
end;
$$;
revoke all on function public.qa_lifecycle_cleanup_readiness() from public, anon, authenticated;
grant execute on function public.qa_lifecycle_cleanup_readiness() to service_role;
alter function public.qa_lifecycle_cleanup_readiness() owner to postgres;

notify pgrst, 'reload schema';
commit;
