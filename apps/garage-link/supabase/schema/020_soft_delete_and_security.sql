-- GARAGE LINK soft delete and security preparation
-- 本番運用前に、主要データを物理削除ではなく「論理削除」で扱うためのカラムを追加します。
-- 既存データは削除しません。Supabase SQL Editorでそのまま実行できます。

-- 論理削除で使うカラム:
-- deleted_at  : 削除扱いにした日時
-- deleted_by  : 削除操作をしたユーザーのメールアドレスなど
-- is_archived : 一覧から隠すための補助フラグ

alter table if exists public.vehicles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_vehicles_store_deleted_at on public.vehicles(store_id, deleted_at);
create index if not exists idx_vehicles_store_is_archived on public.vehicles(store_id, is_archived);

alter table if exists public.customers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_customers_store_deleted_at on public.customers(store_id, deleted_at);
create index if not exists idx_customers_store_is_archived on public.customers(store_id, is_archived);

alter table if exists public.deals
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_deals_store_deleted_at on public.deals(store_id, deleted_at);
create index if not exists idx_deals_store_is_archived on public.deals(store_id, is_archived);

alter table if exists public.quotes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_quotes_store_deleted_at on public.quotes(store_id, deleted_at);
create index if not exists idx_quotes_store_is_archived on public.quotes(store_id, is_archived);

alter table if exists public.invoices
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_invoices_store_deleted_at on public.invoices(store_id, deleted_at);
create index if not exists idx_invoices_store_is_archived on public.invoices(store_id, is_archived);

alter table if exists public.maintenance_jobs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_maintenance_jobs_store_deleted_at on public.maintenance_jobs(store_id, deleted_at);
create index if not exists idx_maintenance_jobs_store_is_archived on public.maintenance_jobs(store_id, is_archived);

alter table if exists public.inventory_counts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_inventory_counts_store_deleted_at on public.inventory_counts(store_id, deleted_at);
create index if not exists idx_inventory_counts_store_is_archived on public.inventory_counts(store_id, is_archived);

-- 棚卸し明細も画面上で行削除できるため、物理削除ではなくアーカイブできるようにします。
alter table if exists public.inventory_count_items
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_inventory_count_items_store_deleted_at on public.inventory_count_items(store_id, deleted_at);
create index if not exists idx_inventory_count_items_store_is_archived on public.inventory_count_items(store_id, is_archived);

alter table if exists public.line_friends
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_friends_store_deleted_at on public.line_friends(store_id, deleted_at);
create index if not exists idx_line_friends_store_is_archived on public.line_friends(store_id, is_archived);

alter table if exists public.line_tags
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_tags_store_deleted_at on public.line_tags(store_id, deleted_at);
create index if not exists idx_line_tags_store_is_archived on public.line_tags(store_id, is_archived);

alter table if exists public.line_templates
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_templates_store_deleted_at on public.line_templates(store_id, deleted_at);
create index if not exists idx_line_templates_store_is_archived on public.line_templates(store_id, is_archived);

alter table if exists public.line_campaigns
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_campaigns_store_deleted_at on public.line_campaigns(store_id, deleted_at);
create index if not exists idx_line_campaigns_store_is_archived on public.line_campaigns(store_id, is_archived);

alter table if exists public.line_steps
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_steps_store_deleted_at on public.line_steps(store_id, deleted_at);
create index if not exists idx_line_steps_store_is_archived on public.line_steps(store_id, is_archived);

alter table if exists public.line_forms
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_forms_store_deleted_at on public.line_forms(store_id, deleted_at);
create index if not exists idx_line_forms_store_is_archived on public.line_forms(store_id, is_archived);

alter table if exists public.line_rich_menus
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_rich_menus_store_deleted_at on public.line_rich_menus(store_id, deleted_at);
create index if not exists idx_line_rich_menus_store_is_archived on public.line_rich_menus(store_id, is_archived);

alter table if exists public.line_auto_replies
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_auto_replies_store_deleted_at on public.line_auto_replies(store_id, deleted_at);
create index if not exists idx_line_auto_replies_store_is_archived on public.line_auto_replies(store_id, is_archived);

alter table if exists public.line_routes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists is_archived boolean default false;
create index if not exists idx_line_routes_store_deleted_at on public.line_routes(store_id, deleted_at);
create index if not exists idx_line_routes_store_is_archived on public.line_routes(store_id, is_archived);

-- 確認用:
-- select id, deleted_at, deleted_by, is_archived from public.vehicles limit 5;
-- select id, deleted_at, deleted_by, is_archived from public.line_tags limit 5;
