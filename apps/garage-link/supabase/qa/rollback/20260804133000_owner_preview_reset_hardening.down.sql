begin;
alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_user_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_user_id_fkey foreign key (user_id) references auth.users(id) on delete restrict;
alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_tenant_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete restrict;
alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_store_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_store_id_fkey foreign key (store_id) references public.stores(id) on delete restrict;
alter table qa_internal.owner_preview_fixtures drop constraint if exists owner_preview_fixtures_membership_id_fkey;
alter table qa_internal.owner_preview_fixtures add constraint owner_preview_fixtures_membership_id_fkey foreign key (membership_id) references public.memberships(id) on delete restrict;
drop function if exists qa_internal.owner_preview_reset_context_matches(uuid,uuid,uuid,uuid);
create or replace function public.guard_membership_owner_and_identity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_other_owner_count bigint;
begin
  if tg_op='UPDATE' and (new.tenant_id,new.store_id,new.user_id) is distinct from (old.tenant_id,old.store_id,old.user_id)
     and current_user not in ('postgres','supabase_admin','service_role') then raise exception using errcode='42501',message='membershipの所属先は直接変更できません。'; end if;
  if old.role='owner' and old.status='active' and old.disabled_at is null and old.deleted_at is null and
     (tg_op='DELETE' or new.role<>'owner' or new.status<>'active' or new.disabled_at is not null or new.deleted_at is not null) then
    perform 1 from public.tenants where id=old.tenant_id for update;
    select count(*) into v_other_owner_count from public.memberships m join public.stores s on s.id=m.store_id and s.tenant_id=m.tenant_id and public.store_is_authorization_eligible(s.status)
     where m.tenant_id=old.tenant_id and m.id<>old.id and m.role='owner' and m.status='active' and m.disabled_at is null and m.deleted_at is null and coalesce(m.invite_accepted_at,m.joined_at) is not null and public.membership_legacy_is_consistent(m.tenant_id,m.store_id,m.user_id,m.role);
    if v_other_owner_count=0 then raise exception using errcode='23514',message='最後のownerは変更できません。'; end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
alter function public.guard_membership_owner_and_identity() owner to postgres;
create or replace function public.qa_owner_preview_reset_fixture(p_environment text,p_project_ref text,p_purpose text,p_marker text)
returns jsonb language plpgsql security definer volatile set search_path = '' as $$
declare v qa_internal.owner_preview_fixtures%rowtype;
begin
  if public.garage_request_jwt_role()<>'service_role' and session_user not in ('postgres','supabase_admin') then raise insufficient_privilege using message='service role required'; end if;
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
revoke all on function public.qa_owner_preview_reset_fixture(text,text,text,text) from public,anon,authenticated;
grant execute on function public.qa_owner_preview_reset_fixture(text,text,text,text) to service_role;
alter function public.qa_owner_preview_reset_fixture(text,text,text,text) owner to postgres;
commit;
