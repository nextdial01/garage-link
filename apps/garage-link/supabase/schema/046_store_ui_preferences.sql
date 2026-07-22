-- 046 店舗ごとの主タブ・集計基準UI設定
-- ダッシュボード外UIの標準化と、店舗ごとの差分設定を両立するための保存先。

alter table public.stores
  add column if not exists primary_navigation_tabs text[] not null default array['home', 'vehicles', 'deals', 'customers', 'menu']::text[],
  add column if not exists sales_recognition_basis text not null default 'delivery',
  add column if not exists purchase_recognition_basis text not null default 'purchase_confirmed',
  add column if not exists business_type text,
  add column if not exists vehicle_focus text,
  add column if not exists management_target_gross_profit_yen bigint;

alter table public.stores
  drop constraint if exists stores_sales_recognition_basis_check,
  add constraint stores_sales_recognition_basis_check
    check (sales_recognition_basis in ('contract', 'delivery', 'invoice'));

alter table public.stores
  drop constraint if exists stores_purchase_recognition_basis_check,
  add constraint stores_purchase_recognition_basis_check
    check (purchase_recognition_basis in ('purchase_confirmed', 'stock_in', 'supplier_invoice'));

-- ロールバック:
-- alter table public.stores
--   drop column if exists primary_navigation_tabs,
--   drop column if exists sales_recognition_basis,
--   drop column if exists purchase_recognition_basis,
--   drop column if exists business_type,
--   drop column if exists vehicle_focus,
--   drop column if exists management_target_gross_profit_yen;
