begin;

create table public.mobile_review_fixture_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  proof_hash text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, tenant_id, store_id)
);

alter table public.mobile_review_fixture_access enable row level security;
revoke all on public.mobile_review_fixture_access from public, anon, authenticated;
grant select, insert, update, delete on public.mobile_review_fixture_access to service_role;

do $$
begin
  if not exists (
    select 1
      from public.memberships m
      join public.tenants t on t.id = m.tenant_id and t.status = 'active'
      join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
     where m.user_id = 'd03cbf82-b2fa-499f-a249-66796fe767bf'
       and m.tenant_id = '69a8023c-2510-4655-85b1-4facb319fc05'
       and m.store_id = 'f3366caf-dda2-49b0-bdf7-cc9d5a86e395'
       and m.role = 'owner'
       and m.status = 'active'
       and m.disabled_at is null
       and m.deleted_at is null
       and coalesce(m.invite_accepted_at, m.joined_at) is not null
  ) then
    raise exception 'GARAGE_MOBILE_REVIEW_FIXTURE_SCOPE_INVALID';
  end if;
end;
$$;

insert into public.mobile_review_fixture_access (user_id, tenant_id, store_id)
values (
  'd03cbf82-b2fa-499f-a249-66796fe767bf',
  '69a8023c-2510-4655-85b1-4facb319fc05',
  'f3366caf-dda2-49b0-bdf7-cc9d5a86e395'
)
on conflict (user_id) do nothing;

create or replace function public.enforce_administrator_email_otp()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt jsonb := auth.jwt();
  jwt_role text := coalesce(jwt ->> 'role', '');
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_mobile_token text;
  v_mobile_hash text;
  v_review_proof text;
  v_review_proof_hash text;
  is_administrator boolean := false;
  is_mobile_review_fixture boolean := false;
begin
  if jwt_role in ('service_role', 'supabase_admin') or v_user_id is null then return; end if;
  begin
    v_session_id := nullif(jwt ->> 'session_id', '')::uuid;
  exception when others then
    v_session_id := null;
  end;
  v_mobile_token := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-garage-trusted-device-token', '');
  if v_mobile_token ~ '^[0-9a-fA-F]{64}$' then
    v_mobile_hash := encode(extensions.digest(v_mobile_token, 'sha256'), 'hex');
  end if;
  v_review_proof := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-garage-mobile-review-proof', '');
  if v_review_proof ~ '^[0-9a-fA-F]{64}$' then
    v_review_proof_hash := encode(extensions.digest(v_review_proof, 'sha256'), 'hex');
  end if;
  select exists (
    select 1
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id and t.status = 'active'
    join public.stores s on s.id = m.store_id and s.tenant_id = m.tenant_id and public.store_is_authorization_eligible(s.status)
    where m.user_id = v_user_id
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'implementer')
      and m.disabled_at is null
      and m.deleted_at is null
      and coalesce(m.invite_accepted_at, m.joined_at) is not null
  ) into is_administrator;
  select exists (
    select 1
      from public.mobile_review_fixture_access r
      join public.memberships m on m.user_id = r.user_id and m.tenant_id = r.tenant_id and m.store_id = r.store_id
      join public.tenants t on t.id = r.tenant_id and t.status = 'active'
      join public.stores s on s.id = r.store_id and s.tenant_id = r.tenant_id and public.store_is_authorization_eligible(s.status)
     where r.user_id = v_user_id
       and r.proof_hash = v_review_proof_hash
       and r.revoked_at is null
       and m.role = 'owner'
       and m.status = 'active'
       and m.disabled_at is null
       and m.deleted_at is null
       and coalesce(m.invite_accepted_at, m.joined_at) is not null
  ) into is_mobile_review_fixture;
  if is_administrator and not is_mobile_review_fixture
     and coalesce(jwt ->> 'aal', 'aal1') <> 'aal2'
     and not exists (
       select 1 from public.admin_trusted_sessions
        where user_id = v_user_id and session_id = v_session_id and revoked_at is null and expires_at > now()
     )
     and not exists (
       select 1 from public.mobile_trusted_devices
        where user_id = v_user_id and device_token_hash = v_mobile_hash and revoked_at is null
     ) then
    raise insufficient_privilege using message = 'Email OTP verification is required for administrator access';
  end if;
end;
$$;

revoke all on function public.enforce_administrator_email_otp() from public;
grant execute on function public.enforce_administrator_email_otp() to anon, authenticated, service_role;
alter function public.enforce_administrator_email_otp() owner to postgres;

notify pgrst, 'reload config';
commit;
