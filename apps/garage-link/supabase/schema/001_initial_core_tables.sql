-- GARAGE LINK initial core tables
-- Supabase SQL Editorで一括実行するための初期MVPスキーマです。
-- まだ本番データがない初期開発向けに、既存テーブルと関数をリセットしてから作成します。

-- ==================================================
-- 0. 初期開発用リセット
-- ==================================================
-- 注意: 本番データがある環境では実行しないでください。
drop table if exists public.deals cascade;
drop table if exists public.customers cascade;
drop table if exists public.vehicles cascade;
drop table if exists public.store_members cascade;
drop table if exists public.stores cascade;
drop function if exists public.current_user_store_ids() cascade;
drop function if exists public.set_updated_at() cascade;

-- UUIDを自動生成するために使います。
create extension if not exists "pgcrypto";

-- ==================================================
-- 1. updated_at更新用関数
-- ==================================================
-- 更新時に updated_at を自動で現在時刻へ変更します。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==================================================
-- 2. stores
-- ==================================================
-- GARAGE LINKを利用する店舗・販売店の基本情報です。
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text,
  postal_code text,
  address text,
  phone text,
  email text,
  status text not null default 'active',
  plan_code text,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stores is 'GARAGE LINKを利用する店舗・販売店の基本情報';

-- ==================================================
-- 3. store_members
-- ==================================================
-- Supabase Authユーザーがどの店舗に所属しているかを管理します。
create table public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  display_name text,
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);

comment on table public.store_members is '店舗に所属するユーザーと権限';

-- ==================================================
-- 4. current_user_store_ids()
-- ==================================================
-- 現在ログイン中のユーザーが所属する store_id 一覧を返します。
-- store_members テーブル作成後に作る必要があります。
-- RLS policyから安全に使えるよう SECURITY DEFINER にしています。
create or replace function public.current_user_store_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select sm.store_id
  from public.store_members as sm
  where sm.user_id = auth.uid();
$$;

grant execute on function public.current_user_store_ids() to authenticated;

-- ==================================================
-- 5. vehicles
-- ==================================================
-- 店舗ごとの車両台帳・在庫情報です。
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  management_no text,
  vehicle_type text,
  maker text,
  model_name text,
  grade text,
  vin text,
  registration_no text,
  first_registration_month date,
  model_year integer,
  displacement_cc integer,
  mileage_km integer,
  color text,
  inspection_expiry_date date,
  purchase_price numeric(12, 2),
  base_price numeric(12, 2),
  total_price numeric(12, 2),
  status text not null default 'in_stock',
  location_name text,
  description text,
  internal_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vehicles is '店舗ごとの車両台帳・在庫情報';

-- ==================================================
-- 6. customers
-- ==================================================
-- 顧客情報、LINE連携情報、希望条件、対応メモです。
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_type text not null default 'individual',
  name text not null,
  kana text,
  phone text,
  mobile_phone text,
  email text,
  postal_code text,
  address text,
  gender text,
  birth_date date,
  line_user_id text,
  line_display_name text,
  line_friend_status text not null default 'unlinked',
  delivery_permission text not null default 'allowed',
  desired_maker text,
  desired_model text,
  desired_displacement text,
  budget_min numeric(12, 2),
  budget_max numeric(12, 2),
  desired_purchase_timing text,
  trade_in_status text,
  customer_status text not null default 'prospect',
  assigned_user_name text,
  next_action_date date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is '顧客情報、LINE連携情報、希望条件、対応メモ';

-- ==================================================
-- 7. deals
-- ==================================================
-- 顧客・車両に紐づく商談情報です。
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  deal_no text,
  title text not null,
  deal_type text,
  status text not null default 'new',
  probability text,
  source text,
  budget numeric(12, 2),
  trade_in_status text,
  loan_request text,
  next_action_at timestamptz,
  assigned_user_name text,
  line_status text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deals is '顧客・車両に紐づく商談管理';

-- 検索や絞り込みでよく使う列にインデックスを作ります。
create index idx_store_members_user_id on public.store_members(user_id);
create index idx_store_members_store_id on public.store_members(store_id);
create index idx_vehicles_store_id on public.vehicles(store_id);
create index idx_customers_store_id on public.customers(store_id);
create index idx_customers_line_user_id on public.customers(line_user_id);
create index idx_deals_store_id on public.deals(store_id);
create index idx_deals_customer_id on public.deals(customer_id);
create index idx_deals_vehicle_id on public.deals(vehicle_id);

-- ==================================================
-- 8. updated_at trigger
-- ==================================================
-- 更新日時を自動更新するtriggerです。
create trigger set_stores_updated_at
before update on public.stores
for each row
execute function public.set_updated_at();

create trigger set_vehicles_updated_at
before update on public.vehicles
for each row
execute function public.set_updated_at();

create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_updated_at();

create trigger set_deals_updated_at
before update on public.deals
for each row
execute function public.set_updated_at();

-- ==================================================
-- 9. Row Level Security有効化
-- ==================================================
-- RLSを有効化して、所属店舗のデータだけ扱えるようにします。
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.vehicles enable row level security;
alter table public.customers enable row level security;
alter table public.deals enable row level security;

-- ==================================================
-- 10. RLS policies
-- ==================================================
-- stores: 所属している店舗だけ参照・更新・削除できます。
-- insertは初期店舗作成のため、ログイン済みユーザーに許可します。
create policy "stores_select_member_stores"
on public.stores
for select
to authenticated
using (id in (select public.current_user_store_ids()));

create policy "stores_insert_authenticated"
on public.stores
for insert
to authenticated
with check (auth.uid() is not null);

create policy "stores_update_member_stores"
on public.stores
for update
to authenticated
using (id in (select public.current_user_store_ids()))
with check (id in (select public.current_user_store_ids()));

create policy "stores_delete_member_stores"
on public.stores
for delete
to authenticated
using (id in (select public.current_user_store_ids()));

-- store_members: 所属店舗のメンバーだけ参照・管理できます。
-- 初期MVPでは、自分自身のメンバー行作成も許可します。
create policy "store_members_select_member_stores"
on public.store_members
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

create policy "store_members_insert_member_stores_or_self"
on public.store_members
for insert
to authenticated
with check (
  store_id in (select public.current_user_store_ids())
  or user_id = auth.uid()
);

create policy "store_members_update_member_stores"
on public.store_members
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

create policy "store_members_delete_member_stores"
on public.store_members
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

-- vehicles: 所属店舗の車両だけ参照・作成・更新・削除できます。
create policy "vehicles_select_member_stores"
on public.vehicles
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

create policy "vehicles_insert_member_stores"
on public.vehicles
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

create policy "vehicles_update_member_stores"
on public.vehicles
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

create policy "vehicles_delete_member_stores"
on public.vehicles
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

-- customers: 所属店舗の顧客だけ参照・作成・更新・削除できます。
create policy "customers_select_member_stores"
on public.customers
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

create policy "customers_insert_member_stores"
on public.customers
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

create policy "customers_update_member_stores"
on public.customers
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

create policy "customers_delete_member_stores"
on public.customers
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

-- deals: 所属店舗の商談だけ参照・作成・更新・削除できます。
create policy "deals_select_member_stores"
on public.deals
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

create policy "deals_insert_member_stores"
on public.deals
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

create policy "deals_update_member_stores"
on public.deals
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

create policy "deals_delete_member_stores"
on public.deals
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

-- ==================================================
-- 確認用:
-- ==================================================
-- select * from public.stores;
-- select * from public.store_members;
-- select * from public.vehicles;
-- select * from public.customers;
-- select * from public.deals;
