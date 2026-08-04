-- Provision only a pre-registered canary. This avoids broad service_role table grants.
begin;

create or replace function public.qa_lifecycle_provision_canary(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r qa_internal.runs%rowtype;
  f qa_internal.fixtures%rowtype;
  v_email text;
begin
  perform qa_internal.assert_operator();
  select * into strict r from qa_internal.runs where run_id=p_run_id for update;
  select * into strict f from qa_internal.fixtures where run_id=p_run_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text,0));
  if r.state <> 'PROVISIONING' or f.fixture_type <> 'canary' or f.cleanup_state <> 'REGISTERED' then
    raise exception 'CANARY_PROVISION_CONTRACT_INVALID';
  end if;
  if r.cleanup_deadline <= clock_timestamp() or f.expires_at <= clock_timestamp() then raise exception 'QA_RUN_EXPIRED'; end if;
  if f.expected_tenant_name not like f.marker || '%' then raise exception 'CANARY_MARKER_MISMATCH'; end if;
  select lower(email) into strict v_email from auth.users where id=f.user_id;
  if v_email is null then raise exception 'CANARY_AUTH_EMAIL_MISSING'; end if;

  insert into public.tenants(id,name,status,plan_code,created_by,updated_by)
  values(f.tenant_id,f.expected_tenant_name,'active','free',f.user_id,f.user_id)
  on conflict(id) do nothing;
  if not exists(select 1 from public.tenants where id=f.tenant_id and name=f.expected_tenant_name and name like f.marker || '%') then raise exception 'CANARY_TENANT_CONFLICT'; end if;

  insert into public.stores(id,name,company_name,email,status,plan_code,tenant_id,created_by,updated_by,onboarding_completed_at)
  values(f.store_id,f.marker || ' 受入監査店',f.expected_tenant_name,v_email,'active','free',f.tenant_id,f.user_id,f.user_id,clock_timestamp())
  on conflict(id) do nothing;
  if not exists(select 1 from public.stores where id=f.store_id and tenant_id=f.tenant_id) then raise exception 'CANARY_STORE_CONFLICT'; end if;

  insert into public.memberships(id,tenant_id,store_id,user_id,email,role,status,joined_at,invite_accepted_at,created_by,updated_by)
  values(f.membership_id,f.tenant_id,f.store_id,f.user_id,v_email,'owner','active',clock_timestamp(),clock_timestamp(),f.user_id,f.user_id)
  on conflict(id) do nothing;
  if not exists(select 1 from public.memberships where id=f.membership_id and tenant_id=f.tenant_id and store_id=f.store_id and user_id=f.user_id and role='owner') then raise exception 'CANARY_MEMBERSHIP_CONFLICT'; end if;

  insert into public.store_members(store_id,user_id,email,role,status,joined_at)
  values(f.store_id,f.user_id,v_email,'owner','active',clock_timestamp())
  on conflict(store_id,user_id) do nothing;
  insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by)
  values(f.membership_id,f.tenant_id,f.store_id,f.user_id)
  on conflict(membership_id,store_id) do nothing;
  insert into public.company_subscriptions(company_id,tenant_id,plan,status,included_staff_count,extra_staff_count,included_store_count,extra_store_count,storage_limit_mb,extra_storage_gb,current_inventory_limit,l_link_integration_enabled)
  select f.store_id,f.tenant_id,'free','active',1,0,1,0,500,0,5,false
  where not exists(select 1 from public.company_subscriptions where company_id=f.store_id);
  if not exists(select 1 from public.company_subscriptions where company_id=f.store_id and tenant_id=f.tenant_id and plan='free') then raise exception 'CANARY_SUBSCRIPTION_CONFLICT'; end if;

  return jsonb_build_object('run_id',p_run_id,'provisioned',true,'tenant_rows',1,'store_rows',1,'membership_rows',1);
end;
$$;

revoke all on function public.qa_lifecycle_provision_canary(uuid) from public,anon,authenticated;
grant execute on function public.qa_lifecycle_provision_canary(uuid) to service_role;
alter function public.qa_lifecycle_provision_canary(uuid) owner to postgres;

create or replace function public.qa_lifecycle_cleanup_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_private_schema boolean;
  v_trigger boolean;
  v_public_execute integer;
  v_service_execute integer;
begin
  perform qa_internal.assert_operator();
  select not has_schema_privilege('anon','qa_internal','USAGE') and not has_schema_privilege('authenticated','qa_internal','USAGE') into v_private_schema;
  select exists(select 1 from pg_trigger where tgrelid='public.memberships'::regclass and tgname='guard_membership_owner_and_identity' and tgenabled<>'D') into v_trigger;
  select count(*) into v_public_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),
    ('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),
    ('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),
    ('public.qa_lifecycle_provision_canary(uuid)'::regprocedure),
    ('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),
    ('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),
    ('public.qa_lifecycle_finalize(uuid)'::regprocedure),
    ('public.qa_lifecycle_status(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') or has_function_privilege('public',f.oid,'EXECUTE');
  select count(*) into v_service_execute from (values
    ('public.qa_lifecycle_register_run(uuid,text,text,text,text,timestamptz)'::regprocedure),
    ('public.qa_lifecycle_transition(uuid,text,text,text,text,jsonb)'::regprocedure),
    ('public.qa_lifecycle_register_fixture(uuid,uuid,text,uuid,uuid,uuid,text,text,timestamptz)'::regprocedure),
    ('public.qa_lifecycle_provision_canary(uuid)'::regprocedure),
    ('public.qa_lifecycle_teardown(uuid,boolean)'::regprocedure),
    ('public.qa_lifecycle_verify_clean(uuid,boolean)'::regprocedure),
    ('public.qa_lifecycle_finalize(uuid)'::regprocedure),
    ('public.qa_lifecycle_status(uuid)'::regprocedure)
  ) f(oid) where has_function_privilege('service_role',f.oid,'EXECUTE');
  return jsonb_build_object('ready',v_private_schema and v_trigger and v_public_execute=0 and v_service_execute=8,'private_schema',v_private_schema,'last_owner_guard_enabled',v_trigger,'public_execute_count',v_public_execute,'service_execute_count',v_service_execute,'dry_run_supported',true,'auth_hard_delete_path','admin-api');
end;
$$;

revoke all on function public.qa_lifecycle_cleanup_readiness() from public,anon,authenticated;
grant execute on function public.qa_lifecycle_cleanup_readiness() to service_role;
alter function public.qa_lifecycle_cleanup_readiness() owner to postgres;

commit;
