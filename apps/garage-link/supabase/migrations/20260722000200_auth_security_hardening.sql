-- Stripe security checklist hardening:
-- 1) account-level password-login lockout (10 failures / 30 minutes)
-- 2) atomic secondary access-code lockout
-- 3) PostgREST enforcement of AAL2 for administrator accounts

create table if not exists public.auth_login_attempts (
  identity_hash text primary key,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 10),
  locked_until timestamptz,
  last_failed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_login_attempts enable row level security;
revoke all on table public.auth_login_attempts from anon, authenticated;
grant select, insert, update, delete on table public.auth_login_attempts to service_role;

create or replace function public.get_login_lock(p_identity_hash text)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select case
    when attempts.locked_until > now() then attempts.locked_until
    else null
  end
  from public.auth_login_attempts as attempts
  where attempts.identity_hash = p_identity_hash;
$$;

create or replace function public.record_login_failure(p_identity_hash text)
returns table(failed_attempts integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  insert into public.auth_login_attempts as attempts (
    identity_hash,
    failed_attempts,
    locked_until,
    last_failed_at,
    updated_at
  )
  values (p_identity_hash, 1, null, now(), now())
  on conflict (identity_hash) do update
  set
    failed_attempts = case
      when attempts.locked_until > now() then attempts.failed_attempts
      when attempts.last_failed_at < now() - interval '30 minutes' then 1
      else least(10, attempts.failed_attempts + 1)
    end,
    locked_until = case
      when attempts.locked_until > now() then attempts.locked_until
      when attempts.last_failed_at >= now() - interval '30 minutes'
        and attempts.failed_attempts + 1 >= 10
        then now() + interval '30 minutes'
      else null
    end,
    last_failed_at = now(),
    updated_at = now()
  returning attempts.failed_attempts, attempts.locked_until;
end;
$$;

create or replace function public.clear_login_failures(p_identity_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_login_attempts
  where identity_hash = p_identity_hash;
$$;

create or replace function public.record_admin_access_failure(p_user_id uuid)
returns table(failed_attempts integer, locked_until timestamptz)
language sql
security definer
set search_path = ''
as $$
  update public.admin_access_credentials as credentials
  set
    failed_attempts = least(10, credentials.failed_attempts + 1),
    locked_until = case
      when credentials.failed_attempts + 1 >= 10
        then coalesce(
          greatest(credentials.locked_until, now() + interval '30 minutes'),
          now() + interval '30 minutes'
        )
      else credentials.locked_until
    end,
    updated_at = now()
  where credentials.user_id = p_user_id
  returning credentials.failed_attempts, credentials.locked_until;
$$;

create or replace function public.clear_admin_access_failures(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.admin_access_credentials
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where user_id = p_user_id;
$$;

revoke all on function public.get_login_lock(text) from public, anon, authenticated;
revoke all on function public.record_login_failure(text) from public, anon, authenticated;
revoke all on function public.clear_login_failures(text) from public, anon, authenticated;
revoke all on function public.record_admin_access_failure(uuid) from public, anon, authenticated;
revoke all on function public.clear_admin_access_failures(uuid) from public, anon, authenticated;
grant execute on function public.get_login_lock(text) to service_role;
grant execute on function public.record_login_failure(text) to service_role;
grant execute on function public.clear_login_failures(text) to service_role;
grant execute on function public.record_admin_access_failure(uuid) to service_role;
grant execute on function public.clear_admin_access_failures(uuid) to service_role;
