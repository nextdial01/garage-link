-- GARAGE LINK LINE friends
-- LINE友だち情報を店舗ごとに管理するためのSQLです。
-- Webhookからの自動登録やLINEプロフィール取得は後工程で実装します。

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.line_friends (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  line_user_id text not null,
  line_display_name text,
  line_picture_url text,
  line_status_message text,
  friend_status text default 'friend',
  delivery_permission boolean default true,
  blocked_at timestamptz,
  followed_at timestamptz,
  last_interaction_at timestamptz,
  source_route text,
  source_url text,
  source_qr_code text,
  tag_names text[],
  internal_memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint line_friends_store_id_line_user_id_key unique (store_id, line_user_id)
);

comment on table public.line_friends is 'GARAGE LINKのLINE友だち管理テーブル';
comment on column public.line_friends.friend_status is 'friend / blocked / unknown';
comment on column public.line_friends.tag_names is 'LINE友だちに付与するタグ名の配列';

create index if not exists idx_line_friends_store_id on public.line_friends(store_id);
create index if not exists idx_line_friends_customer_id on public.line_friends(customer_id);
create index if not exists idx_line_friends_line_user_id on public.line_friends(line_user_id);
create index if not exists idx_line_friends_friend_status on public.line_friends(friend_status);
create index if not exists idx_line_friends_delivery_permission on public.line_friends(delivery_permission);
create index if not exists idx_line_friends_last_interaction_at on public.line_friends(last_interaction_at);
create index if not exists idx_line_friends_tag_names on public.line_friends using gin(tag_names);

drop trigger if exists set_line_friends_updated_at on public.line_friends;
create trigger set_line_friends_updated_at
before update on public.line_friends
for each row
execute function public.set_updated_at();

alter table public.line_friends enable row level security;

drop policy if exists "line_friends_select_member_stores" on public.line_friends;
create policy "line_friends_select_member_stores"
on public.line_friends
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_friends_insert_member_stores" on public.line_friends;
create policy "line_friends_insert_member_stores"
on public.line_friends
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_friends_update_member_stores" on public.line_friends;
create policy "line_friends_update_member_stores"
on public.line_friends
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_friends_delete_member_stores" on public.line_friends;
create policy "line_friends_delete_member_stores"
on public.line_friends
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.line_friends to authenticated;

-- 確認用:
-- select * from public.line_friends order by created_at desc;
