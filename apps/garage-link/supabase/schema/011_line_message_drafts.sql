-- GARAGE LINK LINE message drafts
-- 商談から作成したLINE案内文の下書き・送信予約を保存するSQLです。
-- LINE API送信は後工程で実装するため、ここでは本文と予約情報だけを保存します。

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

create table if not exists public.line_message_drafts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  message_type text not null,
  title text,
  body text not null,
  status text default 'draft',
  line_user_id text,
  line_display_name text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.line_message_drafts is '商談から作成したLINE案内文の下書き・送信予約';
comment on column public.line_message_drafts.message_type is 'vehicle_proposal / quote_notice / invoice_notice / visit_reservation / follow_up / inspection_notice / custom';
comment on column public.line_message_drafts.status is 'draft / scheduled / sent / cancelled';

create index if not exists idx_line_message_drafts_store_id on public.line_message_drafts(store_id);
create index if not exists idx_line_message_drafts_deal_id on public.line_message_drafts(deal_id);
create index if not exists idx_line_message_drafts_customer_id on public.line_message_drafts(customer_id);
create index if not exists idx_line_message_drafts_vehicle_id on public.line_message_drafts(vehicle_id);
create index if not exists idx_line_message_drafts_quote_id on public.line_message_drafts(quote_id);
create index if not exists idx_line_message_drafts_invoice_id on public.line_message_drafts(invoice_id);
create index if not exists idx_line_message_drafts_status on public.line_message_drafts(status);
create index if not exists idx_line_message_drafts_scheduled_at on public.line_message_drafts(scheduled_at);
create index if not exists idx_line_message_drafts_created_at on public.line_message_drafts(created_at);

drop trigger if exists set_line_message_drafts_updated_at on public.line_message_drafts;
create trigger set_line_message_drafts_updated_at
before update on public.line_message_drafts
for each row
execute function public.set_updated_at();

alter table public.line_message_drafts enable row level security;

drop policy if exists "line_message_drafts_select_member_stores" on public.line_message_drafts;
create policy "line_message_drafts_select_member_stores"
on public.line_message_drafts
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_message_drafts_insert_member_stores" on public.line_message_drafts;
create policy "line_message_drafts_insert_member_stores"
on public.line_message_drafts
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_message_drafts_update_member_stores" on public.line_message_drafts;
create policy "line_message_drafts_update_member_stores"
on public.line_message_drafts
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_message_drafts_delete_member_stores" on public.line_message_drafts;
create policy "line_message_drafts_delete_member_stores"
on public.line_message_drafts
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.line_message_drafts to authenticated;

-- 確認用:
-- select * from public.line_message_drafts;
