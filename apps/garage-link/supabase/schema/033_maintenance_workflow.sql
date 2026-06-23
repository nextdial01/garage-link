-- GARAGE LINK 033: 整備案件ワークフロー追加
-- 完了日時・完了担当者カラムと、見積・請求への整備案件リンクを追加します。
-- 既存データを壊さず、Supabase SQL Editorで再実行できる形にしています。

-- ==================================================
-- 1. maintenance_jobs に完了情報カラムを追加
-- ==================================================
alter table public.maintenance_jobs
  add column if not exists completed_at           timestamptz,
  add column if not exists completed_by_user_name text,
  add column if not exists cancelled_at           timestamptz,
  add column if not exists cancelled_by_user_name text;

comment on column public.maintenance_jobs.completed_at           is '作業完了確定日時。「作業完了」ボタン操作で記録される';
comment on column public.maintenance_jobs.completed_by_user_name is '作業完了確定を行った担当者名';
comment on column public.maintenance_jobs.cancelled_at           is '案件キャンセル日時';
comment on column public.maintenance_jobs.cancelled_by_user_name is '案件をキャンセルした担当者名';

-- ==================================================
-- 2. quotes / invoices に整備案件リンク列を追加
-- ==================================================
alter table public.quotes
  add column if not exists maintenance_job_id uuid references public.maintenance_jobs(id) on delete set null;

alter table public.invoices
  add column if not exists maintenance_job_id uuid references public.maintenance_jobs(id) on delete set null;

comment on column public.quotes.maintenance_job_id   is '紐づく整備案件ID。整備案件から作成された見積で記録される';
comment on column public.invoices.maintenance_job_id is '紐づく整備案件ID。整備案件から作成された請求書で記録される';

create index if not exists idx_quotes_maintenance_job_id   on public.quotes(maintenance_job_id);
create index if not exists idx_invoices_maintenance_job_id on public.invoices(maintenance_job_id);

-- 確認用:
-- select column_name from information_schema.columns
--   where table_name = 'maintenance_jobs' and column_name like 'completed%';
-- select column_name from information_schema.columns
--   where table_name in ('quotes','invoices') and column_name = 'maintenance_job_id';
