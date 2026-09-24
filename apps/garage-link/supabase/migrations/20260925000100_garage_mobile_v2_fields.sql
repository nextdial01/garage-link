-- GARAGE LINK mobile V2: only fields not represented by the existing vehicle ledger.
-- Nullable additions preserve all existing vehicles and uploaded files.
alter table public.vehicles
  add column if not exists purchase_supplier_name text,
  add column if not exists purchase_supplier_type text,
  add column if not exists direct_cost_other numeric(12, 2),
  add column if not exists direct_cost_repair numeric(12, 2);

alter table public.uploaded_files
  add column if not exists photo_category text;

create index if not exists garage_mobile_v2_photos_related_idx
  on public.uploaded_files(store_id, related_type, related_id, created_at desc)
  where deleted_at is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'garage_mobile_v2_supplier_type_check') then
    alter table public.vehicles add constraint garage_mobile_v2_supplier_type_check
      check (purchase_supplier_type is null or purchase_supplier_type in ('オークション','業者','買取','下取','個人','その他'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'garage_mobile_v2_photo_category_check') then
    alter table public.uploaded_files add constraint garage_mobile_v2_photo_category_check
      check (photo_category is null or photo_category in ('仕入時','入庫時','整備前','整備中','整備後','傷・不具合','納車時'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'garage_mobile_v2_other_cost_check') then
    alter table public.vehicles add constraint garage_mobile_v2_other_cost_check
      check (direct_cost_other is null or direct_cost_other >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'garage_mobile_v2_repair_cost_check') then
    alter table public.vehicles add constraint garage_mobile_v2_repair_cost_check
      check (direct_cost_repair is null or direct_cost_repair >= 0);
  end if;
end $$;

-- Existing table RLS and store-scoped policies continue to apply. No new grant.
-- Rollback after confirming no new data relies on the fields:
-- drop index if exists public.garage_mobile_v2_photos_related_idx;
-- alter table public.uploaded_files drop constraint if exists garage_mobile_v2_photo_category_check;
-- alter table public.uploaded_files drop column if exists photo_category;
-- alter table public.vehicles drop constraint if exists garage_mobile_v2_supplier_type_check;
-- alter table public.vehicles drop constraint if exists garage_mobile_v2_other_cost_check;
-- alter table public.vehicles drop constraint if exists garage_mobile_v2_repair_cost_check;
-- alter table public.vehicles drop column if exists purchase_supplier_name,
--   drop column if exists purchase_supplier_type, drop column if exists direct_cost_other,
--   drop column if exists direct_cost_repair;
