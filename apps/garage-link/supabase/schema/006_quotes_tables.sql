-- GARAGE LINK quotes tables
-- Supabase SQL Editorで実行する見積書機能用SQLです。
-- 商談・顧客・車両に紐づく見積書ヘッダーと明細行を保存します。
-- 注意: 既存データを消す drop table は入れていません。

-- UUIDを自動生成するために使います。既に有効でもエラーにはなりません。
create extension if not exists "pgcrypto";

-- ==================================================
-- 1. updated_at更新用関数
-- ==================================================
-- 更新時に updated_at を自動で現在時刻へ変更します。
-- 初期SQLを実行していない環境でも動くように、このファイル内にも含めています。
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
-- 2. quotes
-- ==================================================
-- 見積書のヘッダー情報、顧客、車両、商談、金額合計、ステータスを保存します。
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,

  quote_no text not null,
  title text,
  status text default 'draft',

  issue_date date,
  expiry_date date,
  assigned_user_name text,

  -- 見積書に印字する顧客情報です。
  -- 顧客マスタが後から変わっても、発行時点の表示内容を残せます。
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  customer_honorific text,

  -- 見積書に印字する車両情報です。
  -- 車両マスタが後から変わっても、発行時点の表示内容を残せます。
  vehicle_label text,
  vehicle_maker text,
  vehicle_model_name text,
  vehicle_year integer,
  vehicle_mileage_km integer,
  vehicle_vin text,
  vehicle_inspection_expiry_date date,

  -- 金額サマリーです。まずは整数の円単位で管理します。
  subtotal_amount integer default 0,
  tax_amount integer default 0,
  discount_amount integer default 0,
  trade_in_amount integer default 0,
  total_amount integer default 0,

  -- 支払条件です。
  payment_method text,
  loan_request text,
  down_payment integer default 0,
  installment_count integer,
  payment_due_date date,

  -- 顧客向け備考と社内メモです。
  customer_note text,
  internal_memo text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint quotes_store_id_quote_no_key unique (store_id, quote_no)
);

comment on table public.quotes is 'GARAGE LINKの見積書ヘッダー情報';
comment on column public.quotes.store_id is '所属店舗ID。RLSで店舗ごとにデータを分離します。';
comment on column public.quotes.quote_no is '店舗内で一意な見積番号';
comment on column public.quotes.status is '見積書ステータス。例: draft, sent, approved, lost, expired';

-- create table if not exists で既存テーブルだった場合に備えて、unique制約を補完します。
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_store_id_quote_no_key'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_store_id_quote_no_key unique (store_id, quote_no);
  end if;
end;
$$;

-- ==================================================
-- 3. quote_items
-- ==================================================
-- 見積書の明細行を保存します。
-- 車両本体価格、登録代行費用、整備費用、税金、値引きなどを明細化します。
create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,

  item_order integer default 0,
  item_type text,
  name text not null,
  description text,
  quantity numeric default 1,
  unit_price integer default 0,
  tax_rate numeric default 0.1,
  tax_amount integer default 0,
  amount integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.quote_items is 'GARAGE LINKの見積書明細行';
comment on column public.quote_items.store_id is '所属店舗ID。quotesと同じ店舗IDを保存します。';
comment on column public.quote_items.quote_id is '紐づく見積書ID';
comment on column public.quote_items.item_type is '明細種別。例: vehicle, fee, tax, discount, trade_in';

-- ==================================================
-- 4. Index
-- ==================================================
-- 検索や絞り込みでよく使う列にインデックスを作ります。
create index if not exists idx_quotes_store_id on public.quotes(store_id);
create index if not exists idx_quotes_deal_id on public.quotes(deal_id);
create index if not exists idx_quotes_customer_id on public.quotes(customer_id);
create index if not exists idx_quotes_vehicle_id on public.quotes(vehicle_id);
create index if not exists idx_quotes_status on public.quotes(status);
create index if not exists idx_quotes_issue_date on public.quotes(issue_date);
create index if not exists idx_quote_items_store_id on public.quote_items(store_id);
create index if not exists idx_quote_items_quote_id on public.quote_items(quote_id);

-- ==================================================
-- 5. updated_at trigger
-- ==================================================
-- 更新日時を自動更新するtriggerです。
drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
before update on public.quotes
for each row
execute function public.set_updated_at();

drop trigger if exists set_quote_items_updated_at on public.quote_items;
create trigger set_quote_items_updated_at
before update on public.quote_items
for each row
execute function public.set_updated_at();

-- ==================================================
-- 6. Row Level Security
-- ==================================================
-- ログインユーザーが所属する店舗のデータだけ操作できるようにします。
-- public.current_user_store_ids() は初期SQLで作成済みの関数を想定しています。
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

-- quotes policies
drop policy if exists "quotes_select_member_stores" on public.quotes;
create policy "quotes_select_member_stores"
on public.quotes
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "quotes_insert_member_stores" on public.quotes;
create policy "quotes_insert_member_stores"
on public.quotes
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "quotes_update_member_stores" on public.quotes;
create policy "quotes_update_member_stores"
on public.quotes
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "quotes_delete_member_stores" on public.quotes;
create policy "quotes_delete_member_stores"
on public.quotes
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

-- quote_items policies
drop policy if exists "quote_items_select_member_stores" on public.quote_items;
create policy "quote_items_select_member_stores"
on public.quote_items
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "quote_items_insert_member_stores" on public.quote_items;
create policy "quote_items_insert_member_stores"
on public.quote_items
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "quote_items_update_member_stores" on public.quote_items;
create policy "quote_items_update_member_stores"
on public.quote_items
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "quote_items_delete_member_stores" on public.quote_items;
create policy "quote_items_delete_member_stores"
on public.quote_items
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

-- ==================================================
-- 7. Grant
-- ==================================================
-- authenticated ロールに、アプリから必要な基本操作を許可します。
grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;

-- 確認用:
-- select * from public.quotes;
-- select * from public.quote_items;
