-- GARAGE LINK LINE webhook events
-- LINE Developersから届いたWebhookイベントを保存するためのSQLです。
-- 店舗特定や自動返信は後工程で実装するため、まずは受信イベントの記録を目的にします。

create extension if not exists "pgcrypto";

create table if not exists public.line_webhook_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  line_user_id text,
  event_type text,
  reply_token text,
  message_type text,
  message_text text,
  raw_event jsonb not null,
  signature_valid boolean default false,
  processed boolean default false,
  processing_error text,
  received_at timestamptz default now(),
  created_at timestamptz default now()
);

comment on table public.line_webhook_events is 'LINE Webhookで受信したイベント履歴';
comment on column public.line_webhook_events.store_id is '紐づく店舗ID。現時点ではWebhookだけでは特定できないためnullになる場合があります。';
comment on column public.line_webhook_events.raw_event is 'LINEから受信したイベント本体をそのまま保存します。';
comment on column public.line_webhook_events.signature_valid is 'x-line-signatureの検証結果です。開発中でsecret未設定の場合はfalseになります。';

create index if not exists idx_line_webhook_events_store_id on public.line_webhook_events(store_id);
create index if not exists idx_line_webhook_events_line_user_id on public.line_webhook_events(line_user_id);
create index if not exists idx_line_webhook_events_event_type on public.line_webhook_events(event_type);
create index if not exists idx_line_webhook_events_received_at on public.line_webhook_events(received_at);
create index if not exists idx_line_webhook_events_processed on public.line_webhook_events(processed);

alter table public.line_webhook_events enable row level security;

-- 所属店舗のイベントだけ閲覧できます。store_idがnullのイベントは、店舗特定実装後に見えるようになります。
drop policy if exists "line_webhook_events_select_member_stores" on public.line_webhook_events;
create policy "line_webhook_events_select_member_stores"
on public.line_webhook_events
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_webhook_events_update_member_stores" on public.line_webhook_events;
create policy "line_webhook_events_update_member_stores"
on public.line_webhook_events
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "line_webhook_events_delete_member_stores" on public.line_webhook_events;
create policy "line_webhook_events_delete_member_stores"
on public.line_webhook_events
for delete
to authenticated
using (store_id in (select public.current_user_store_ids()));

grant select, update, delete on public.line_webhook_events to authenticated;

-- insertはサーバー側APIからservice roleで実行する想定です。
-- TODO: 後工程でLINE userIdから店舗・顧客を特定し、store_idを自動設定します。

-- 確認用:
-- select * from public.line_webhook_events order by received_at desc;
