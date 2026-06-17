-- GARAGE LINK LINE settings
-- 店舗ごとのLINE公式アカウント設定を保存するSQLです。
-- LINE APIの実送信・Webhook受信は後工程で実装します。

create extension if not exists "pgcrypto";

-- updated_atを自動更新する共通関数です。既に存在していても上書きします。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.line_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,

  -- LINE公式アカウント情報です。
  line_account_name text,
  basic_id text,
  channel_id text,
  channel_secret text,
  channel_access_token text,
  webhook_url text,
  connection_status text default 'not_connected',

  -- Webhook設定です。実際の受信処理は後工程で実装します。
  webhook_enabled boolean default false,
  signature_verification_enabled boolean default true,
  last_webhook_tested_at timestamptz,

  -- 配信時に使う基本文言です。
  default_sender_name text,
  unsubscribe_message text,
  friend_add_message text,
  block_handling text default 'update_customer_status',

  -- 配信制御です。夜間配信制限などに使います。
  default_delivery_permission boolean default true,
  quiet_hours_enabled boolean default false,
  quiet_hours_start time,
  quiet_hours_end time,

  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint line_settings_store_id_key unique (store_id)
);

comment on table public.line_settings is '店舗ごとのLINE公式アカウント設定';
comment on column public.line_settings.channel_secret is 'LINE DevelopersのChannel Secret。後工程でサーバー側管理へ移行予定';
comment on column public.line_settings.channel_access_token is 'LINE Messaging APIのChannel Access Token。後工程でサーバー側管理へ移行予定';

create index if not exists idx_line_settings_store_id on public.line_settings(store_id);
create index if not exists idx_line_settings_connection_status on public.line_settings(connection_status);

drop trigger if exists set_line_settings_updated_at on public.line_settings;
create trigger set_line_settings_updated_at
before update on public.line_settings
for each row
execute function public.set_updated_at();

alter table public.line_settings enable row level security;

drop policy if exists "line_settings_select_member_stores" on public.line_settings;
create policy "line_settings_select_member_stores"
on public.line_settings
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_settings_insert_member_stores" on public.line_settings;
create policy "line_settings_insert_member_stores"
on public.line_settings
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_settings_update_member_stores" on public.line_settings;
create policy "line_settings_update_member_stores"
on public.line_settings
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_settings_delete_member_stores" on public.line_settings;
create policy "line_settings_delete_member_stores"
on public.line_settings
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.line_settings to authenticated;

-- TODO: 後工程でLINE Messaging API送信、Webhook受信、署名検証、LINE userId自動紐付けを実装します。

-- 確認用:
-- select * from public.line_settings;
