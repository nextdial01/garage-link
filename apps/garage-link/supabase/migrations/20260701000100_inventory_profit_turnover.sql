-- Deployable migration promotion of supabase/schema/041_inventory_profit_turnover.sql.
-- See 20260630000000_delivery_candidate_event_types.sql for why this promotion exists.
-- 041 has no dependency on 037-040 (it only touches vehicles/stores and reads
-- vehicles.purchase_price, already present since schema/001) and no later migration depends on
-- it specifically; it applies last in this batch to keep the promoted files in their original
-- schema/ numbering order.
--
-- The SQL body below is byte-identical to supabase/schema/041_inventory_profit_turnover.sql
-- as of this migration's creation (enforced by tests/security/migration-chain-037-041.test.ts).

-- 041 在庫利益・回転（Phase 2）
--
-- 既存利用: vehicles.purchase_price(仕入価格). 不足分を追加:
--   purchase_date(仕入日), listing_price(希望売価), sale_price(販売価格), sold_date(販売日),
--   market_value(将来の市場相場値・nullable・今回は未連携).
-- 長期滞留閾値は店舗設定として stores.long_stay_threshold_days（初期90日）に保持。
-- 集計はサーバ側RPC（SECURITY INVOKER + RLS）で条件を固定し、クライアント入力値だけを信用しない。
--
-- 在庫日数 = coalesce(sold_date, today) - coalesce(purchase_date, created_at::date)
-- 粗利     = coalesce(sale_price,0) - coalesce(purchase_price,0)
-- 在庫対象 = deleted_at is null and not is_archived and status not in (売約済み/sold/納車済み/廃車/scrapped)

alter table public.vehicles
  add column if not exists purchase_date date,
  add column if not exists listing_price numeric(12,2),
  add column if not exists sale_price    numeric(12,2),
  add column if not exists sold_date     date,
  add column if not exists market_value  numeric(12,2);
comment on column public.vehicles.listing_price is '希望売価';
comment on column public.vehicles.market_value is '将来の市場相場値（外部連携用・現状未使用）';

alter table public.stores
  add column if not exists long_stay_threshold_days integer not null default 90;
comment on column public.stores.long_stay_threshold_days is '長期滞留在庫とみなす在庫日数の閾値（初期90日）';

-- 在庫指標ダッシュボード集計（店舗スコープ・RLS）
create or replace function public.inventory_dashboard_metrics(p_store_id uuid)
returns json
language sql
security invoker
set search_path = public
as $$
  with s as (
    select coalesce(long_stay_threshold_days, 90) as threshold
    from public.stores where id = p_store_id
  ),
  in_stock as (
    select v.*,
      ((now() at time zone 'Asia/Tokyo')::date - coalesce(v.purchase_date, v.created_at::date)) as days_in_stock
    from public.vehicles v
    where v.store_id = p_store_id
      and v.deleted_at is null and coalesce(v.is_archived,false) = false
      and coalesce(v.status,'') not in ('売約済み','sold','納車済み','廃車','scrapped')
  ),
  sold_this_month as (
    select v.* from public.vehicles v
    where v.store_id = p_store_id and v.deleted_at is null
      and v.sold_date is not null
      and date_trunc('month', v.sold_date) = date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)
  )
  select json_build_object(
    'inventory_total_cost',  coalesce((select sum(purchase_price) from in_stock), 0),
    'expected_gross_profit', coalesce((select sum(coalesce(listing_price,0) - coalesce(purchase_price,0)) from in_stock), 0),
    'long_stay_count',       coalesce((select count(*) from in_stock, s where in_stock.days_in_stock > s.threshold), 0),
    'avg_days_in_stock',     coalesce((select round(avg(days_in_stock)) from in_stock), 0),
    'in_stock_count',        coalesce((select count(*) from in_stock), 0),
    'sold_this_month_count', coalesce((select count(*) from sold_this_month), 0),
    'realized_gross_profit_this_month', coalesce((select sum(coalesce(sale_price,0) - coalesce(purchase_price,0)) from sold_this_month), 0),
    'long_stay_threshold_days', (select threshold from s)
  );
$$;

grant execute on function public.inventory_dashboard_metrics(uuid) to authenticated;

-- ロールバック:
-- drop function if exists public.inventory_dashboard_metrics(uuid);
-- alter table public.stores drop column if exists long_stay_threshold_days;
-- alter table public.vehicles drop column if exists purchase_date, drop column if exists listing_price,
--   drop column if exists sale_price, drop column if exists sold_date, drop column if exists market_value;
