do $$
declare
  v_relation text;
begin
  foreach v_relation in array array['payment_items','trade_in_vehicles','delivery_usage_logs','delivery_overage_logs'] loop
    if to_regclass('public.' || v_relation) is null then
      raise exception 'DB003_REQUIRED_RELATION_ABSENT: %',v_relation;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_relation and c.relrowsecurity
    ) then
      raise exception 'DB003_RLS_DISABLED: %',v_relation;
    end if;
    if not exists (
      select 1 from pg_trigger
      where tgrelid=to_regclass('public.' || v_relation)
        and tgname='g1c_scope_immutable' and not tgisinternal
    ) then
      raise exception 'DB003_IMMUTABLE_GUARD_MISSING: %',v_relation;
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conname='payment_items_invoice_store_fk')
     or not exists (select 1 from pg_constraint where conname='trade_in_vehicles_deal_store_fk')
     or not exists (select 1 from pg_constraint where conname='delivery_usage_logs_store_tenant_fk')
     or not exists (select 1 from pg_constraint where conname='delivery_overage_logs_store_tenant_fk') then
    raise exception 'DB003_G1C_SCOPE_CONSTRAINT_MISSING';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public'
      and table_name in ('delivery_usage_logs','delivery_overage_logs')
      and grantee in ('anon','authenticated')
      and privilege_type in ('UPDATE','DELETE')
  ) then
    raise exception 'DB003_APPEND_ONLY_GRANT_REGRESSION';
  end if;
end;
$$;
