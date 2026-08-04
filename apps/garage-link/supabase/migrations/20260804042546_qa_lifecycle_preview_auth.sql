-- Extend the existing Preview bootstrap with one registry-bound lifecycle canary.
begin;

create or replace function public.release_qa_admin_bootstrap_context(p_user_id uuid,p_session_id uuid,p_environment text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_contexts jsonb;
  v_count integer;
begin
  if public.garage_request_jwt_role()<>'service_role' and session_user not in ('postgres','supabase_admin') then raise insufficient_privilege using message='service role required'; end if;
  if p_user_id is null or p_session_id is null or p_environment<>'preview' then return null; end if;

  select count(*)::integer,jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',lower(u.email),'tenant_id',m.tenant_id,'store_id',s.id,'role',m.role) order by m.tenant_id,s.id)
    into v_count,v_contexts
    from public.memberships m
    join auth.users u on u.id=m.user_id
    join public.tenants t on t.id=m.tenant_id and t.status='active'
    join public.stores s on s.id=m.store_id and s.tenant_id=m.tenant_id and public.store_is_authorization_eligible(s.status)
    left join public.membership_store_assignments msa on msa.membership_id=m.id and msa.tenant_id=m.tenant_id and msa.store_id=s.id and msa.deleted_at is null
   where m.user_id=p_user_id and m.status='active' and m.role in ('owner','admin','implementer')
     and m.disabled_at is null and m.deleted_at is null and coalesce(m.invite_accepted_at,m.joined_at) is not null
     and (m.role in ('owner','admin') or msa.id is not null)
     and lower(coalesce(u.email,'')) ~ '@[^@]+\.invalid$'
     and coalesce(u.raw_user_meta_data->>'purpose','')='release-preview-fixture'
     and t.name like '[RELEASE QA]%' and s.name like '[RELEASE QA]%';
  if v_count=1 then return v_contexts->0; end if;

  select count(*)::integer,jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',lower(u.email),'tenant_id',m.tenant_id,'store_id',s.id,'role',m.role))
    into v_count,v_contexts
    from qa_internal.fixtures f
    join qa_internal.runs r on r.run_id=f.run_id
    join public.memberships m on m.id=f.membership_id and m.user_id=f.user_id and m.tenant_id=f.tenant_id and m.store_id=f.store_id
    join auth.users u on u.id=m.user_id
    join public.tenants t on t.id=f.tenant_id and t.name=f.expected_tenant_name and t.name like f.marker||'%' and t.status='active'
    join public.stores s on s.id=f.store_id and s.tenant_id=f.tenant_id and s.name=f.marker||' 受入監査店' and public.store_is_authorization_eligible(s.status)
   where f.user_id=p_user_id and f.fixture_type='canary' and f.cleanup_state='REGISTERED' and f.expires_at>clock_timestamp()
     and r.product='garage-link' and r.environment='staging' and r.project_ref='gaytoojzwqkpuvfofeql' and r.state='PROVISIONED' and r.cleanup_deadline>clock_timestamp()
     and m.status='active' and m.role in ('owner','admin') and m.disabled_at is null and m.deleted_at is null and coalesce(m.invite_accepted_at,m.joined_at) is not null
     and lower(coalesce(u.email,'')) like 'qa.lifecycle.%@example.invalid'
     and coalesce(u.raw_app_meta_data->>'purpose','')='qa-lifecycle-canary'
     and coalesce(u.raw_app_meta_data->>'run_id','')=r.run_id::text;
  if v_count<>1 then return null; end if;
  return v_contexts->0;
end;
$$;

revoke all on function public.release_qa_admin_bootstrap_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.release_qa_admin_bootstrap_context(uuid,uuid,text) to service_role;
alter function public.release_qa_admin_bootstrap_context(uuid,uuid,text) owner to postgres;

commit;
