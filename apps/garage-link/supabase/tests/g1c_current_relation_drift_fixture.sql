-- Current Supabase 39-ledger equivalent: canonical baseline relations were never
-- installed through timestamp migrations. Synthetic local fixture only.
do $$
begin
  if coalesce(current_setting('app.g0b_fixture',true),'') <> 'enabled' then
    raise exception 'DB003_DRIFT_FIXTURE_REQUIRES_EXPLICIT_MARKER';
  end if;
end;
$$;

drop table if exists public.payment_items;
drop table if exists public.trade_in_vehicles;
drop table if exists public.delivery_overage_logs;
drop table if exists public.delivery_usage_logs;

do $$
declare
  v_relation text;
begin
  foreach v_relation in array array['payment_items','trade_in_vehicles','delivery_usage_logs','delivery_overage_logs'] loop
    if to_regclass('public.' || v_relation) is not null then
      raise exception 'DB003_DRIFT_FIXTURE_DROP_FAILED: %',v_relation;
    end if;
  end loop;
end;
$$;
