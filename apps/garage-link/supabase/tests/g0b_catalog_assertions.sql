\set ON_ERROR_STOP on

do $$
declare
  v_count bigint;
begin
  if current_database() <> 'postgres' then raise exception 'G0B_DATABASE_MISMATCH'; end if;
  if to_regnamespace('auth') is null or to_regnamespace('storage') is null
     or to_regnamespace('extensions') is null or to_regnamespace('realtime') is null
     or to_regnamespace('vault') is null or to_regnamespace('graphql') is null then
    raise exception 'G0B_SUPABASE_SCHEMA_MISSING';
  end if;
  if to_regprocedure('auth.uid()') is null then raise exception 'G0B_AUTH_UID_MISSING'; end if;
  if (select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto') <> 'extensions' then
    raise exception 'G0B_PGCRYPTO_SCHEMA_MISMATCH';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'G0B_CLIENT_ROLE_OVERPRIVILEGED';
  end if;
  if not exists (select 1 from pg_roles where rolname='service_role' and rolbypassrls) then
    raise exception 'G0B_SERVICE_ROLE_MISMATCH';
  end if;

  select count(*) into v_count from supabase_migrations.schema_migrations;
  if v_count <> 62 then raise exception 'G0B_LEDGER_COUNT: %', v_count; end if;
  select count(*) into v_count from supabase_migrations.migration_integrity where state='applied';
  if v_count <> 62 then raise exception 'G0B_INTEGRITY_COUNT: %', v_count; end if;
  if exists (
    select 1 from supabase_migrations.schema_migrations m
    left join supabase_migrations.migration_integrity i using(version)
    where i.version is null or i.checksum !~ '^[0-9a-f]{64}$'
  ) then raise exception 'G0B_LEDGER_INTEGRITY_MISSING'; end if;
  if to_regnamespace('qa_internal') is null
     or to_regclass('qa_internal.runs') is null
     or to_regclass('qa_internal.fixtures') is null
     or to_regprocedure('public.qa_lifecycle_teardown(uuid,boolean)') is null then
    raise exception 'G0B_QA_LIFECYCLE_FRAMEWORK_MISSING';
  end if;
  if has_schema_privilege('anon','qa_internal','USAGE')
     or has_schema_privilege('authenticated','qa_internal','USAGE')
     or has_function_privilege('anon','public.qa_lifecycle_teardown(uuid,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.qa_lifecycle_teardown(uuid,boolean)','EXECUTE') then
    raise exception 'G0B_QA_LIFECYCLE_EXPOSED';
  end if;

  select count(*) into v_count from pg_tables where schemaname='public';
  if v_count <> 75 then raise exception 'G0B_PUBLIC_TABLE_COUNT: %', v_count; end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
  ) then raise exception 'G0B_PUBLIC_RLS_DISABLED'; end if;
  select count(*) into v_count
  from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public';
  if v_count <> 184 then raise exception 'G0B_POLICY_COUNT: %', v_count; end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and not coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%'
  ) then raise exception 'G0B_SECURITY_DEFINER_SEARCH_PATH'; end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in ('memberships','store_members')
      and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'G0B_MEMBERSHIP_DIRECT_WRITE'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public'
      and table_name in ('membership_store_assignments','user_active_store_preferences')
      and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'G0B_G1D_DIRECT_WRITE'; end if;
  if to_regprocedure('public.current_user_active_store_id()') is null
     or to_regprocedure('public.switch_active_garage_store(uuid,uuid,text)') is null then
    raise exception 'G0B_G1D_RPC_MISSING';
  end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema='public' and routine_name='switch_active_garage_store'
      and grantee in ('anon','PUBLIC') and privilege_type='EXECUTE'
  ) then raise exception 'G0B_G1D_ANON_SWITCH_EXECUTE'; end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in ('vehicle_sale_claims','vehicle_sale_operations')
      and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'G0B_SALE_TABLE_DIRECT_WRITE'; end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema='public'
      and routine_name in ('reserve_vehicle_sale','cancel_vehicle_sale','complete_vehicle_delivery')
      and grantee in ('anon','PUBLIC') and privilege_type='EXECUTE'
  ) then raise exception 'G0B_ANON_SALE_RPC_EXECUTE'; end if;
  if (select count(*) from information_schema.routine_privileges
      where routine_schema='public'
        and routine_name in ('reserve_vehicle_sale','cancel_vehicle_sale','complete_vehicle_delivery')
        and grantee='authenticated' and privilege_type='EXECUTE') <> 3 then
    raise exception 'G0B_AUTHENTICATED_SALE_RPC_EXECUTE';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in ('invoice_payment_ledger','accounting_operations')
      and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'G0B_G4A_DIRECT_ACCOUNTING_WRITE'; end if;
  if (select count(*) from information_schema.routine_privileges
      where routine_schema='public'
        and routine_name in ('issue_garage_invoice','void_garage_invoice','record_garage_payment','record_garage_payment_reversal')
        and grantee='authenticated' and privilege_type='EXECUTE') <> 4 then
    raise exception 'G0B_G4A_RPC_EXECUTE';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name in ('sale_correction_cases','sale_correction_operations',
      'sale_correction_events','customer_vehicle_ownership_history','sale_correction_refunds')
      and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'G0B_G4B_DIRECT_WRITE'; end if;
  if (select count(*) from information_schema.routine_privileges
      where routine_schema='public'
        and routine_name in ('create_sale_correction_case','transition_sale_correction_case','record_sale_correction_refund',
          'complete_sale_correction_inspection','resolve_sale_correction_ownership','confirm_sale_correction_restock',
          'resolve_sale_correction_external_procedure')
        and grantee='authenticated' and privilege_type='EXECUTE') <> 7 then
    raise exception 'G0B_G4B_RPC_EXECUTE';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema='supabase_migrations' and grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then raise exception 'G0B_LEDGER_ACL_EXPOSED'; end if;
end;
$$;

select 'G0B_CATALOG_ASSERTIONS_PASS' as result;
