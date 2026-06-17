-- GARAGE LINK CSV security
-- CSV import/export履歴とセキュリティイベント種別を追加します。
-- 既存データは削除しません。

create extension if not exists "pgcrypto";

alter table public.security_events
drop constraint if exists security_events_event_type_check;

alter table public.security_events
add constraint security_events_event_type_check check (
  event_type in (
    'webhook_signature_invalid',
    'webhook_secret_missing',
    'webhook_env_secret_fallback_used',
    'tenant_access_denied',
    'role_access_denied',
    'feature_access_denied',
    'rate_limit_exceeded',
    'suspicious_request',
    'cross_tenant_delivery_blocked',
    'delivery_rate_limited',
    'delivery_target_mismatch',
    'line_token_decrypt_failed',
    'line_token_missing',
    'export_access_denied',
    'import_access_denied',
    'cross_tenant_export_blocked',
    'cross_tenant_import_blocked',
    'large_export_requested',
    'csv_formula_injection_detected',
    'csv_invalid_format',
    'csv_import_rate_limited',
    'csv_export_rate_limited'
  )
);

create table if not exists public.data_export_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid,
  export_type text not null,
  target_table text not null,
  row_count integer not null default 0,
  columns_exported text[],
  filters_snapshot jsonb,
  status text not null default 'completed',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.data_export_logs is 'CSV等のデータexport履歴。CSV本文や個人情報は保存しない';

create index if not exists idx_data_export_logs_tenant_id on public.data_export_logs(tenant_id);
create index if not exists idx_data_export_logs_store_id on public.data_export_logs(store_id);
create index if not exists idx_data_export_logs_user_id on public.data_export_logs(user_id);
create index if not exists idx_data_export_logs_target_table on public.data_export_logs(target_table);
create index if not exists idx_data_export_logs_created_at on public.data_export_logs(created_at);

alter table public.data_export_logs enable row level security;

drop policy if exists "data_export_logs_select_own_store" on public.data_export_logs;
create policy "data_export_logs_select_own_store"
on public.data_export_logs
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "data_export_logs_insert_own_store" on public.data_export_logs;
create policy "data_export_logs_insert_own_store"
on public.data_export_logs
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

create table if not exists public.data_import_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid,
  import_type text not null,
  target_table text not null,
  row_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'completed',
  error_summary jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.data_import_logs is 'CSV等のデータimport履歴。CSV本文や個人情報は保存しない';

create index if not exists idx_data_import_logs_tenant_id on public.data_import_logs(tenant_id);
create index if not exists idx_data_import_logs_store_id on public.data_import_logs(store_id);
create index if not exists idx_data_import_logs_user_id on public.data_import_logs(user_id);
create index if not exists idx_data_import_logs_target_table on public.data_import_logs(target_table);
create index if not exists idx_data_import_logs_created_at on public.data_import_logs(created_at);

alter table public.data_import_logs enable row level security;

drop policy if exists "data_import_logs_select_own_store" on public.data_import_logs;
create policy "data_import_logs_select_own_store"
on public.data_import_logs
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "data_import_logs_insert_own_store" on public.data_import_logs;
create policy "data_import_logs_insert_own_store"
on public.data_import_logs
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

grant select, insert on public.data_export_logs to authenticated;
grant select, insert on public.data_import_logs to authenticated;

-- 確認用:
-- select * from public.data_export_logs order by created_at desc;
-- select * from public.data_import_logs order by created_at desc;
