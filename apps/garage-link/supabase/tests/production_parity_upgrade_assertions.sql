-- Post-apply assertions for the production-parity upgrade drill: 20260731000300 (guarded),
-- 20260801000100, 20260802000100 applied against a fixture missing tenant_subscriptions.
do $$
declare
  v_count bigint;
begin
  -- The gap must still be a gap: nothing in this range should have recreated it.
  if to_regclass('public.tenant_subscriptions') is not null then
    raise exception 'PARITY_TENANT_SUBSCRIPTIONS_UNEXPECTEDLY_PRESENT';
  end if;

  -- Ledger must show all three as applied.
  select count(*) into v_count from supabase_migrations.schema_migrations
  where version in ('20260731000300','20260801000100','20260802000100');
  if v_count <> 3 then raise exception 'PARITY_LEDGER_MISSING_VERSIONS: %', v_count; end if;

  -- tenant_features (a sibling optional-looking name but confirmed present in production)
  -- must still have received its unconditional grant - the guard must not have over-fired.
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='tenant_features'
      and grantee='authenticated' and privilege_type='SELECT'
  ) then raise exception 'PARITY_TENANT_FEATURES_GRANT_MISSING'; end if;

  -- plan_change_requests must have the service_role grant from 20260802000100.
  select count(*) into v_count from information_schema.role_table_grants
  where table_schema='public' and table_name='plan_change_requests' and grantee='service_role'
    and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
  if v_count <> 4 then raise exception 'PARITY_PLAN_CHANGE_REQUESTS_GRANT_INCOMPLETE: %', v_count; end if;

  -- company_subscriptions (core GARAGE LINK billing, must always exist and be granted).
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='company_subscriptions'
      and grantee='service_role' and privilege_type='UPDATE'
  ) then raise exception 'PARITY_COMPANY_SUBSCRIPTIONS_GRANT_MISSING'; end if;

  -- The migration's own excessive-grant guard (anon relation writes, PUBLIC function
  -- execute) must still hold after this range - re-assert directly, don't just trust
  -- that `runner apply` didn't throw.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and grantee='anon'
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ) then raise exception 'PARITY_ANON_EXCESSIVE_RELATION_GRANT'; end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema='public' and grantee='PUBLIC'
  ) then raise exception 'PARITY_PUBLIC_FUNCTION_EXECUTE'; end if;

  raise notice 'PRODUCTION_PARITY_UPGRADE_ASSERTIONS_PASS';
end;
$$;
