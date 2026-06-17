-- GARAGE LINK LINE message logs
-- LINE Messaging APIで送信したメッセージの結果を保存するSQLです。
-- 送信成功・失敗を後から追えるようにします。

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

create table if not exists public.line_message_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  draft_id uuid references public.line_message_drafts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  line_user_id text,
  line_display_name text,
  message_type text,
  title text,
  body text not null,
  send_status text default 'pending',
  line_response jsonb,
  error_message text,
  sent_at timestamptz,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.line_message_logs is 'LINEメッセージの送信結果ログ';
comment on column public.line_message_logs.send_status is 'pending / sent / failed / cancelled';
comment on column public.line_message_logs.line_response is 'LINE Messaging APIからのレスポンス情報。アクセストークンは保存しません。';

create index if not exists idx_line_message_logs_store_id on public.line_message_logs(store_id);
create index if not exists idx_line_message_logs_draft_id on public.line_message_logs(draft_id);
create index if not exists idx_line_message_logs_deal_id on public.line_message_logs(deal_id);
create index if not exists idx_line_message_logs_customer_id on public.line_message_logs(customer_id);
create index if not exists idx_line_message_logs_line_user_id on public.line_message_logs(line_user_id);
create index if not exists idx_line_message_logs_send_status on public.line_message_logs(send_status);
create index if not exists idx_line_message_logs_sent_at on public.line_message_logs(sent_at);
create index if not exists idx_line_message_logs_created_at on public.line_message_logs(created_at);

drop trigger if exists set_line_message_logs_updated_at on public.line_message_logs;
create trigger set_line_message_logs_updated_at
before update on public.line_message_logs
for each row
execute function public.set_updated_at();

alter table public.line_message_logs enable row level security;

drop policy if exists "line_message_logs_select_member_stores" on public.line_message_logs;
create policy "line_message_logs_select_member_stores"
on public.line_message_logs
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_message_logs_insert_member_stores" on public.line_message_logs;
create policy "line_message_logs_insert_member_stores"
on public.line_message_logs
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_message_logs_update_member_stores" on public.line_message_logs;
create policy "line_message_logs_update_member_stores"
on public.line_message_logs
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_message_logs_delete_member_stores" on public.line_message_logs;
create policy "line_message_logs_delete_member_stores"
on public.line_message_logs
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.line_message_logs to authenticated;

-- 確認用:
-- select * from public.line_message_logs order by created_at desc;
