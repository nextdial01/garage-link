-- Current Supabase Gate C5 read-only checklist。
-- DB-004 R1 postcheckとpost-R1 backup完了後、migration前に実行する。
begin transaction read only;
set local statement_timeout='120s';

select
  (select count(*) from supabase_migrations.schema_migrations) migration_ledger_count,
  (select count(*) from public.stores where tenant_id is null) store_tenant_null,
  (select count(*) from public.memberships where status='active' and role='owner' and joined_at is null) active_owner_joined_at_null,
  (select count(*) from (
    select tenant_id,user_id from public.memberships where status='active' group by tenant_id,user_id having count(*)>1
  ) d) duplicate_active_membership,
  (select count(*) from public.audit_logs where action='db004_independent_tenant_recovery'
    and metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf') db004_recovery_audit,
  (select count(*) from public.store_members sm where not exists(
    select 1 from public.memberships m where m.store_id=sm.store_id and m.user_id=sm.user_id and m.status='active'
  )) old_only_membership_count,
  to_regclass('public.payment_items') is null as payment_items_pending_create,
  to_regclass('public.trade_in_vehicles') is null as trade_in_vehicles_pending_create,
  to_regclass('public.delivery_usage_logs') is null as delivery_usage_logs_pending_create,
  to_regclass('public.delivery_overage_logs') is null as delivery_overage_logs_pending_create;

do $c5$
declare
  v_bad bigint;
  v record;
begin
  if (select count(*) from supabase_migrations.schema_migrations)<>39 then raise exception 'C5_LEDGER_EXPECTED_39'; end if;
  if (select count(*) from public.stores where tenant_id is null)<>0 then raise exception 'C5_STORE_TENANT_NULL'; end if;
  if (select count(*) from public.memberships where status='active' and role='owner' and joined_at is null)<>0 then raise exception 'C5_OWNER_JOINED_AT_NULL'; end if;
  if exists(select 1 from public.tenants t where t.status='active' and not exists(
    select 1 from public.memberships m where m.tenant_id=t.id and m.role='owner' and m.status='active' and m.joined_at is not null
  )) then raise exception 'C5_ACTIVE_TENANT_WITHOUT_OWNER'; end if;
  if exists(select 1 from public.memberships m
    left join auth.users u on u.id=m.user_id
    left join public.tenants t on t.id=m.tenant_id
    left join public.stores s on s.id=m.store_id
    where m.status='active' and (m.user_id is null or u.id is null or t.id is null or t.status<>'active'
      or s.id is null or s.status not in('active','trial') or s.tenant_id is distinct from m.tenant_id
      or m.role not in('owner','admin','staff','viewer') or m.joined_at is null)
  ) then raise exception 'C5_INVALID_ACTIVE_MEMBERSHIP'; end if;
  if exists(select 1 from public.memberships where status='active' group by tenant_id,user_id having count(*)>1) then
    raise exception 'C5_DUPLICATE_ACTIVE_MEMBERSHIP';
  end if;
  if exists(select 1 from public.company_subscriptions cs join public.stores s on s.id=cs.company_id
    where cs.tenant_id is distinct from s.tenant_id) then raise exception 'C5_SUBSCRIPTION_SCOPE_MISMATCH'; end if;
  if (select count(*) from public.audit_logs where action='db004_independent_tenant_recovery'
    and metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf')<>4 then raise exception 'C5_DB004_AUDIT_NOT_4'; end if;

  if to_regclass('public.payment_items') is not null
     or to_regclass('public.trade_in_vehicles') is not null
     or to_regclass('public.delivery_usage_logs') is not null
     or to_regclass('public.delivery_overage_logs') is not null then
    raise exception 'C5_DB003_RELATION_UNEXPECTED_BEFORE_00450';
  end if;
  if to_regclass('public.vehicle_sale_claims') is not null
     or to_regclass('public.membership_store_assignments') is not null
     or to_regclass('public.invoice_payment_ledger') is not null
     or to_regclass('public.sale_correction_cases') is not null then
    raise exception 'C5_PENDING_MIGRATION_RELATION_ALREADY_PRESENT';
  end if;

  if exists(select 1 from public.deals d where d.vehicle_id is not null and d.status='成約'
    group by d.store_id,d.vehicle_id having count(*)>1) then raise exception 'C5_DUPLICATE_WON_DEAL'; end if;
  if exists(select 1 from public.deals d left join public.vehicles vehicle_row on vehicle_row.id=d.vehicle_id
    where d.vehicle_id is not null and (vehicle_row.id is null or vehicle_row.store_id<>d.store_id)) then raise exception 'C5_DEAL_VEHICLE_SCOPE_OR_ORPHAN'; end if;
  if exists(select 1 from public.deals d left join public.customers c on c.id=d.customer_id
    where d.customer_id is not null and (c.id is null or c.store_id<>d.store_id)) then raise exception 'C5_DEAL_CUSTOMER_SCOPE_OR_ORPHAN'; end if;
  if exists(select 1 from public.invoices i left join public.deals d on d.id=i.deal_id
    where i.deal_id is not null and (d.id is null or d.store_id<>i.store_id)) then raise exception 'C5_INVOICE_DEAL_SCOPE_OR_ORPHAN'; end if;

  for v in
    select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='store_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
  loop
    execute format('select count(*) from %I.%I x join public.stores s on s.id=x.store_id where x.tenant_id is not null and x.tenant_id<>s.tenant_id',v.schema_name,v.table_name) into v_bad;
    if v_bad<>0 then raise exception 'C5_CROSS_TENANT:%:%',v.table_name,v_bad; end if;
  end loop;

  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity)<>103 then raise exception 'C5_RLS_COUNT_CHANGED'; end if;
  if (select count(*) from pg_policies where schemaname='public')<>364 then raise exception 'C5_POLICY_COUNT_CHANGED'; end if;
  raise notice 'C5_PASS: DB004, membership, scope, sale/accounting prechecks and DB003 pending state are valid';
end
$c5$;

select 'PASS only when every prior result is zero/expected and no exception occurred' as c5_operator_decision;
rollback;
