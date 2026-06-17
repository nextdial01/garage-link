-- GARAGE LINK 車両管理オペレーション追加テーブル
-- 整備・車検、棚卸し、棚卸し明細を保存するためのSQLです。
-- 既存データは削除しません。Supabase SQL Editorで実行してください。

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

-- 車検、点検、整備、修理、カスタム作業を管理します。
create table if not exists public.maintenance_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  job_no text not null,
  job_type text,
  status text default 'received',
  priority text default 'normal',
  reception_date date,
  reception_route text,
  assigned_user_name text,
  request_detail text,
  symptoms text,
  work_items text[],
  planned_parts text,
  work_instruction text,
  scheduled_in_at timestamptz,
  scheduled_start_date date,
  scheduled_finish_date date,
  scheduled_delivery_at timestamptz,
  actual_in_date date,
  actual_finish_date date,
  actual_delivery_date date,
  loaner_status text,
  labor_amount integer default 0,
  parts_amount integer default 0,
  inspection_amount integer default 0,
  legal_fee_amount integer default 0,
  additional_amount integer default 0,
  discount_amount integer default 0,
  estimated_total_amount integer default 0,
  billing_amount integer default 0,
  payment_method text,
  estimate_confirm_status text,
  line_notification_enabled boolean default false,
  remind_before_enabled boolean default false,
  remind_before_days integer,
  estimate_notice_enabled boolean default false,
  completion_notice_enabled boolean default false,
  next_inspection_notice_enabled boolean default false,
  next_inspection_date date,
  line_notice_memo text,
  work_memo text,
  caution_note text,
  customer_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(store_id, job_no)
);

-- 車両・部品の棚卸しヘッダー情報を管理します。
create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  count_no text not null,
  name text not null,
  count_type text,
  count_category text,
  status text default 'draft',
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  target_inventory text,
  target_vehicle_statuses text[],
  target_part_categories text[],
  target_condition_memo text,
  target_store_name text,
  target_locations text[],
  shelf_area text,
  location_memo text,
  check_method text,
  device_type text,
  barcode_usage text,
  unread_handling text,
  difference_count integer default 0,
  unchecked_count integer default 0,
  adjustment_target_count integer default 0,
  adjustment_reason text,
  adjustment_policy text,
  difference_memo text,
  counted_by text,
  checked_by text,
  approved_by text,
  approval_status text default 'not_requested',
  approved_at timestamptz,
  approval_comment text,
  internal_memo text,
  caution_note text,
  next_improvement text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(store_id, count_no)
);

-- 棚卸しごとの明細を管理します。
create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  inventory_count_id uuid not null references public.inventory_counts(id) on delete cascade,
  item_type text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  part_sku text,
  management_no text,
  item_name text,
  location_name text,
  system_quantity numeric default 0,
  actual_quantity numeric,
  difference_quantity numeric,
  check_status text default 'unchecked',
  checked_at timestamptz,
  checked_by text,
  memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists maintenance_jobs_store_id_idx on public.maintenance_jobs(store_id);
create index if not exists maintenance_jobs_customer_id_idx on public.maintenance_jobs(customer_id);
create index if not exists maintenance_jobs_vehicle_id_idx on public.maintenance_jobs(vehicle_id);
create index if not exists maintenance_jobs_status_idx on public.maintenance_jobs(status);
create index if not exists inventory_counts_store_id_idx on public.inventory_counts(store_id);
create index if not exists inventory_counts_status_idx on public.inventory_counts(status);
create index if not exists inventory_count_items_store_id_idx on public.inventory_count_items(store_id);
create index if not exists inventory_count_items_inventory_count_id_idx on public.inventory_count_items(inventory_count_id);

drop trigger if exists set_maintenance_jobs_updated_at on public.maintenance_jobs;
create trigger set_maintenance_jobs_updated_at before update on public.maintenance_jobs for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_counts_updated_at on public.inventory_counts;
create trigger set_inventory_counts_updated_at before update on public.inventory_counts for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_count_items_updated_at on public.inventory_count_items;
create trigger set_inventory_count_items_updated_at before update on public.inventory_count_items for each row execute function public.set_updated_at();

alter table public.maintenance_jobs enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_items enable row level security;

drop policy if exists "maintenance_jobs_select_own_store" on public.maintenance_jobs;
create policy "maintenance_jobs_select_own_store" on public.maintenance_jobs for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "maintenance_jobs_insert_own_store" on public.maintenance_jobs;
create policy "maintenance_jobs_insert_own_store" on public.maintenance_jobs for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "maintenance_jobs_update_own_store" on public.maintenance_jobs;
create policy "maintenance_jobs_update_own_store" on public.maintenance_jobs for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "maintenance_jobs_delete_own_store" on public.maintenance_jobs;
create policy "maintenance_jobs_delete_own_store" on public.maintenance_jobs for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "inventory_counts_select_own_store" on public.inventory_counts;
create policy "inventory_counts_select_own_store" on public.inventory_counts for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "inventory_counts_insert_own_store" on public.inventory_counts;
create policy "inventory_counts_insert_own_store" on public.inventory_counts for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "inventory_counts_update_own_store" on public.inventory_counts;
create policy "inventory_counts_update_own_store" on public.inventory_counts for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "inventory_counts_delete_own_store" on public.inventory_counts;
create policy "inventory_counts_delete_own_store" on public.inventory_counts for delete using (store_id in (select public.current_user_store_ids()));

drop policy if exists "inventory_count_items_select_own_store" on public.inventory_count_items;
create policy "inventory_count_items_select_own_store" on public.inventory_count_items for select using (store_id in (select public.current_user_store_ids()));
drop policy if exists "inventory_count_items_insert_own_store" on public.inventory_count_items;
create policy "inventory_count_items_insert_own_store" on public.inventory_count_items for insert with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "inventory_count_items_update_own_store" on public.inventory_count_items;
create policy "inventory_count_items_update_own_store" on public.inventory_count_items for update using (store_id in (select public.current_user_store_ids())) with check (store_id in (select public.current_user_store_ids()));
drop policy if exists "inventory_count_items_delete_own_store" on public.inventory_count_items;
create policy "inventory_count_items_delete_own_store" on public.inventory_count_items for delete using (store_id in (select public.current_user_store_ids()));

grant select, insert, update, delete on public.maintenance_jobs to authenticated;
grant select, insert, update, delete on public.inventory_counts to authenticated;
grant select, insert, update, delete on public.inventory_count_items to authenticated;

-- 確認用:
-- select * from public.maintenance_jobs;
-- select * from public.inventory_counts;
-- select * from public.inventory_count_items;
