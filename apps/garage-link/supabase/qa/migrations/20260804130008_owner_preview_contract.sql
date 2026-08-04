begin;
create table if not exists qa_internal.owner_preview_fixtures (
  purpose text primary key check (purpose = 'owner-preview'),
  marker text not null check (marker ~ '^\[OWNER PREVIEW QA [0-9]{8}\]$'),
  environment text not null check (environment = 'preview'),
  project_ref text not null check (project_ref = 'gaytoojzwqkpuvfofeql'),
  user_id uuid not null references auth.users(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  reset_at timestamptz
);
revoke all on table qa_internal.owner_preview_fixtures from public, anon, authenticated;

create or replace function public.qa_owner_preview_status(p_environment text,p_project_ref text,p_purpose text,p_marker text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v qa_internal.owner_preview_fixtures%rowtype;
begin
  if public.garage_request_jwt_role() <> 'service_role' and session_user not in ('postgres','supabase_admin') then raise insufficient_privilege using message='service role required'; end if;
  if p_environment <> 'preview' or p_project_ref <> 'gaytoojzwqkpuvfofeql' or p_purpose <> 'owner-preview' or p_marker !~ '^\[OWNER PREVIEW QA [0-9]{8}\]$' then return null; end if;
  select * into v from qa_internal.owner_preview_fixtures where purpose=p_purpose and marker=p_marker and environment=p_environment and project_ref=p_project_ref and reset_at is null;
  if not found then return null; end if;
  return jsonb_build_object('purpose',v.purpose,'marker',v.marker,'environment',v.environment,'project_ref',v.project_ref,'user_id',v.user_id,'tenant_id',v.tenant_id,'store_id',v.store_id,'membership_id',v.membership_id);
end; $$;

create or replace function public.qa_owner_preview_ensure_fixture(p_environment text,p_project_ref text,p_purpose text,p_marker text,p_user_id uuid)
returns jsonb language plpgsql security definer volatile set search_path = '' as $$
declare v qa_internal.owner_preview_fixtures%rowtype; t uuid; s uuid; m uuid; e text;
begin
  if public.garage_request_jwt_role() <> 'service_role' and session_user not in ('postgres','supabase_admin') then raise insufficient_privilege using message='service role required'; end if;
  if p_environment <> 'preview' or p_project_ref <> 'gaytoojzwqkpuvfofeql' or p_purpose <> 'owner-preview' or p_marker !~ '^\[OWNER PREVIEW QA [0-9]{8}\]$' or p_user_id is null then raise exception 'OWNER_PREVIEW_CONTRACT_INVALID'; end if;
  select * into v from qa_internal.owner_preview_fixtures where purpose=p_purpose for update;
  if found then
    if v.marker<>p_marker or v.environment<>p_environment or v.project_ref<>p_project_ref or v.user_id<>p_user_id or v.reset_at is not null then raise exception 'OWNER_PREVIEW_FIXTURE_MISMATCH'; end if;
    return jsonb_build_object('purpose',v.purpose,'marker',v.marker,'environment',v.environment,'project_ref',v.project_ref,'user_id',v.user_id,'tenant_id',v.tenant_id,'store_id',v.store_id,'membership_id',v.membership_id);
  end if;
  select lower(email) into e from auth.users where id=p_user_id and coalesce(raw_user_meta_data->>'purpose','')=p_purpose;
  if e is null then raise exception 'OWNER_PREVIEW_USER_INVALID'; end if;
  insert into public.tenants(name,status,plan_code,created_by,updated_by) values(p_marker||' Synthetic Tenant','active','free',p_user_id,p_user_id) returning id into t;
  insert into public.stores(name,company_name,email,plan_code,status,tenant_id,created_by,updated_by) values(p_marker||' Synthetic Store',p_marker||' Synthetic Tenant',e,'free','active',t,p_user_id,p_user_id) returning id into s;
  insert into public.memberships(tenant_id,store_id,user_id,email,role,status,display_name,joined_at,invite_accepted_at,created_by,updated_by) values(t,s,p_user_id,e,'owner','active','Owner Preview',clock_timestamp(),clock_timestamp(),p_user_id,p_user_id) returning id into m;
  insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by) values(m,t,s,p_user_id);
  insert into public.company_subscriptions(company_id,tenant_id,plan,status,included_staff_count,extra_staff_count,included_store_count,extra_store_count,storage_limit_mb,extra_storage_gb,current_inventory_limit,l_link_integration_enabled) values(s,t,'free','active',1,0,1,0,500,0,5,false);
  insert into qa_internal.owner_preview_fixtures(purpose,marker,environment,project_ref,user_id,tenant_id,store_id,membership_id) values(p_purpose,p_marker,p_environment,p_project_ref,p_user_id,t,s,m);
  return jsonb_build_object('purpose',p_purpose,'marker',p_marker,'environment',p_environment,'project_ref',p_project_ref,'user_id',p_user_id,'tenant_id',t,'store_id',s,'membership_id',m);
end; $$;

create or replace function public.qa_owner_preview_reset_fixture(p_environment text,p_project_ref text,p_purpose text,p_marker text)
returns jsonb language plpgsql security definer volatile set search_path = '' as $$
declare v qa_internal.owner_preview_fixtures%rowtype;
begin
  if public.garage_request_jwt_role() <> 'service_role' and session_user not in ('postgres','supabase_admin') then raise insufficient_privilege using message='service role required'; end if;
  select * into v from qa_internal.owner_preview_fixtures where purpose=p_purpose and marker=p_marker and environment=p_environment and project_ref=p_project_ref for update;
  if not found then return jsonb_build_object('reset',false); end if;
  delete from public.company_subscriptions where company_id=v.store_id and tenant_id=v.tenant_id;
  delete from public.membership_store_assignments where membership_id=v.membership_id and tenant_id=v.tenant_id and store_id=v.store_id;
  delete from public.memberships where id=v.membership_id and tenant_id=v.tenant_id and store_id=v.store_id and user_id=v.user_id;
  delete from public.stores where id=v.store_id and tenant_id=v.tenant_id;
  delete from public.tenants where id=v.tenant_id;
  delete from qa_internal.owner_preview_fixtures where purpose=v.purpose and marker=v.marker and environment=v.environment and project_ref=v.project_ref;
  return jsonb_build_object('reset',true,'purpose',v.purpose,'marker',v.marker);
end; $$;

revoke all on function public.qa_owner_preview_status(text,text,text,text) from public,anon,authenticated;
revoke all on function public.qa_owner_preview_ensure_fixture(text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.qa_owner_preview_reset_fixture(text,text,text,text) from public,anon,authenticated;
grant execute on function public.qa_owner_preview_status(text,text,text,text) to service_role;
grant execute on function public.qa_owner_preview_ensure_fixture(text,text,text,text,uuid) to service_role;
grant execute on function public.qa_owner_preview_reset_fixture(text,text,text,text) to service_role;
alter function public.qa_owner_preview_status(text,text,text,text) owner to postgres;
alter function public.qa_owner_preview_ensure_fixture(text,text,text,text,uuid) owner to postgres;
alter function public.qa_owner_preview_reset_fixture(text,text,text,text) owner to postgres;
commit;
