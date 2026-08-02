\set ON_ERROR_STOP on
begin transaction read only;
set local statement_timeout='120s';
select set_config('garage.g7_migration_version', :'migration_version', true);
select set_config('garage.g7_migration_checksum', :'migration_checksum', true);
select set_config('garage.g7_expected_ledger_after', :'expected_ledger_after', true);
select set_config('garage.g7_migration_file', :'migration_file', true);

do $postcheck$
declare v_bad bigint; check_row record;
begin
  if (select count(*) from supabase_migrations.schema_migrations)<>current_setting('garage.g7_expected_ledger_after')::integer then raise exception 'G7_POSTCHECK_LEDGER_COUNT'; end if;
  if (select count(*) from supabase_migrations.schema_migrations where version=current_setting('garage.g7_migration_version'))<>1 then raise exception 'G7_POSTCHECK_VERSION_COUNT'; end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where version=current_setting('garage.g7_migration_version') and statements=array[current_setting('garage.g7_migration_file')]::text[]) then raise exception 'G7_POSTCHECK_LEDGER_FILE'; end if;
  if not exists(select 1 from supabase_migrations.migration_integrity where version=current_setting('garage.g7_migration_version') and checksum=current_setting('garage.g7_migration_checksum') and state='applied') then raise exception 'G7_POSTCHECK_LEDGER_INTEGRITY'; end if;

  if to_regclass('public.billing_sync_operations') is null then raise exception 'G7_POSTCHECK_BILLING_SYNC_TABLE'; end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='billing_sync_operations' and c.relrowsecurity) then raise exception 'G7_POSTCHECK_BILLING_SYNC_RLS'; end if;
  if to_regprocedure('public.cancel_maintenance_job(uuid,text,text)') is null
     or to_regprocedure('public.create_inventory_count(uuid,jsonb,jsonb,text)') is null
     or to_regprocedure('public.finalize_inventory_count(uuid,text)') is null
     or to_regprocedure('public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint)') is null then raise exception 'G7_POSTCHECK_RPC_MISSING'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.uploaded_files'::regclass and conname='uploaded_files_path_scope_check') then raise exception 'G7_POSTCHECK_UPLOAD_CHECK'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.inventory_counts'::regclass and conname='inventory_counts_status_g7_check') then raise exception 'G7_POSTCHECK_INVENTORY_CHECK'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='inventory_counts_one_active_store_uidx') then raise exception 'G7_POSTCHECK_INVENTORY_UNIQUE'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='repair_part_stock_movements_operation_uidx') then raise exception 'G7_POSTCHECK_SERVICE_UNIQUE'; end if;
  if (select count(*) from pg_policies where schemaname='public' and policyname='g7_soft_delete_visibility')<>8 then raise exception 'G7_POSTCHECK_PII_POLICIES'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('garage_plan_limit_guard','cancel_maintenance_job','create_inventory_count','finalize_inventory_count','apply_ordered_stripe_subscription_event','accept_membership_invite','change_membership_role','deactivate_membership','create_store_for_current_user') and not ('search_path=public, pg_temp'=any(coalesce(p.proconfig,array[]::text[])))) then raise exception 'G7_POSTCHECK_SEARCH_PATH'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('garage_plan_limit_guard','cancel_maintenance_job','create_inventory_count','finalize_inventory_count','apply_ordered_stripe_subscription_event','accept_membership_invite','change_membership_role','deactivate_membership','create_store_for_current_user') and pg_get_userbyid(p.proowner)<>'postgres') then raise exception 'G7_POSTCHECK_FUNCTION_OWNER'; end if;
  if has_table_privilege('authenticated','public.stores','INSERT') or has_table_privilege('authenticated','public.uploaded_files','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.store_members','INSERT,UPDATE,DELETE') then raise exception 'G7_POSTCHECK_DIRECT_WRITE_GRANT'; end if;
  if has_function_privilege('anon','public.cancel_maintenance_job(uuid,text,text)','EXECUTE') or not has_function_privilege('authenticated','public.cancel_maintenance_job(uuid,text,text)','EXECUTE') then raise exception 'G7_POSTCHECK_MAINTENANCE_EXECUTE'; end if;
  if has_function_privilege('authenticated','public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint)','EXECUTE') or not has_function_privilege('service_role','public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint)','EXECUTE') then raise exception 'G7_POSTCHECK_STRIPE_EXECUTE'; end if;
  if exists(select 1 from public.billing_sync_operations) then raise exception 'G7_POSTCHECK_UNEXPECTED_BACKFILL'; end if;

  for check_row in
    select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='store_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
  loop
    execute format('select count(*) from %I.%I x join public.stores s on s.id=x.store_id where x.tenant_id is not null and x.tenant_id<>s.tenant_id',check_row.schema_name,check_row.table_name) into v_bad;
    if v_bad<>0 then raise exception 'G7_POSTCHECK_CROSS_TENANT:%:%',check_row.table_name,v_bad; end if;
  end loop;
end
$postcheck$;

select json_build_object(
  'status','PASS','ledger',(select count(*) from supabase_migrations.schema_migrations),
  'rlsTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity),
  'policies',(select count(*) from pg_policies where schemaname='public'),
  'g7Policies',(select count(*) from pg_policies where schemaname='public' and policyname='g7_soft_delete_visibility')
)::text as g7_postcheck;
rollback;
