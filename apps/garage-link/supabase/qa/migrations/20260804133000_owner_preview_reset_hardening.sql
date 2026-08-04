begin;

alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_user_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_tenant_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;
alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_store_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_store_id_fkey foreign key (store_id) references public.stores(id) on delete cascade;
alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_membership_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_membership_id_fkey foreign key (membership_id) references public.memberships(id) on delete cascade;

create or replace function qa_internal.owner_preview_reset_context_matches(
  p_tenant_id uuid, p_membership_id uuid, p_user_id uuid, p_store_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from qa_internal.owner_preview_fixtures f
      join public.tenants t on t.id=f.tenant_id and t.name=f.marker||' Synthetic Tenant'
      join public.stores s on s.id=f.store_id and s.tenant_id=f.tenant_id and s.name=f.marker||' Synthetic Store'
      join auth.users u on u.id=f.user_id
     where f.environment='preview' and f.project_ref='gaytoojzwqkpuvfofeql'
       and f.purpose='owner-preview' and f.marker='[OWNER PREVIEW QA 20260804]'
       and f.tenant_id=p_tenant_id and f.membership_id=p_membership_id
       and f.user_id=p_user_id and f.store_id=p_store_id
       and coalesce(u.raw_user_meta_data->>'purpose','')='owner-preview'
       and coalesce(u.raw_user_meta_data->>'marker','')=f.marker
       and current_setting('qa.owner_preview_reset_user_id', true)=f.user_id::text
  );
$$;
revoke all on function qa_internal.owner_preview_reset_context_matches(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

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
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
alter function public.guard_membership_owner_and_identity() owner to postgres;

create or replace function public.qa_owner_preview_reset_fixture(p_environment text,p_project_ref text,p_purpose text,p_marker text)
returns jsonb language plpgsql security definer volatile set search_path = '' as $$
declare v qa_internal.owner_preview_fixtures%rowtype; n bigint; u jsonb;
begin
  if public.garage_request_jwt_role()<>'service_role' and session_user not in ('postgres','supabase_admin') then raise insufficient_privilege using message='service role required'; end if;
  if p_environment<>'preview' or p_project_ref<>'gaytoojzwqkpuvfofeql' or p_purpose<>'owner-preview' or p_marker<>'[OWNER PREVIEW QA 20260804]' then return jsonb_build_object('reset',false); end if;
  select * into v from qa_internal.owner_preview_fixtures where environment=p_environment and project_ref=p_project_ref and purpose=p_purpose and marker=p_marker for update;
  if not found then return jsonb_build_object('reset',false); end if;
  if not exists(select 1 from auth.users where id=v.user_id and coalesce(raw_user_meta_data->>'purpose','')=p_purpose and coalesce(raw_user_meta_data->>'marker','')=p_marker) then raise exception 'OWNER_PREVIEW_USER_INVALID'; end if;
  if not exists(select 1 from public.tenants where id=v.tenant_id and name=p_marker||' Synthetic Tenant') or not exists(select 1 from public.stores where id=v.store_id and tenant_id=v.tenant_id and name=p_marker||' Synthetic Store') then raise exception 'OWNER_PREVIEW_SCOPE_INVALID'; end if;
  perform set_config('qa.owner_preview_reset_user_id',v.user_id::text,true);
  delete from public.admin_trusted_sessions where user_id=v.user_id;
  get diagnostics n=row_count; if n>1 then raise exception 'OWNER_PREVIEW_TRUSTED_DELETE_COUNT'; end if;
  delete from public.admin_email_otp_challenges where user_id=v.user_id;
  get diagnostics n=row_count; if n>1 then raise exception 'OWNER_PREVIEW_OTP_DELETE_COUNT'; end if;
  delete from public.company_subscriptions where company_id=v.store_id and tenant_id=v.tenant_id;
  get diagnostics n=row_count; if n>1 then raise exception 'OWNER_PREVIEW_SUBSCRIPTION_DELETE_COUNT'; end if;
  delete from public.membership_store_assignments where membership_id=v.membership_id and tenant_id=v.tenant_id and store_id=v.store_id;
  get diagnostics n=row_count; if n>1 then raise exception 'OWNER_PREVIEW_ASSIGNMENT_DELETE_COUNT'; end if;
  delete from public.memberships where id=v.membership_id and tenant_id=v.tenant_id and store_id=v.store_id and user_id=v.user_id;
  get diagnostics n=row_count; if n<>1 then raise exception 'OWNER_PREVIEW_MEMBERSHIP_DELETE_COUNT'; end if;
  delete from public.stores where id=v.store_id and tenant_id=v.tenant_id;
  get diagnostics n=row_count; if n<>1 then raise exception 'OWNER_PREVIEW_STORE_DELETE_COUNT'; end if;
  delete from public.tenants where id=v.tenant_id;
  get diagnostics n=row_count; if n<>1 then raise exception 'OWNER_PREVIEW_TENANT_DELETE_COUNT'; end if;
  if exists(select 1 from qa_internal.owner_preview_fixtures where purpose=v.purpose and marker=v.marker) then raise exception 'OWNER_PREVIEW_REGISTRY_RESIDUAL'; end if;
  return jsonb_build_object('reset',true,'purpose',v.purpose,'marker',v.marker);
end; $$;
revoke all on function public.qa_owner_preview_reset_fixture(text,text,text,text) from public,anon,authenticated;
grant execute on function public.qa_owner_preview_reset_fixture(text,text,text,text) to service_role;
alter function public.qa_owner_preview_reset_fixture(text,text,text,text) owner to postgres;
commit;
