-- GARAGE LINK store members permissions
-- 店舗ごとのメンバー・権限管理に必要な項目を store_members に追加します。
-- 既存データは削除しません。Supabase SQL Editorで実行してください。

-- updated_atを自動更新するための共通関数です。
-- 既に存在する場合も同じ内容で上書きします。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 招待予定者はまだSupabase Authのuser_idが分からないため、NULLを許可します。
alter table public.store_members
  alter column user_id drop not null;

-- メンバー管理画面で使うカラムを追加します。
alter table public.store_members add column if not exists email text;
alter table public.store_members add column if not exists status text default 'active';
alter table public.store_members add column if not exists invited_at timestamptz;
alter table public.store_members add column if not exists joined_at timestamptz;
alter table public.store_members add column if not exists last_login_at timestamptz;
alter table public.store_members add column if not exists memo text;
alter table public.store_members add column if not exists updated_at timestamptz default now();

comment on column public.store_members.email is '招待予定者またはメンバーのメールアドレス';
comment on column public.store_members.role is 'owner / admin / implementer / staff / viewer';
comment on column public.store_members.status is 'active / invited / suspended';
comment on column public.store_members.memo is 'メンバー管理用の社内メモ';

-- 一覧・検索で使いやすいようにindexを補完します。
create index if not exists idx_store_members_email on public.store_members(email);
create index if not exists idx_store_members_role on public.store_members(role);
create index if not exists idx_store_members_status on public.store_members(status);

-- updated_atを更新時に自動で変更します。
drop trigger if exists set_store_members_updated_at on public.store_members;
create trigger set_store_members_updated_at
before update on public.store_members
for each row
execute function public.set_updated_at();

-- RLS policyは既存のものを維持します。
-- 必要に応じて、将来 owner/admin のみが更新できるpolicyへ強化します。

-- 確認用:
-- select id, store_id, user_id, email, role, status, display_name from public.store_members;
