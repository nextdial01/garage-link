-- Receipt-based L-LINK completion only; no raw service table grant.
begin;
create function public.mark_verified_llink_inquiry_connected(
 p_tenant_id uuid,p_store_id uuid,p_key_id text,p_inquiry_id uuid,p_response_id text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
 if p_tenant_id is null or p_store_id is null or p_key_id is null
    or p_inquiry_id is null or p_response_id is null
    or public.assert_service_tenant_store_context(p_tenant_id,p_store_id) is not true
    or not exists (select 1 from public.stores s where s.id=p_store_id
      and s.tenant_id=p_tenant_id and s.status='active')
    or not exists (select 1 from public.line_link_connections lc where lc.key_id=p_key_id
      and lc.tenant_id=p_tenant_id and lc.store_id=p_store_id and lc.status='active')
    or not (select count(*)=1 and coalesce(bool_and(cs.l_link_integration_enabled),false)
      from public.company_subscriptions cs where cs.tenant_id=p_tenant_id and cs.status='active')
    or not exists (select 1 from public.line_form_responses r where r.id=p_inquiry_id
      and r.store_id=p_store_id and r.external_source='l-link' and lower(r.external_response_id)=lower(p_response_id)) then
  raise exception 'inquiry_marker_scope_unavailable' using errcode='42501';
 end if;
 update public.stores s set l_link_onboarding_completed_at=now()
 where s.id=p_store_id and s.tenant_id=p_tenant_id and s.status='active'
   and s.l_link_onboarding_completed_at is null;
 return exists (select 1 from public.stores s where s.id=p_store_id
   and s.tenant_id=p_tenant_id and s.status='active' and s.l_link_onboarding_completed_at is not null);
end;
$$;
alter function public.mark_verified_llink_inquiry_connected(uuid,uuid,text,uuid,text) owner to postgres;
revoke all on function public.mark_verified_llink_inquiry_connected(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.mark_verified_llink_inquiry_connected(uuid,uuid,text,uuid,text) to service_role;
commit;
