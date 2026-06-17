-- GARAGE LINK trade-in and payment draft tables
-- Supabase SQL Editorで実行する追加テーブル案です。
-- 下取り車両と支払方法内訳を、商談・見積書・請求書に紐づけるための準備SQLです。

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

-- ==================================================
-- 1. trade_in_vehicles
-- ==================================================
-- 商談に紐づく下取り車両の情報と査定額を保存します。
create table if not exists public.trade_in_vehicles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  maker text,
  model_name text,
  grade text,
  model_year integer,
  mileage_km integer,
  vin text,
  registration_no text,
  inspection_expiry_date date,
  color text,
  condition_status text,
  appraisal_amount integer default 0,
  loan_balance integer default 0,
  trade_in_amount integer default 0,
  memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.trade_in_vehicles is '商談に紐づく下取り車両情報';

-- ==================================================
-- 2. payment_items
-- ==================================================
-- 見積書・請求書の支払方法内訳を保存するための案です。
-- invoicesテーブル作成後に invoice_id の外部キーを追加できます。
create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  invoice_id uuid,
  payment_order integer default 0,
  payment_method text,
  amount integer default 0,
  scheduled_date date,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.payment_items is '支払方法の複数内訳';

create index if not exists idx_trade_in_vehicles_store_id on public.trade_in_vehicles(store_id);
create index if not exists idx_trade_in_vehicles_deal_id on public.trade_in_vehicles(deal_id);
create index if not exists idx_payment_items_store_id on public.payment_items(store_id);
create index if not exists idx_payment_items_deal_id on public.payment_items(deal_id);
create index if not exists idx_payment_items_quote_id on public.payment_items(quote_id);

drop trigger if exists set_trade_in_vehicles_updated_at on public.trade_in_vehicles;
create trigger set_trade_in_vehicles_updated_at
before update on public.trade_in_vehicles
for each row
execute function public.set_updated_at();

drop trigger if exists set_payment_items_updated_at on public.payment_items;
create trigger set_payment_items_updated_at
before update on public.payment_items
for each row
execute function public.set_updated_at();

alter table public.trade_in_vehicles enable row level security;
alter table public.payment_items enable row level security;

drop policy if exists "trade_in_vehicles_select_member_stores" on public.trade_in_vehicles;
create policy "trade_in_vehicles_select_member_stores"
on public.trade_in_vehicles
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "trade_in_vehicles_insert_member_stores" on public.trade_in_vehicles;
create policy "trade_in_vehicles_insert_member_stores"
on public.trade_in_vehicles
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "trade_in_vehicles_update_member_stores" on public.trade_in_vehicles;
create policy "trade_in_vehicles_update_member_stores"
on public.trade_in_vehicles
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "trade_in_vehicles_delete_member_stores" on public.trade_in_vehicles;
create policy "trade_in_vehicles_delete_member_stores"
on public.trade_in_vehicles
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "payment_items_select_member_stores" on public.payment_items;
create policy "payment_items_select_member_stores"
on public.payment_items
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "payment_items_insert_member_stores" on public.payment_items;
create policy "payment_items_insert_member_stores"
on public.payment_items
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "payment_items_update_member_stores" on public.payment_items;
create policy "payment_items_update_member_stores"
on public.payment_items
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "payment_items_delete_member_stores" on public.payment_items;
create policy "payment_items_delete_member_stores"
on public.payment_items
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.trade_in_vehicles to authenticated;
grant select, insert, update, delete on public.payment_items to authenticated;

-- 確認用:
-- select * from public.trade_in_vehicles;
-- select * from public.payment_items;
