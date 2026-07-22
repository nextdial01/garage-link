create table if not exists public.admin_access_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  code_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 10),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_access_credentials is
  'Server-only administrator access-code hashes and lockout state. Never expose through the browser API.';

alter table public.admin_access_credentials enable row level security;
revoke all on table public.admin_access_credentials from anon, authenticated;
grant all on table public.admin_access_credentials to service_role;
