-- Staging-only UX acceptance fixture bootstrap.
-- This does not create a trusted session and remains service-role only.

begin;

create or replace function public.ux_acceptance_admin_bootstrap_context(
  p_user_id uuid,
  p_session_id uuid,
  p_environment text
)
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
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_user_id is null or p_session_id is null or p_environment <> 'preview' then
    return null;
  end if;

  select
    count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', lower(u.email),
        'tenant_id', m.tenant_id,
        'store_id', s.id,
        'role', m.role
      )
      order by m.tenant_id, s.id
    )
  into v_count, v_contexts
  from public.memberships m
  join auth.users u on u.id = m.user_id
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores s
    on s.id = m.store_id
   and s.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(s.status)
  where m.user_id = p_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and lower(coalesce(u.email, '')) like 'ux.qa.20260803.%'
    and lower(coalesce(u.email, '')) ~ '@[^@]+\.invalid$'
    -- raw_user_meta_data is user-editable and must never authorize this path.
    and coalesce(u.raw_app_meta_data ->> 'purpose', '') = 'ux-acceptance-20260803'
    and t.name like '[UX QA 20260803]%'
    and s.name = '[UX QA 20260803] 受入監査店';

  if v_count <> 1 then return null; end if;
  return v_contexts -> 0;
end;
$$;

revoke all on function public.ux_acceptance_admin_bootstrap_context(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ux_acceptance_admin_bootstrap_context(uuid, uuid, text)
  to service_role;
alter function public.ux_acceptance_admin_bootstrap_context(uuid, uuid, text) owner to postgres;

commit;
