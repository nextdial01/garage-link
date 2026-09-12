-- Native trusted devices are deliberately separate from Web trusted sessions.
-- A random device token lives only in SecureStore; this table keeps its
-- SHA-256 digest and never carries a Supabase session id or expiry timestamp.
begin;

create table public.mobile_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, device_token_hash)
);

create index mobile_trusted_devices_active_user_idx
  on public.mobile_trusted_devices (user_id, created_at desc)
  where revoked_at is null;

alter table public.mobile_trusted_devices enable row level security;
revoke all on table public.mobile_trusted_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.mobile_trusted_devices to service_role;

-- Verify the short-lived, session-bound OTP challenge once, then create only
-- the durable native-device record. This does not alter the Web 30-day cookie
-- or admin_trusted_sessions contract.
create or replace function public.verify_admin_email_otp_mobile_device(
  p_user_id uuid,
  p_session_id uuid,
  p_code_hash text,
  p_device_token_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.admin_email_otp_challenges%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into challenge
    from public.admin_email_otp_challenges
   where user_id = p_user_id
     and session_id = p_session_id
     and consumed_at is null
   order by created_at desc
   limit 1
   for update;
  if challenge.id is null or challenge.expires_at <= now() then return 'expired'; end if;
  if challenge.failed_attempts >= 5 then return 'locked'; end if;
  if challenge.code_hash <> p_code_hash then
    update public.admin_email_otp_challenges
       set failed_attempts = least(5, failed_attempts + 1)
     where id = challenge.id;
    if challenge.failed_attempts + 1 >= 5 then return 'locked'; end if;
    return 'invalid';
  end if;
  update public.admin_email_otp_challenges set consumed_at = now() where id = challenge.id;
  insert into public.mobile_trusted_devices (user_id, device_token_hash, revoked_at, last_used_at)
  values (p_user_id, p_device_token_hash, null, now())
  on conflict (user_id, device_token_hash) do update
    set revoked_at = null,
        last_used_at = now();
  return 'ok';
end;
$$;

revoke all on function public.verify_admin_email_otp_mobile_device(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.verify_admin_email_otp_mobile_device(uuid, uuid, text, text)
  to service_role;
alter function public.verify_admin_email_otp_mobile_device(uuid, uuid, text, text) owner to postgres;

-- The Data API carries headers as lower-cased JSON in request.headers. The
-- mobile token is checked here so every RLS-protected mobile operation keeps
-- the existing caller JWT and cannot silently fall back to a service role.
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
  is_administrator boolean := false;
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
  if is_administrator and coalesce(jwt ->> 'aal', 'aal1') <> 'aal2'
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

-- Security revocation remains complete across both Web and mobile grants.
create or replace function public.revoke_admin_trusted_sessions_for_user(
  p_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_web_count integer;
  v_mobile_count integer;
begin
  if p_user_id is null then return 0; end if;
  update public.admin_trusted_sessions
     set revoked_at = coalesce(revoked_at, now()), last_used_at = now()
   where user_id = p_user_id and revoked_at is null;
  get diagnostics v_web_count = row_count;
  update public.mobile_trusted_devices
     set revoked_at = coalesce(revoked_at, now()), last_used_at = now()
   where user_id = p_user_id and revoked_at is null;
  get diagnostics v_mobile_count = row_count;
  update public.admin_email_otp_challenges
     set consumed_at = coalesce(consumed_at, now())
   where user_id = p_user_id and consumed_at is null;
  perform p_reason;
  return v_web_count + v_mobile_count;
end;
$$;

revoke all on function public.revoke_admin_trusted_sessions_for_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_admin_trusted_sessions_for_user(uuid, text)
  to service_role;
alter function public.revoke_admin_trusted_sessions_for_user(uuid, text) owner to postgres;

notify pgrst, 'reload config';
commit;
