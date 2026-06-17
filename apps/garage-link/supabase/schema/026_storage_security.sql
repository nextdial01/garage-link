-- GARAGE LINK storage security
-- private bucket前提のファイル管理メタデータとセキュリティイベント種別を追加します。
-- 既存データ・既存Storageオブジェクトは削除しません。

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
    'csv_export_rate_limited',
    'file_upload_rejected',
    'file_upload_rate_limited',
    'file_access_denied',
    'file_delete_denied',
    'file_type_rejected',
    'file_size_rejected',
    'cross_tenant_file_access_blocked'
  )
);

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  bucket text not null default 'garage-private',
  path text not null,
  original_filename text,
  safe_filename text not null,
  mime_type text not null,
  size_bytes integer not null default 0,
  file_type text not null,
  purpose text not null,
  related_type text,
  related_id uuid,
  uploaded_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket, path),
  constraint uploaded_files_bucket_check check (bucket in ('garage-private', 'garage-public-assets')),
  constraint uploaded_files_file_type_check check (file_type in ('image', 'csv', 'pdf')),
  constraint uploaded_files_purpose_check check (
    purpose in (
      'company_logo',
      'company_seal',
      'vehicle_image',
      'line_rich_menu',
      'line_message_image',
      'csv_import',
      'inquiry_attachment',
      'other'
    )
  )
);

comment on table public.uploaded_files is 'Storage上のファイルメタデータ。ファイル本文や署名URLは保存しない';
comment on column public.uploaded_files.original_filename is '元ファイル名。個人情報が含まれる可能性があるため表示・ログ保存には注意';
comment on column public.uploaded_files.path is 'サーバー生成path。tenant_id/store_idを含める';

create index if not exists idx_uploaded_files_tenant_id on public.uploaded_files(tenant_id);
create index if not exists idx_uploaded_files_store_id on public.uploaded_files(store_id);
create index if not exists idx_uploaded_files_uploaded_by on public.uploaded_files(uploaded_by);
create index if not exists idx_uploaded_files_purpose on public.uploaded_files(purpose);
create index if not exists idx_uploaded_files_related on public.uploaded_files(related_type, related_id);
create index if not exists idx_uploaded_files_deleted_at on public.uploaded_files(deleted_at);

drop trigger if exists set_uploaded_files_updated_at on public.uploaded_files;
create trigger set_uploaded_files_updated_at
before update on public.uploaded_files
for each row
execute function public.set_updated_at();

alter table public.uploaded_files enable row level security;

drop policy if exists "uploaded_files_select_own_store" on public.uploaded_files;
create policy "uploaded_files_select_own_store"
on public.uploaded_files
for select
to authenticated
using (store_id in (select public.current_user_store_ids()));

drop policy if exists "uploaded_files_insert_own_store" on public.uploaded_files;
create policy "uploaded_files_insert_own_store"
on public.uploaded_files
for insert
to authenticated
with check (store_id in (select public.current_user_store_ids()));

drop policy if exists "uploaded_files_update_own_store" on public.uploaded_files;
create policy "uploaded_files_update_own_store"
on public.uploaded_files
for update
to authenticated
using (store_id in (select public.current_user_store_ids()))
with check (store_id in (select public.current_user_store_ids()));

grant select, insert, update on public.uploaded_files to authenticated;

-- Storage bucketはSupabase管理画面またはstaging適用時にprivateで作成してください。
-- 推奨:
-- garage-private: private
-- garage-public-assets: publicでもよいが、顧客情報・業務ファイルは置かない

-- 確認用:
-- select * from public.uploaded_files order by created_at desc;
