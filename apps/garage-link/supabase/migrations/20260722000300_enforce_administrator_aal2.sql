-- Final phase: reject administrator Data API access unless the JWT is AAL2.
-- Apply only after the matching application release is live.

create or replace function public.enforce_administrator_aal2()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt jsonb := auth.jwt();
  jwt_role text := coalesce(jwt ->> 'role', '');
  v_user_id uuid := auth.uid();
  is_administrator boolean := false;
begin
  if jwt_role in ('service_role', 'supabase_admin') or v_user_id is null then
    return;
  end if;

  select
    exists (
      select 1
      from public.memberships as roles
      where roles.user_id = v_user_id
        and roles.status = 'active'
        and roles.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.store_members as members
      where members.user_id = v_user_id
        and members.status in ('active', 'member')
        and members.role in ('owner', 'admin', 'implementer')
    )
  into is_administrator;

  if is_administrator and coalesce(jwt ->> 'aal', 'aal1') <> 'aal2' then
    raise insufficient_privilege using message = 'MFA verification is required for administrator access';
  end if;
end;
$$;

revoke all on function public.enforce_administrator_aal2() from public;
grant execute on function public.enforce_administrator_aal2() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_administrator_aal2';
notify pgrst, 'reload config';
