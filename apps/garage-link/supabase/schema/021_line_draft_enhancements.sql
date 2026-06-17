-- GARAGE LINK LINE draft enhancements
-- LINE案内文の下書きと関連帳票を扱いやすくするための追加SQLです。
-- Supabase SQL Editorで必要な場合のみ実行してください。既存データは削除しません。

-- 既存の line_message_drafts は quote_id / invoice_id を持っています。
-- 外部委託や画面仕様で related_quote_id / related_invoice_id 名を使いたい場合に備えて追加します。
alter table if exists public.line_message_drafts
  add column if not exists related_quote_id uuid references public.quotes(id) on delete set null,
  add column if not exists related_invoice_id uuid references public.invoices(id) on delete set null;

create index if not exists idx_line_message_drafts_related_quote_id
  on public.line_message_drafts(related_quote_id);

create index if not exists idx_line_message_drafts_related_invoice_id
  on public.line_message_drafts(related_invoice_id);

-- 確認用:
-- select id, quote_id, invoice_id, related_quote_id, related_invoice_id from public.line_message_drafts;
