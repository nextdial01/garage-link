-- Include the same direct costs that the mobile vehicle detail uses.
-- This replaces the existing invoker-rights function without changing its API.
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
  vehicles_with_cost as (
    select v.*,
      coalesce(v.purchase_price,0) + coalesce(v.direct_cost_special,0)
      + coalesce(v.direct_cost_accessories,0) + coalesce(v.direct_cost_agency,0)
      + coalesce(v.direct_cost_legal,0) + coalesce(v.direct_cost_other,0)
      + coalesce(v.direct_cost_repair,0) as total_cost,
      ((now() at time zone 'Asia/Tokyo')::date - coalesce(v.purchase_date, v.created_at::date)) as days_in_stock
    from public.vehicles v
    where v.store_id = p_store_id and v.deleted_at is null
      and coalesce(v.is_archived,false) = false
  ),
  in_stock as (
    select * from vehicles_with_cost
    where coalesce(status,'') not in ('売約済み','sold','納車済み','廃車','scrapped')
  ),
  sold_this_month as (
    select * from vehicles_with_cost
    where sold_date is not null
      and date_trunc('month', sold_date) = date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)
  )
  select json_build_object(
    'inventory_total_cost', coalesce((select sum(total_cost) from in_stock),0),
    'expected_gross_profit', coalesce((select sum(coalesce(market_value,listing_price,0) - total_cost) from in_stock),0),
    'long_stay_count', coalesce((select count(*) from in_stock, s where in_stock.days_in_stock > s.threshold),0),
    'avg_days_in_stock', coalesce((select round(avg(days_in_stock)) from in_stock),0),
    'in_stock_count', coalesce((select count(*) from in_stock),0),
    'sold_this_month_count', coalesce((select count(*) from sold_this_month),0),
    'realized_gross_profit_this_month', coalesce((select sum(coalesce(sale_price,0) - total_cost) from sold_this_month),0),
    'long_stay_threshold_days', (select threshold from s)
  );
$$;

-- Rollback: restore the previous function body from
-- 20260701000100_inventory_profit_turnover.sql (the signature is unchanged).
