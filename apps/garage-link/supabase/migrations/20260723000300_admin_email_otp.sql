-- Replace administrator TOTP enforcement with an email OTP trusted-session gate.
-- OTPs are stored only as keyed hashes and trusted sessions expire after 30 days.

create table if not exists public.admin_email_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  email_hash text not null,
  code_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_email_otp_challenges_user_created_idx
  on public.admin_email_otp_challenges (user_id, created_at desc);

create table if not exists public.admin_trusted_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  device_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists admin_trusted_sessions_user_idx
  on public.admin_trusted_sessions (user_id, expires_at desc);

alter table public.admin_email_otp_challenges enable row level security;
alter table public.admin_trusted_sessions enable row level security;
revoke all on public.admin_email_otp_challenges, public.admin_trusted_sessions from anon, authenticated;
grant select, insert, update, delete on public.admin_email_otp_challenges, public.admin_trusted_sessions to service_role;

create or replace function public.create_admin_email_otp_challenge(
  p_user_id uuid,
  p_session_id uuid,
  p_email_hash text,
  p_code_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_latest timestamptz;
  v_count integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select max(created_at), count(*) filter (where created_at > now() - interval '1 hour')
    into v_latest, v_count
    from public.admin_email_otp_challenges
   where user_id = p_user_id;
  if v_latest is not null and v_latest > now() - interval '1 minute' then
    raise exception 'otp_resend_too_soon';
  end if;
  if coalesce(v_count, 0) >= 5 then
    raise exception 'otp_rate_limited';
  end if;
  update public.admin_email_otp_challenges
     set consumed_at = now()
   where user_id = p_user_id and consumed_at is null;
  insert into public.admin_email_otp_challenges (user_id, session_id, email_hash, code_hash, expires_at)
  values (p_user_id, p_session_id, p_email_hash, p_code_hash, now() + interval '10 minutes')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.verify_admin_email_otp_challenge(
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
   where user_id = p_user_id and session_id = p_session_id and consumed_at is null
   order by created_at desc
   limit 1
   for update;
  if challenge.id is null or challenge.expires_at <= now() then return 'expired'; end if;
  if challenge.failed_attempts >= 5 then return 'locked'; end if;
  if challenge.code_hash <> p_code_hash then
    update public.admin_email_otp_challenges set failed_attempts = least(5, failed_attempts + 1) where id = challenge.id;
    if challenge.failed_attempts + 1 >= 5 then return 'locked'; end if;
    return 'invalid';
  end if;
  update public.admin_email_otp_challenges set consumed_at = now() where id = challenge.id;
  insert into public.admin_trusted_sessions (user_id, session_id, device_token_hash, expires_at, revoked_at, last_used_at)
  values (p_user_id, p_session_id, p_device_token_hash, now() + interval '30 days', null, now())
  on conflict (session_id) do update set
    user_id = excluded.user_id,
    device_token_hash = excluded.device_token_hash,
    expires_at = excluded.expires_at,
    revoked_at = null,
    last_used_at = now();
  return 'ok';
end;
$$;

revoke all on function public.create_admin_email_otp_challenge(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.verify_admin_email_otp_challenge(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_admin_email_otp_challenge(uuid, uuid, text, text) to service_role;
grant execute on function public.verify_admin_email_otp_challenge(uuid, uuid, text, text) to service_role;

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
  is_administrator boolean := false;
begin
  if jwt_role in ('service_role', 'supabase_admin') or v_user_id is null then return; end if;
  begin
    v_session_id := nullif(jwt ->> 'session_id', '')::uuid;
  exception when others then
    v_session_id := null;
  end;
  select
    exists (select 1 from public.memberships where user_id = v_user_id and status = 'active' and role in ('owner', 'admin', 'implementer'))
    or exists (select 1 from public.store_members where user_id = v_user_id and status in ('active', 'member') and role in ('owner', 'admin', 'implementer'))
    into is_administrator;
  -- Keep existing AAL2 sessions valid during the rollout so the migration cannot
  -- lock administrators out between the database and application deployments.
  -- The new application always uses the email OTP gate for fresh sessions.
  if is_administrator and coalesce(jwt ->> 'aal', 'aal1') <> 'aal2' and not exists (
    select 1 from public.admin_trusted_sessions
     where user_id = v_user_id and session_id = v_session_id and revoked_at is null and expires_at > now()
  ) then
    raise insufficient_privilege using message = 'Email OTP verification is required for administrator access';
  end if;
end;
$$;

revoke all on function public.enforce_administrator_email_otp() from public;
grant execute on function public.enforce_administrator_email_otp() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_administrator_email_otp';
notify pgrst, 'reload config';
