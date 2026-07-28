\set ON_ERROR_STOP on
begin transaction read only;
set local statement_timeout='30s';

select json_build_object(
  'database', current_database(),
  'currentUser', current_user,
  'sessionUser', session_user,
  'ledgerCount', (select count(*) from supabase_migrations.schema_migrations),
  'targetMigrationCount', (select count(*) from supabase_migrations.schema_migrations where version=:'migration_version'),
  'garageSignatureCount',
    (case when coalesce(obj_description(to_regclass('public.stores')), '') like 'GARAGE LINK%' then 1 else 0 end)
    + (case when coalesce(obj_description(to_regclass('public.invoices')), '') like 'GARAGE LINK%' then 1 else 0 end)
    + (case when coalesce(obj_description(to_regclass('public.audit_logs')), '') like 'GARAGE LINK%' then 1 else 0 end),
  'requiredRelationMissing',
    (select count(*) from unnest(array[
      'public.stores','public.memberships','public.vehicle_sale_claims',
      'public.invoice_payment_ledger','public.sale_correction_cases','public.inventory_counts'
    ]) relation_name where to_regclass(relation_name) is null)
)::text;
rollback;
