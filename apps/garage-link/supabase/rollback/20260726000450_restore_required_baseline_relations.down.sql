-- DB-003 security-preserving rollback.
-- The four canonical relations and their RLS are deliberately retained because
-- dropping them would destroy data and make later G1-C/G4-A migrations unsafe.
do $$
declare
  v_relation text;
begin
  foreach v_relation in array array['payment_items','trade_in_vehicles','delivery_usage_logs','delivery_overage_logs'] loop
    if to_regclass('public.' || v_relation) is null then
      raise exception 'DB003_SECURITY_RELATION_MISSING: %',v_relation;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_relation and c.relrowsecurity
    ) then
      raise exception 'DB003_SECURITY_RLS_DISABLED: %',v_relation;
    end if;
  end loop;
end;
$$;
