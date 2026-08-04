begin;

create or replace function public.qa_owner_preview_reset_fixture(p_environment text,p_project_ref text,p_purpose text,p_marker text)
returns jsonb language plpgsql security definer volatile set search_path = '' as $$
declare v qa_internal.owner_preview_fixtures%rowtype; n bigint;
begin
  if public.garage_request_jwt_role() <> 'service_role' and session_user not in ('postgres','supabase_admin') then raise insufficient_privilege using message='service role required'; end if;
  select * into v from qa_internal.owner_preview_fixtures where purpose=p_purpose and marker=p_marker and environment=p_environment and project_ref=p_project_ref for update;
  if not found then return jsonb_build_object('reset',false); end if;
  delete from qa_internal.owner_preview_fixtures where purpose=v.purpose and marker=v.marker and environment=v.environment and project_ref=v.project_ref and user_id=v.user_id and tenant_id=v.tenant_id and store_id=v.store_id and membership_id=v.membership_id;
  get diagnostics n = row_count; if n <> 1 then raise exception 'OWNER_PREVIEW_REGISTRY_DELETE_COUNT'; end if;
  delete from public.admin_trusted_sessions where user_id=v.user_id;
  delete from public.admin_email_otp_challenges where user_id=v.user_id;
  delete from public.company_subscriptions where company_id=v.store_id and tenant_id=v.tenant_id;
  delete from public.membership_store_assignments where membership_id=v.membership_id and tenant_id=v.tenant_id and store_id=v.store_id;
  drop trigger if exists guard_membership_owner_and_identity on public.memberships;
  delete from public.memberships where id=v.membership_id and tenant_id=v.tenant_id and store_id=v.store_id and user_id=v.user_id;
  create trigger guard_membership_owner_and_identity before update or delete on public.memberships for each row execute function public.guard_membership_owner_and_identity();
  delete from public.stores where id=v.store_id and tenant_id=v.tenant_id;
  delete from public.tenants where id=v.tenant_id;
  return jsonb_build_object('reset',true,'purpose',v.purpose,'marker',v.marker);
end; $$;

revoke all on function public.qa_owner_preview_reset_fixture(text,text,text,text) from public,anon,authenticated;
grant execute on function public.qa_owner_preview_reset_fixture(text,text,text,text) to service_role;
alter function public.qa_owner_preview_reset_fixture(text,text,text,text) owner to postgres;
commit;
