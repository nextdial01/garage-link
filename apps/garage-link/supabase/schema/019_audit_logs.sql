-- GARAGE LINK audit logs
-- 誰が、いつ、どの店舗で、どの操作をしたかを記録する監査ログテーブルです。
-- Supabase SQL Editorで実行してください。既存データは削除しません。

create extension if not exists "pgcrypto";

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid,
  user_email text,
  user_role text,
  user_display_name text,

  -- 操作情報です。actionは create / update / delete / send_line などを保存します。
  action text not null,
  target_type text,
  target_id uuid,
  target_label text,

  -- 詳細情報です。秘密情報やAPIキー、パスワードは保存しないでください。
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  ip_address text,
  user_agent text,

  created_at timestamptz default now()
);

comment on table public.audit_logs is 'GARAGE LINKの監査ログ・操作履歴';
comment on column public.audit_logs.action is 'create / update / delete / restore / login / logout / issue_quote / issue_invoice / cancel_quote / cancel_invoice / send_line / export_settings / import_settings / change_role / upload_file';
comment on column public.audit_logs.target_type is 'vehicle / customer / deal / quote / invoice / maintenance_job / inventory_count / line_friend / line_tag / line_template / line_campaign / line_step / line_form / line_rich_menu / line_auto_reply / line_route / line_message / settings / store_member';
comment on column public.audit_logs.metadata is '操作補足情報。秘密情報や個人情報の過剰な全文コピーは入れません。';

create index if not exists idx_audit_logs_store_id on public.audit_logs(store_id);
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_target_type on public.audit_logs(target_type);
create index if not exists idx_audit_logs_target_id on public.audit_logs(target_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);

alter table public.audit_logs enable row level security;

-- 監査ログの閲覧は、アプリ画面側では owner / admin のみに制限します。
-- RLSでは所属店舗のログだけ見られるようにします。
drop policy if exists "audit_logs_select_own_store" on public.audit_logs;
create policy "audit_logs_select_own_store"
on public.audit_logs
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

-- insertはアプリ/API側から行います。所属店舗のログだけ作成できます。
drop policy if exists "audit_logs_insert_own_store" on public.audit_logs;
create policy "audit_logs_insert_own_store"
on public.audit_logs
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

grant select, insert on public.audit_logs to authenticated;

-- 確認用:
-- select * from public.audit_logs order by created_at desc;
