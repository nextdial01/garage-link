-- migration: 20260712000200_accounting_export_settings
-- Purpose: per-store editable account names for the journal-entry CSV export
-- (freee / 弥生 / マネーフォワード). Account names must match what the shop's
-- own chart of accounts uses in the target software exactly, so this is
-- configurable rather than hardcoded.

create table if not exists public.accounting_export_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  sales_account_name text not null default '売上高',
  receivable_account_name text not null default '売掛金',
  suspense_account_name text not null default '預り金',
  output_tax_account_name text not null default '仮受消費税等',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.accounting_export_settings is '会計ソフト連携（freee/弥生/マネーフォワードCSVエクスポート）の勘定科目名設定';
comment on column public.accounting_export_settings.suspense_account_name is '自賠責保険・重量税・印紙代・リサイクル預託金など、店の売上ではなく預り金として処理する項目の貸方科目';

alter table public.accounting_export_settings enable row level security;

drop policy if exists "accounting_export_settings_select_member_stores" on public.accounting_export_settings;
create policy "accounting_export_settings_select_member_stores"
on public.accounting_export_settings
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "accounting_export_settings_insert_member_stores" on public.accounting_export_settings;
create policy "accounting_export_settings_insert_member_stores"
on public.accounting_export_settings
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "accounting_export_settings_update_member_stores" on public.accounting_export_settings;
create policy "accounting_export_settings_update_member_stores"
on public.accounting_export_settings
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.accounting_export_settings to authenticated;
