-- GARAGE LINK PII minimization
-- Webhookログ・配信ログ・監査ログで本文やraw payloadを過剰保存しないための補助カラムを追加します。
-- 既存データは削除しません。既存本文カラムは段階移行のため残します。

create extension if not exists "pgcrypto";

alter table public.line_webhook_events
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null,
  add column if not exists line_account_id uuid,
  add column if not exists event_id text,
  add column if not exists source_type text,
  add column if not exists source_user_hash text,
  add column if not exists raw_event_hash text,
  add column if not exists processed_at timestamptz,
  add column if not exists status text default 'received',
  add column if not exists error_code text;

comment on column public.line_webhook_events.raw_event is '互換用カラム。新規保存ではraw_event全体を保存せず、hashと最小メタデータのみ保存する';
comment on column public.line_webhook_events.message_text is '互換用カラム。新規保存ではメッセージ本文全文を保存しない';
comment on column public.line_webhook_events.line_user_id is '互換用カラム。新規保存ではLINE userIdを保存せず、source_user_hashを利用する';
comment on column public.line_webhook_events.source_user_hash is 'LINE userIdをsha256 hash化した値。生のLINE userIdは保存しない';
comment on column public.line_webhook_events.raw_event_hash is '受信event JSONのsha256 hash。raw payload本文は保存しない';

create index if not exists idx_line_webhook_events_tenant_id on public.line_webhook_events(tenant_id);
create index if not exists idx_line_webhook_events_event_id on public.line_webhook_events(event_id);
create index if not exists idx_line_webhook_events_source_user_hash on public.line_webhook_events(source_user_hash);
create index if not exists idx_line_webhook_events_raw_event_hash on public.line_webhook_events(raw_event_hash);
create index if not exists idx_line_webhook_events_status on public.line_webhook_events(status);

alter table public.line_message_logs
  add column if not exists body_hash text,
  add column if not exists body_length integer,
  add column if not exists line_user_hash text,
  add column if not exists body_redacted_at timestamptz;

comment on column public.line_message_logs.body is '互換用カラム。新規送信ログでは本文全文を保存せず空文字を保存する';
comment on column public.line_message_logs.body_hash is '送信本文のsha256 hash。本文全文の代替として利用する';
comment on column public.line_message_logs.body_length is '送信本文の文字数';
comment on column public.line_message_logs.line_user_hash is 'LINE userIdをsha256 hash化した値。新規ログでは生のLINE userIdを保存しない';

create index if not exists idx_line_message_logs_body_hash on public.line_message_logs(body_hash);
create index if not exists idx_line_message_logs_line_user_hash on public.line_message_logs(line_user_hash);

alter table public.line_delivery_logs
  add column if not exists message_hash text,
  add column if not exists message_body_length integer;

comment on column public.line_delivery_logs.message_snapshot is '本文全文は保存しない。message_hash、body_length、message_type等の最小メタデータのみ保存する';

alter table public.line_test_delivery_logs
  add column if not exists message_hash text,
  add column if not exists message_body_length integer;

comment on table public.line_test_delivery_logs is 'LINEテスト配信ログ。本配信ログとは分離して保存する。本文全文やLINE userIdは保存しない';

-- 保持期間の推奨:
-- security_events: 180日〜1年
-- audit_logs: 1年
-- line_webhook_events: 30日〜90日
-- line_message_logs: 90日〜180日
-- line_form_answers: 業務上必要期間。ただしCSV exportは禁止またはowner限定

-- 確認用:
-- select event_id, source_user_hash, raw_event_hash, message_text, line_user_id from public.line_webhook_events order by created_at desc;
