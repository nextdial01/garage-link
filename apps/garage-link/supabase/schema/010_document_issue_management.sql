-- GARAGE LINK document issue management
-- Supabase SQL Editorで実行する、見積書・請求書の発行管理用SQLです。
-- 既存データを消さず、開発中に再実行しやすい形にしています。

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

-- 見積書に発行管理カラムを追加します。
alter table if exists public.quotes add column if not exists issued_at timestamptz;
alter table if exists public.quotes add column if not exists issued_by text;
alter table if exists public.quotes add column if not exists issue_status text default 'draft';
alter table if exists public.quotes add column if not exists pdf_generated_at timestamptz;
alter table if exists public.quotes add column if not exists cancelled_at timestamptz;
alter table if exists public.quotes add column if not exists cancel_reason text;

-- 請求書ヘッダーです。見積書・商談・顧客・車両に紐づけて保存します。
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  invoice_no text not null,
  title text,
  status text default 'draft',
  issue_status text default 'draft',
  issue_date date,
  payment_due_date date,
  assigned_user_name text,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_postal_code text,
  customer_address text,
  customer_honorific text,
  vehicle_label text,
  vehicle_maker text,
  vehicle_model_name text,
  vehicle_year integer,
  vehicle_mileage_km integer,
  vehicle_vin text,
  vehicle_registration_no text,
  subtotal_amount integer default 0,
  tax_amount integer default 0,
  discount_amount integer default 0,
  trade_in_amount integer default 0,
  total_amount integer default 0,
  paid_amount integer default 0,
  unpaid_amount integer default 0,
  payment_method text,
  bank_name text,
  bank_branch_name text,
  bank_account_type text,
  bank_account_number text,
  bank_account_holder text,
  customer_note text,
  internal_memo text,
  issued_at timestamptz,
  issued_by text,
  pdf_generated_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint invoices_store_id_invoice_no_key unique (store_id, invoice_no)
);

-- 請求書明細です。車両本体価格、諸費用、値引きなどを行単位で保存します。
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
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

comment on table public.invoices is 'GARAGE LINKの請求書ヘッダー情報';
comment on table public.invoice_items is 'GARAGE LINKの請求書明細行';
comment on column public.quotes.issue_status is '帳票発行状態。draft / issued / cancelled';
comment on column public.invoices.issue_status is '帳票発行状態。draft / issued / cancelled';

-- 既存のinvoicesテーブルがある場合に備えて、発行管理カラムを改めて追加します。
alter table if exists public.invoices add column if not exists issued_at timestamptz;
alter table if exists public.invoices add column if not exists issued_by text;
alter table if exists public.invoices add column if not exists issue_status text default 'draft';
alter table if exists public.invoices add column if not exists pdf_generated_at timestamptz;
alter table if exists public.invoices add column if not exists cancelled_at timestamptz;
alter table if exists public.invoices add column if not exists cancel_reason text;

-- 検索と一覧表示を軽くするためのindexです。
create index if not exists idx_quotes_issue_status on public.quotes(issue_status);
create index if not exists idx_quotes_issued_at on public.quotes(issued_at);
create index if not exists idx_invoices_store_id on public.invoices(store_id);
create index if not exists idx_invoices_quote_id on public.invoices(quote_id);
create index if not exists idx_invoices_deal_id on public.invoices(deal_id);
create index if not exists idx_invoices_customer_id on public.invoices(customer_id);
create index if not exists idx_invoices_vehicle_id on public.invoices(vehicle_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_issue_status on public.invoices(issue_status);
create index if not exists idx_invoices_issue_date on public.invoices(issue_date);
create index if not exists idx_invoice_items_store_id on public.invoice_items(store_id);
create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);

-- updated_at triggerです。再実行できるよう先にdropします。
drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
before update on public.quotes
for each row
execute function public.set_updated_at();

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();

drop trigger if exists set_invoice_items_updated_at on public.invoice_items;
create trigger set_invoice_items_updated_at
before update on public.invoice_items
for each row
execute function public.set_updated_at();

-- RLSを有効化します。所属店舗のデータだけ操作できるようにします。
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

drop policy if exists "invoices_select_member_stores" on public.invoices;
create policy "invoices_select_member_stores"
on public.invoices
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "invoices_insert_member_stores" on public.invoices;
create policy "invoices_insert_member_stores"
on public.invoices
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "invoices_update_member_stores" on public.invoices;
create policy "invoices_update_member_stores"
on public.invoices
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "invoices_delete_member_stores" on public.invoices;
create policy "invoices_delete_member_stores"
on public.invoices
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "invoice_items_select_member_stores" on public.invoice_items;
create policy "invoice_items_select_member_stores"
on public.invoice_items
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "invoice_items_insert_member_stores" on public.invoice_items;
create policy "invoice_items_insert_member_stores"
on public.invoice_items
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "invoice_items_update_member_stores" on public.invoice_items;
create policy "invoice_items_update_member_stores"
on public.invoice_items
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "invoice_items_delete_member_stores" on public.invoice_items;
create policy "invoice_items_delete_member_stores"
on public.invoice_items
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;

-- 確認用:
-- select id, quote_no, issue_status, issued_at from public.quotes;
-- select id, invoice_no, issue_status, issued_at from public.invoices;
-- select * from public.invoice_items;
