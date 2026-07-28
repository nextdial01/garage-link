\set ON_ERROR_STOP on
begin transaction read only;
set local statement_timeout='120s';
select set_config('garage.g7_expected_ledger', :'expected_ledger', true);
select set_config('garage.g7_migration_version', :'migration_version', true);

do $precheck$
declare
  v_bad bigint;
  check_row record;
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> current_setting('garage.g7_expected_ledger')::integer then raise exception 'G7_PRECHECK_LEDGER_DRIFT'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version=current_setting('garage.g7_migration_version')) then raise exception 'G7_PRECHECK_ALREADY_APPLIED'; end if;
  if exists(select 1 from public.stores where tenant_id is null) then raise exception 'G7_PRECHECK_STORE_TENANT_NULL'; end if;
  if exists(
    select 1 from public.memberships m
    left join auth.users u on u.id=m.user_id
    left join public.tenants t on t.id=m.tenant_id
    left join public.stores s on s.id=m.store_id
    where m.status='active' and (m.deleted_at is not null or m.disabled_at is not null or m.joined_at is null
      or u.id is null or t.id is null or t.status<>'active' or s.id is null
      or not public.store_is_authorization_eligible(s.status) or s.tenant_id is distinct from m.tenant_id
      or m.role not in('owner','admin','implementer','staff','viewer'))
  ) then raise exception 'G7_PRECHECK_INVALID_MEMBERSHIP'; end if;
  if exists(select 1 from public.memberships where status='active' and deleted_at is null and disabled_at is null group by tenant_id,user_id having count(*)>1) then raise exception 'G7_PRECHECK_DUPLICATE_ACTIVE_MEMBERSHIP'; end if;
  if exists(select 1 from public.company_subscriptions cs join public.stores s on s.id=cs.company_id where cs.tenant_id is distinct from s.tenant_id) then raise exception 'G7_PRECHECK_SUBSCRIPTION_SCOPE'; end if;

  for check_row in
    select n.nspname schema_name,c.relname table_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='store_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
  loop
    execute format('select count(*) from %I.%I x join public.stores s on s.id=x.store_id where x.tenant_id is not null and x.tenant_id<>s.tenant_id',check_row.schema_name,check_row.table_name) into v_bad;
    if v_bad<>0 then raise exception 'G7_PRECHECK_CROSS_TENANT:%:%',check_row.table_name,v_bad; end if;
  end loop;

  if exists(select 1 from public.deals d left join public.vehicles v on v.id=d.vehicle_id where d.vehicle_id is not null and (v.id is null or v.store_id<>d.store_id)) then raise exception 'G7_PRECHECK_DEAL_VEHICLE_SCOPE'; end if;
  if exists(select 1 from public.deals d left join public.customers c on c.id=d.customer_id where d.customer_id is not null and (c.id is null or c.store_id<>d.store_id)) then raise exception 'G7_PRECHECK_DEAL_CUSTOMER_SCOPE'; end if;
  if exists(select 1 from public.invoices i left join public.deals d on d.id=i.deal_id where i.deal_id is not null and (d.id is null or d.store_id<>i.store_id)) then raise exception 'G7_PRECHECK_INVOICE_DEAL_SCOPE'; end if;
  if exists(select 1 from public.vehicle_sale_claims c left join public.vehicles v on v.id=c.vehicle_id left join public.deals d on d.id=c.deal_id left join public.stores s on s.id=c.store_id where v.id is null or d.id is null or s.id is null or v.store_id<>c.store_id or d.store_id<>c.store_id or s.tenant_id is distinct from c.tenant_id) then raise exception 'G7_PRECHECK_CLAIM_SCOPE_OR_ORPHAN'; end if;
  if exists(select 1 from public.vehicle_sale_claims where status='active' group by vehicle_id having count(*)>1) then raise exception 'G7_PRECHECK_DUPLICATE_ACTIVE_SALE'; end if;
  if exists(select 1 from public.membership_store_assignments a join public.memberships m on m.id=a.membership_id join public.stores s on s.id=a.store_id where a.deleted_at is null and (a.tenant_id<>m.tenant_id or a.tenant_id<>s.tenant_id)) then raise exception 'G7_PRECHECK_ASSIGNMENT_SCOPE'; end if;
  if exists(select 1 from public.user_active_store_preferences p join public.stores s on s.id=p.active_store_id where p.tenant_id<>s.tenant_id) then raise exception 'G7_PRECHECK_PREFERENCE_SCOPE'; end if;

  if exists(select 1 from public.invoice_payment_ledger l left join public.invoices i on i.id=l.invoice_id left join public.stores s on s.id=l.store_id where i.id is null or s.id is null or i.store_id<>l.store_id or s.tenant_id is distinct from l.tenant_id) then raise exception 'G7_PRECHECK_PAYMENT_ORPHAN_SCOPE'; end if;
  if exists(select 1 from public.invoice_payment_ledger l left join public.invoice_payment_ledger p on p.id=l.original_payment_id where l.entry_type in('refund','reversal') and (p.id is null or p.entry_type<>'payment' or p.invoice_id<>l.invoice_id)) then raise exception 'G7_PRECHECK_REVERSAL_ORPHAN'; end if;
  if exists(select 1 from public.invoice_payment_ledger p where p.entry_type='payment' and (select coalesce(sum(r.amount),0) from public.invoice_payment_ledger r where r.original_payment_id=p.id and r.entry_type in('refund','reversal'))>p.amount) then raise exception 'G7_PRECHECK_REFUND_EXCEEDS_PAYMENT'; end if;
  if exists(select 1 from public.invoices i left join lateral (select coalesce(sum(case when l.entry_type='payment' then l.amount else -l.amount end),0)::integer net from public.invoice_payment_ledger l where l.invoice_id=i.id) x on true where coalesce(i.paid_amount,0)<>x.net or x.net<0 or x.net>i.total_amount) then raise exception 'G7_PRECHECK_INVOICE_PAYMENT_MISMATCH'; end if;

  if exists(select 1 from public.uploaded_files where tenant_id is null) then raise exception 'G7_PRECHECK_UPLOAD_TENANT_NULL'; end if;
  if exists(select 1 from public.uploaded_files where path not like ('tenants/'||tenant_id::text||'/stores/'||store_id::text||'/%')) then raise exception 'G7_PRECHECK_UPLOAD_PATH_SCOPE'; end if;
  if exists(select 1 from public.inventory_counts where status='in_progress' and deleted_at is null group by store_id having count(*)>1) then raise exception 'G7_PRECHECK_DUPLICATE_ACTIVE_INVENTORY'; end if;
  if exists(select 1 from pg_attribute where attrelid='public.plan_change_requests'::regclass and attname='stripe_session_id' and not attisdropped) then
    execute 'select count(*) from (select stripe_session_id from public.plan_change_requests where stripe_session_id is not null group by stripe_session_id having count(*)>1) d' into v_bad;
    if v_bad<>0 then raise exception 'G7_PRECHECK_DUPLICATE_STRIPE_SESSION'; end if;
  end if;

  if to_regclass('cron.job') is not null then
    execute 'select count(*) from cron.job where active' into v_bad;
    if v_bad<>0 then raise exception 'G7_PRECHECK_ACTIVE_CRON'; end if;
  end if;
end
$precheck$;

select json_build_object(
  'status','PASS',
  'ledger',(select count(*) from supabase_migrations.schema_migrations),
  'crossTenant',0,'crossStore',0,'orphan',0,'invalidMembership',0,
  'activeSaleDuplicate',0,'accountingMismatch',0,'activeCron',0
)::text as g7_precheck;
rollback;
