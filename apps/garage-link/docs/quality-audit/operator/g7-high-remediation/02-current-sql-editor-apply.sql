-- GARAGE LINK DB-007 compatibility + G7 Current single-transaction SQL Editor package
-- Source compatibility migration: supabase/migrations/20260728000050_inventory_count_items_compatibility.sql
-- Source compatibility SHA-256: 782af8feb8db7f54d642de4ab92a180c9834c070ae3e060c8a6d45039fff3325
-- Source G7 migration: supabase/migrations/20260728000100_high_remediation_batch.sql
-- Source G7 SHA-256: 5a24e58c397f585055fbe52242b8e45cc58dea1dcd9882e8ce81e00d93434166
-- Manifest entries: 49; manifest SHA-256: c0e3ec5101cb35df4af3de80944c372ae975ebedc917f3699a32e46b7e14869f
-- Snapshot fingerprint: 5d6d849a914b614668afb9579aabe01ae7753ccc3b0e968a26cff3cc175d8a60
-- Backup directory: /Users/ksk/garage-link-backups/pre-g7-20260728-104502
-- Backup SHA256SUMS.txt SHA-256: 8379a36438609c2d73e39e650b23c8c14f9a1a5d06d81368c8163520893c869f
-- Generated at: 2026-07-28T11:50:47 JST
-- Run once in GARAGE LINK Current Supabase Dashboard SQL Editor.
-- No psql meta-commands or external communication. Any exception rolls back both migrations and both ledger rows.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $g7_identity$
DECLARE
  v_signature_count integer;
  v_compatibility_applied boolean;
  v_column_count integer;
  v_type text;
  v_nullable text;
  v_default text;
  v_generated text;
  v_schema_contract text;
BEGIN
  IF current_database() <> 'postgres' THEN RAISE EXCEPTION 'G7_IDENTITY_DATABASE'; END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'G7_IDENTITY_LEDGER_MISSING'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'public.stores','public.memberships','public.vehicle_sale_claims',
      'public.invoice_payment_ledger','public.sale_correction_cases',
      'public.inventory_counts','public.inventory_count_items','public.repair_parts','public.stripe_webhook_events'
    ]) AS required_relation(name) WHERE to_regclass(name) IS NULL
  ) THEN RAISE EXCEPTION 'G7_IDENTITY_REQUIRED_RELATION_MISSING'; END IF;
  SELECT
      (CASE WHEN coalesce(obj_description(to_regclass('public.stores')), '') LIKE 'GARAGE LINK%' THEN 1 ELSE 0 END)
    + (CASE WHEN coalesce(obj_description(to_regclass('public.invoices')), '') LIKE 'GARAGE LINK%' THEN 1 ELSE 0 END)
    + (CASE WHEN coalesce(obj_description(to_regclass('public.audit_logs')), '') LIKE 'GARAGE LINK%' THEN 1 ELSE 0 END)
    INTO v_signature_count;
  IF v_signature_count <> 3 THEN RAISE EXCEPTION 'G7_IDENTITY_GARAGE_SIGNATURE'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260727000300') <> 1 THEN RAISE EXCEPTION 'G7_PRECHECK_PREDECESSOR_MISSING'; END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260728000100') THEN RAISE EXCEPTION 'G7_PRECHECK_ALREADY_APPLIED'; END IF;

  v_compatibility_applied := EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260728000050');
  SELECT count(*) INTO v_column_count FROM information_schema.columns
   WHERE table_schema='public' AND table_name='inventory_count_items' AND column_name IN('deleted_at','is_archived');
  IF v_compatibility_applied THEN
    IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 49 THEN RAISE EXCEPTION 'DB007_PRECHECK_LEDGER_DRIFT'; END IF;
    IF v_column_count <> 2 THEN RAISE EXCEPTION 'DB007_LEDGER_WITHOUT_COLUMNS'; END IF;
  ELSE
    IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 48 THEN RAISE EXCEPTION 'DB007_PRECHECK_LEDGER_DRIFT'; END IF;
    IF v_column_count <> 0 THEN RAISE EXCEPTION 'DB007_COLUMNS_WITHOUT_LEDGER'; END IF;
  END IF;

  IF v_column_count = 2 THEN
    SELECT data_type,is_nullable,column_default,is_generated INTO v_type,v_nullable,v_default,v_generated
      FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_count_items' AND column_name='deleted_at';
    IF v_type<>'timestamp with time zone' OR v_nullable<>'YES' OR v_default IS NOT NULL OR v_generated<>'NEVER' THEN RAISE EXCEPTION 'DB007_DELETED_AT_CONTRACT_MISMATCH'; END IF;
    SELECT data_type,is_nullable,column_default,is_generated INTO v_type,v_nullable,v_default,v_generated
      FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_count_items' AND column_name='is_archived';
    IF v_type<>'boolean' OR v_nullable<>'YES' OR coalesce(v_default,'')<>'false' OR v_generated<>'NEVER' THEN RAISE EXCEPTION 'DB007_IS_ARCHIVED_CONTRACT_MISMATCH'; END IF;
  END IF;

  SELECT encode(extensions.digest(string_agg(format('%s.%s:%s:%s:%s:%s',table_schema,table_name,column_name,data_type,is_nullable,coalesce(column_default,'')),E'\n' ORDER BY table_schema,table_name,ordinal_position),'sha256'),'hex')
    INTO v_schema_contract
  FROM information_schema.columns
  WHERE table_schema='public' AND NOT (table_name='inventory_count_items' AND column_name IN('deleted_at','is_archived'));
  IF v_schema_contract <> '00b70f113fea65db2ea6bc97db253f2021f804ff7277bccc03864f0b92e1681d' THEN RAISE EXCEPTION 'G7_PRECHECK_APP_SCHEMA_FINGERPRINT_DRIFT'; END IF;
END
$g7_identity$;

DO $g7_precheck$
DECLARE
  v_bad bigint;
  check_row record;
BEGIN
  IF EXISTS(SELECT 1 FROM public.stores WHERE tenant_id IS NULL) THEN RAISE EXCEPTION 'G7_PRECHECK_STORE_TENANT_NULL'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.memberships m
    LEFT JOIN auth.users u ON u.id=m.user_id
    LEFT JOIN public.tenants t ON t.id=m.tenant_id
    LEFT JOIN public.stores s ON s.id=m.store_id
    WHERE m.status='active' AND (
      m.deleted_at IS NOT NULL OR m.disabled_at IS NOT NULL OR m.joined_at IS NULL
      OR u.id IS NULL OR t.id IS NULL OR t.status<>'active' OR s.id IS NULL
      OR NOT public.store_is_authorization_eligible(s.status)
      OR s.tenant_id IS DISTINCT FROM m.tenant_id
      OR m.role NOT IN('owner','admin','implementer','staff','viewer')
    )
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_INVALID_MEMBERSHIP'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.memberships
    WHERE status='active' AND deleted_at IS NULL AND disabled_at IS NULL
    GROUP BY tenant_id,user_id HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_DUPLICATE_ACTIVE_MEMBERSHIP'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.company_subscriptions cs
    JOIN public.stores s ON s.id=cs.company_id
    WHERE cs.tenant_id IS DISTINCT FROM s.tenant_id
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_SUBSCRIPTION_SCOPE'; END IF;

  FOR check_row IN
    SELECT n.nspname schema_name,c.relname table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p')
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='store_id' AND NOT a.attisdropped)
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format(
      'select count(*) from %I.%I x join public.stores s on s.id=x.store_id where x.tenant_id is not null and x.tenant_id<>s.tenant_id',
      check_row.schema_name,check_row.table_name
    ) INTO v_bad;
    IF v_bad<>0 THEN RAISE EXCEPTION 'G7_PRECHECK_CROSS_TENANT:%:%',check_row.table_name,v_bad; END IF;
  END LOOP;

  IF EXISTS(SELECT 1 FROM public.deals d LEFT JOIN public.vehicles v ON v.id=d.vehicle_id WHERE d.vehicle_id IS NOT NULL AND (v.id IS NULL OR v.store_id<>d.store_id)) THEN RAISE EXCEPTION 'G7_PRECHECK_DEAL_VEHICLE_SCOPE'; END IF;
  IF EXISTS(SELECT 1 FROM public.deals d LEFT JOIN public.customers c ON c.id=d.customer_id WHERE d.customer_id IS NOT NULL AND (c.id IS NULL OR c.store_id<>d.store_id)) THEN RAISE EXCEPTION 'G7_PRECHECK_DEAL_CUSTOMER_SCOPE'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoices i LEFT JOIN public.deals d ON d.id=i.deal_id WHERE i.deal_id IS NOT NULL AND (d.id IS NULL OR d.store_id<>i.store_id)) THEN RAISE EXCEPTION 'G7_PRECHECK_INVOICE_DEAL_SCOPE'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.vehicle_sale_claims c
    LEFT JOIN public.vehicles v ON v.id=c.vehicle_id
    LEFT JOIN public.deals d ON d.id=c.deal_id
    LEFT JOIN public.stores s ON s.id=c.store_id
    WHERE v.id IS NULL OR d.id IS NULL OR s.id IS NULL OR v.store_id<>c.store_id OR d.store_id<>c.store_id OR s.tenant_id IS DISTINCT FROM c.tenant_id
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_CLAIM_SCOPE_OR_ORPHAN'; END IF;
  IF EXISTS(SELECT 1 FROM public.vehicle_sale_claims WHERE status='active' GROUP BY vehicle_id HAVING count(*)>1) THEN RAISE EXCEPTION 'G7_PRECHECK_DUPLICATE_ACTIVE_SALE'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.membership_store_assignments a
    JOIN public.memberships m ON m.id=a.membership_id
    JOIN public.stores s ON s.id=a.store_id
    WHERE a.deleted_at IS NULL AND (a.tenant_id<>m.tenant_id OR a.tenant_id<>s.tenant_id)
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_ASSIGNMENT_SCOPE'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_active_store_preferences p JOIN public.stores s ON s.id=p.active_store_id WHERE p.tenant_id<>s.tenant_id) THEN RAISE EXCEPTION 'G7_PRECHECK_PREFERENCE_SCOPE'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.invoice_payment_ledger l
    LEFT JOIN public.invoices i ON i.id=l.invoice_id
    LEFT JOIN public.stores s ON s.id=l.store_id
    WHERE i.id IS NULL OR s.id IS NULL OR i.store_id<>l.store_id OR s.tenant_id IS DISTINCT FROM l.tenant_id
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_PAYMENT_ORPHAN_SCOPE'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.invoice_payment_ledger l
    LEFT JOIN public.invoice_payment_ledger p ON p.id=l.original_payment_id
    WHERE l.entry_type IN('refund','reversal') AND (p.id IS NULL OR p.entry_type<>'payment' OR p.invoice_id<>l.invoice_id)
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_REVERSAL_ORPHAN'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.invoice_payment_ledger p
    WHERE p.entry_type='payment' AND (
      SELECT coalesce(sum(r.amount),0) FROM public.invoice_payment_ledger r
      WHERE r.original_payment_id=p.id AND r.entry_type IN('refund','reversal')
    )>p.amount
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_REFUND_EXCEEDS_PAYMENT'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT coalesce(sum(CASE WHEN l.entry_type='payment' THEN l.amount ELSE -l.amount END),0)::integer net
      FROM public.invoice_payment_ledger l WHERE l.invoice_id=i.id
    ) x ON true
    WHERE coalesce(i.paid_amount,0)<>x.net OR x.net<0 OR x.net>i.total_amount
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_INVOICE_PAYMENT_MISMATCH'; END IF;
  IF EXISTS(SELECT 1 FROM public.uploaded_files WHERE tenant_id IS NULL) THEN RAISE EXCEPTION 'G7_PRECHECK_UPLOAD_TENANT_NULL'; END IF;
  IF EXISTS(SELECT 1 FROM public.uploaded_files WHERE path NOT LIKE ('tenants/'||tenant_id::text||'/stores/'||store_id::text||'/%')) THEN RAISE EXCEPTION 'G7_PRECHECK_UPLOAD_PATH_SCOPE'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_counts WHERE status='in_progress' AND deleted_at IS NULL GROUP BY store_id HAVING count(*)>1) THEN RAISE EXCEPTION 'G7_PRECHECK_DUPLICATE_ACTIVE_INVENTORY'; END IF;
  IF EXISTS(SELECT 1 FROM public.repair_parts WHERE stock<0) THEN RAISE EXCEPTION 'G7_PRECHECK_NEGATIVE_INVENTORY'; END IF;
  IF EXISTS(SELECT 1 FROM public.stripe_webhook_events GROUP BY stripe_event_id HAVING count(*)>1) THEN RAISE EXCEPTION 'G7_PRECHECK_DUPLICATE_WEBHOOK'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.company_subscriptions
    WHERE included_staff_count<0 OR extra_staff_count<0 OR included_store_count<0 OR extra_store_count<0
      OR storage_limit_mb<0 OR extra_storage_gb<0 OR current_inventory_limit<0
  ) THEN RAISE EXCEPTION 'G7_PRECHECK_INVALID_QUOTA_STATE'; END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'select count(*) from cron.job where active' INTO v_bad;
    IF v_bad<>0 THEN RAISE EXCEPTION 'G7_PRECHECK_ACTIVE_CRON'; END IF;
  END IF;
END
$g7_precheck$;

CREATE TEMP TABLE g7_before_table_fingerprints(
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  row_digest text NOT NULL,
  column_names text[] NOT NULL
) ON COMMIT DROP;

DO $g7_capture_before$
DECLARE
  r record;
  v_count bigint;
  v_digest text;
  v_columns text[];
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'select count(*),md5(coalesce(string_agg(row_hash,'''' order by row_hash),'''')) from (select md5(to_jsonb(g7_row)::text) row_hash from public.%I g7_row) q',
      r.relname
    ) INTO v_count,v_digest;
    SELECT array_agg(a.attname ORDER BY a.attnum) INTO v_columns
    FROM pg_attribute a
    WHERE a.attrelid=to_regclass('public.'||r.relname) AND a.attnum>0 AND NOT a.attisdropped;
    INSERT INTO g7_before_table_fingerprints VALUES(r.relname,v_count,v_digest,v_columns);
  END LOOP;
END
$g7_capture_before$;

-- BEGIN compatibility migration (body is exact)
-- GARAGE LINK DB-007 / G7 inventory_count_items compatibility.
-- Forward-only expand migration. No existing business row is updated.

do $contract_precheck$
declare
  v_type text;
  v_nullable text;
  v_default text;
  v_generated text;
begin
  if to_regclass('public.inventory_count_items') is null then
    raise exception 'DB007_INVENTORY_COUNT_ITEMS_MISSING';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='deleted_at'
  ) then
    select data_type, is_nullable, column_default, is_generated
      into v_type, v_nullable, v_default, v_generated
    from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='deleted_at';
    if v_type <> 'timestamp with time zone' or v_nullable <> 'YES'
       or v_default is not null or v_generated <> 'NEVER' then
      raise exception 'DB007_DELETED_AT_CONTRACT_MISMATCH';
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='is_archived'
  ) then
    select data_type, is_nullable, column_default, is_generated
      into v_type, v_nullable, v_default, v_generated
    from information_schema.columns
    where table_schema='public' and table_name='inventory_count_items' and column_name='is_archived';
    if v_type <> 'boolean' or v_nullable <> 'YES'
       or coalesce(v_default,'') <> 'false'
       or v_generated <> 'NEVER' then
      raise exception 'DB007_IS_ARCHIVED_CONTRACT_MISMATCH';
    end if;
  end if;
end
$contract_precheck$;

alter table public.inventory_count_items
  add column if not exists deleted_at timestamptz,
  add column if not exists is_archived boolean default false;

create index if not exists idx_inventory_count_items_store_deleted_at
  on public.inventory_count_items(store_id, deleted_at);
create index if not exists idx_inventory_count_items_store_is_archived
  on public.inventory_count_items(store_id, is_archived);

do $contract_postcheck$
declare
  v_deleted_type text;
  v_deleted_nullable text;
  v_deleted_default text;
  v_deleted_generated text;
  v_archived_type text;
  v_archived_nullable text;
  v_archived_default text;
  v_archived_generated text;
begin
  select data_type, is_nullable, column_default, is_generated
    into v_deleted_type, v_deleted_nullable, v_deleted_default, v_deleted_generated
  from information_schema.columns
  where table_schema='public' and table_name='inventory_count_items' and column_name='deleted_at';

  select c.data_type, c.is_nullable, pg_get_expr(d.adbin,d.adrelid), c.is_generated
    into v_archived_type, v_archived_nullable, v_archived_default, v_archived_generated
  from information_schema.columns c
  join pg_class t on t.relname=c.table_name
  join pg_namespace n on n.oid=t.relnamespace and n.nspname=c.table_schema
  join pg_attribute a on a.attrelid=t.oid and a.attname=c.column_name and not a.attisdropped
  left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
  where c.table_schema='public' and c.table_name='inventory_count_items' and c.column_name='is_archived';

  if v_deleted_type <> 'timestamp with time zone' or v_deleted_nullable <> 'YES'
     or v_deleted_default is not null or v_deleted_generated <> 'NEVER' then
    raise exception 'DB007_DELETED_AT_POSTCHECK_FAILED';
  end if;
  if v_archived_type <> 'boolean' or v_archived_nullable <> 'YES'
     or coalesce(v_archived_default,'') <> 'false' or v_archived_generated <> 'NEVER' then
    raise exception 'DB007_IS_ARCHIVED_POSTCHECK_FAILED';
  end if;
  if to_regclass('public.idx_inventory_count_items_store_deleted_at') is null
     or to_regclass('public.idx_inventory_count_items_store_is_archived') is null then
    raise exception 'DB007_INDEX_POSTCHECK_FAILED';
  end if;
  if exists(select 1 from public.inventory_count_items where is_archived is distinct from false) then
    raise exception 'DB007_EXISTING_ROW_ARCHIVE_STATE_AMBIGUOUS';
  end if;
end
$contract_postcheck$;
-- END compatibility migration

INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
SELECT '20260728000050', ARRAY['../migrations/20260728000050_inventory_count_items_compatibility.sql']::text[], 'inventory_count_items_compatibility'
WHERE NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260728000050');

-- BEGIN source migration (body is exact)
-- GARAGE LINK G7: unresolved High remediation batch
-- Forward-only expand migration. Existing applied migrations are intentionally unchanged.

-- ---------------------------------------------------------------------------
-- AUTH-002 / BILL-001: canonical membership only and serialized tenant quotas.
-- ---------------------------------------------------------------------------
create or replace function public.garage_plan_limit_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store_id uuid;
  v_tenant_id uuid;
  v_subscription public.company_subscriptions%rowtype;
  v_store_ids uuid[];
  v_count bigint;
  v_limit bigint;
  v_used_bytes bigint;
begin
  if tg_table_name = 'stores' then
    v_store_id := new.id;
    v_tenant_id := new.tenant_id;
  elsif tg_table_name = 'memberships' then
    v_store_id := new.store_id;
    v_tenant_id := new.tenant_id;
  else
    v_store_id := new.store_id;
    v_tenant_id := null;
  end if;

  if v_tenant_id is null then
    select tenant_id into v_tenant_id from public.stores where id = v_store_id;
  end if;
  if v_tenant_id is null then
    raise exception using errcode = '23514', message = 'tenant scope is required';
  end if;

  -- Serializes count-and-create for every resource in one tenant.
  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 714001));

  select coalesce(array_agg(id), array[]::uuid[]) into v_store_ids
  from public.stores where tenant_id = v_tenant_id;

  select * into v_subscription
  from public.company_subscriptions
  where tenant_id = v_tenant_id and status = 'active'
  order by updated_at desc nulls last limit 1
  for share;
  if not found then
    v_subscription.plan := 'free';
    v_subscription.included_staff_count := 1;
    v_subscription.extra_staff_count := 0;
    v_subscription.included_store_count := 1;
    v_subscription.extra_store_count := 0;
    v_subscription.storage_limit_mb := 500;
    v_subscription.extra_storage_gb := 0;
    v_subscription.current_inventory_limit := 5;
  end if;

  if tg_table_name = 'vehicles' then
    if new.deleted_at is null and coalesce(new.is_archived, false) = false
       and lower(coalesce(new.status, '')) not in ('売却済み','納車済み','sold','delivered','archived','deleted') then
      select count(*) into v_count from public.vehicles v
      where v.store_id = any(v_store_ids) and v.id is distinct from new.id
        and v.deleted_at is null and coalesce(v.is_archived, false) = false
        and lower(coalesce(v.status, '')) not in ('売却済み','納車済み','sold','delivered','archived','deleted');
      if v_count >= v_subscription.current_inventory_limit then
        raise exception using errcode = 'P0001', message = '契約全店舗の在庫登録上限に達しています。';
      end if;
    end if;
  elsif tg_table_name in ('quotes','invoices') and v_subscription.plan in ('free','starter') then
    v_limit := case v_subscription.plan when 'starter' then 20 else 5 end;
    select (select count(*) from public.quotes q where q.store_id=any(v_store_ids) and q.created_at>=date_trunc('month',now()))
         + (select count(*) from public.invoices i where i.store_id=any(v_store_ids) and i.created_at>=date_trunc('month',now()))
      into v_count;
    if v_count >= v_limit then raise exception using errcode='P0001', message='契約全店舗の今月の帳票作成上限に達しています。'; end if;
  elsif tg_table_name = 'uploaded_files' then
    v_limit := (v_subscription.storage_limit_mb + v_subscription.extra_storage_gb*1024)::bigint*1024*1024;
    select coalesce(sum(size_bytes),0) into v_used_bytes from public.uploaded_files where tenant_id=v_tenant_id and deleted_at is null;
    if v_used_bytes + new.size_bytes > v_limit then raise exception using errcode='P0001', message='契約全店舗のストレージ上限に達しています。'; end if;
  elsif tg_table_name = 'memberships' then
    if new.status = 'active' and new.deleted_at is null then
      v_limit := v_subscription.included_staff_count + v_subscription.extra_staff_count;
      select count(distinct m.user_id) into v_count from public.memberships m
      where m.tenant_id=v_tenant_id and m.id is distinct from new.id and m.status='active'
        and m.deleted_at is null and m.disabled_at is null and m.user_id is not null;
      if v_count >= v_limit then raise exception using errcode='P0001', message='契約全店舗のスタッフ上限に達しています。'; end if;
    end if;
  elsif tg_table_name = 'stores' then
    v_limit := v_subscription.included_store_count + v_subscription.extra_store_count;
    select count(*) into v_count from public.stores s where s.tenant_id=v_tenant_id and s.id is distinct from new.id;
    if v_count >= v_limit then raise exception using errcode='P0001', message='契約の店舗上限に達しています。'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_staff_plan_limit on public.store_members;
drop trigger if exists guard_membership_plan_limit on public.memberships;
create trigger guard_membership_plan_limit before insert or update of status, deleted_at, disabled_at on public.memberships
for each row execute function public.garage_plan_limit_guard();

-- Store creation is limited to create_store_for_current_user/create_garage_store.
-- Remove every legacy permissive INSERT policy so policy OR-composition cannot
-- bypass tenant scope or the serialized plan guard.
revoke insert on public.stores from anon,authenticated;
drop policy if exists "stores_insert_authenticated" on public.stores;
drop policy if exists g1b_stores_insert_admin on public.stores;

-- ---------------------------------------------------------------------------
-- BILL-002: metadata is server-only and path/scope are database constrained.
-- ---------------------------------------------------------------------------
alter table public.uploaded_files alter column tenant_id set not null;
alter table public.uploaded_files drop constraint if exists uploaded_files_path_scope_check;
alter table public.uploaded_files add constraint uploaded_files_path_scope_check check (
  path like ('tenants/' || tenant_id::text || '/stores/' || store_id::text || '/%')
);
revoke insert, update, delete on public.uploaded_files from anon, authenticated;
drop policy if exists g1b_insert_role on public.uploaded_files;
drop policy if exists g1b_update_role on public.uploaded_files;
drop policy if exists "uploaded_files_insert_own_store" on public.uploaded_files;
drop policy if exists "uploaded_files_update_own_store" on public.uploaded_files;

-- ---------------------------------------------------------------------------
-- PII-001: deleted/archived rows are hidden from normal roles at RLS level.
-- Owner/admin retain trash access through the same tenant/store boundary.
-- ---------------------------------------------------------------------------
do $pii$
declare v_table text;
begin
  foreach v_table in array array['customers','deals','vehicles','maintenance_jobs','quotes','invoices','inventory_counts','uploaded_files'] loop
    if to_regclass('public.'||v_table) is null then continue; end if;
    execute format('drop policy if exists g7_soft_delete_visibility on public.%I',v_table);
    if exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||v_table) and attname='is_archived' and not attisdropped) then
      execute format('create policy g7_soft_delete_visibility on public.%I as restrictive for select to authenticated using ((deleted_at is null and coalesce(is_archived,false)=false) or public.current_user_can_admin_store(store_id))',v_table);
    else
      execute format('create policy g7_soft_delete_visibility on public.%I as restrictive for select to authenticated using ((deleted_at is null) or public.current_user_can_admin_store(store_id))',v_table);
    end if;
  end loop;
end;
$pii$;

-- ---------------------------------------------------------------------------
-- SERVICE-001: one atomic, idempotent cancellation restores adjusted parts only.
-- ---------------------------------------------------------------------------
alter table public.repair_part_stock_movements add column if not exists operation_key text;
create unique index if not exists repair_part_stock_movements_operation_uidx
  on public.repair_part_stock_movements(store_id, operation_key, part_id)
  where operation_key is not null;

create or replace function public.guard_maintenance_cancel_transition()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled'
     and current_setting('garage.maintenance_cancel_rpc',true) is distinct from 'on' then
    raise exception using errcode='42501', message='整備取消は専用処理を使用してください。';
  end if;
  return new;
end $$;
drop trigger if exists guard_maintenance_cancel_transition on public.maintenance_jobs;
create trigger guard_maintenance_cancel_transition before update of status on public.maintenance_jobs
for each row execute function public.guard_maintenance_cancel_transition();

create or replace function public.cancel_maintenance_job(
  p_job_id uuid, p_reason text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.maintenance_jobs%rowtype; v_part record; v_actor uuid:=auth.uid(); v_role text; v_restored int:=0;
begin
  if v_actor is null then raise exception using errcode='28000', message='ログインが必要です。'; end if;
  if nullif(btrim(p_reason),'') is null or nullif(btrim(p_idempotency_key),'') is null then raise exception using errcode='22023', message='理由と操作IDが必要です。'; end if;
  select * into v_job from public.maintenance_jobs where id=p_job_id for update;
  if not found then raise exception using errcode='P0002', message='整備案件が見つかりません。'; end if;
  v_role:=public.current_user_store_role(v_job.store_id);
  if v_role is null or v_role not in ('owner','admin') then raise exception using errcode='42501', message='整備取消の権限がありません。'; end if;
  if v_job.status='cancelled' then return jsonb_build_object('ok',true,'already_cancelled',true,'job_id',p_job_id); end if;
  if v_job.status='delivered' then raise exception using errcode='23514', message='納車済み整備は取消できません。'; end if;
  for v_part in select * from public.maintenance_job_parts where job_id=p_job_id and store_id=v_job.store_id and stock_adjusted=true and part_id is not null for update loop
    update public.repair_parts set stock=stock+v_part.quantity, updated_at=now() where id=v_part.part_id and store_id=v_job.store_id;
    if not found then raise exception using errcode='23503', message='復元対象部品が見つかりません。'; end if;
    insert into public.repair_part_stock_movements(store_id,part_id,delta,source_type,source_id,reason,created_by,operation_key)
      values(v_job.store_id,v_part.part_id,v_part.quantity,'maintenance_job',p_job_id,'整備取消による在庫復元',v_actor,p_idempotency_key);
    update public.maintenance_job_parts set stock_adjusted=false,stock_adjusted_at=now() where id=v_part.id;
    v_restored:=v_restored+1;
  end loop;
  perform set_config('garage.maintenance_cancel_rpc','on',true);
  update public.maintenance_jobs set status='cancelled',cancelled_at=coalesce(cancelled_at,now()) where id=p_job_id;
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,metadata)
    values(v_job.store_id,v_actor,v_role,'update','maintenance_job',p_job_id,jsonb_build_object('event','cancelled','reason',left(btrim(p_reason),500),'restored_part_count',v_restored,'operation_key_hash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex')));
  return jsonb_build_object('ok',true,'job_id',p_job_id,'restored_part_count',v_restored);
exception when unique_violation then
  return jsonb_build_object('ok',true,'already_cancelled',true,'job_id',p_job_id);
end $$;
revoke all on function public.cancel_maintenance_job(uuid,text,text) from public,anon;
grant execute on function public.cancel_maintenance_job(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- INVENTORY-001: atomic snapshot creation and controlled finalization.
-- ---------------------------------------------------------------------------
alter table public.inventory_counts add column if not exists snapshot_at timestamptz;
alter table public.inventory_counts add column if not exists idempotency_key text;
alter table public.inventory_counts drop constraint if exists inventory_counts_status_g7_check;
alter table public.inventory_counts add constraint inventory_counts_status_g7_check check(status in ('draft','in_progress','completed','cancelled'));
create unique index if not exists inventory_counts_store_operation_uidx on public.inventory_counts(store_id,idempotency_key) where idempotency_key is not null;
create unique index if not exists inventory_counts_one_active_store_uidx on public.inventory_counts(store_id) where status='in_progress' and deleted_at is null;
create unique index if not exists inventory_count_items_vehicle_uidx on public.inventory_count_items(inventory_count_id,vehicle_id) where vehicle_id is not null and deleted_at is null;
create unique index if not exists inventory_count_items_part_uidx on public.inventory_count_items(inventory_count_id,part_sku) where part_sku is not null and deleted_at is null;

-- Snapshot identity and quantities are immutable after creation. Operators may
-- only record the observed quantity/check metadata on an existing snapshot row.
create or replace function public.guard_inventory_count_item_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_count_status text;
begin
  if tg_op='UPDATE' and (
    new.store_id is distinct from old.store_id or
    new.inventory_count_id is distinct from old.inventory_count_id or
    new.item_type is distinct from old.item_type or
    new.vehicle_id is distinct from old.vehicle_id or
    new.part_sku is distinct from old.part_sku or
    new.system_quantity is distinct from old.system_quantity or
    new.management_no is distinct from old.management_no or
    new.item_name is distinct from old.item_name or
    new.location_name is distinct from old.location_name or
    new.deleted_at is distinct from old.deleted_at or
    new.is_archived is distinct from old.is_archived
  ) then
    raise exception using errcode='42501',message='棚卸しsnapshotの識別子と帳簿数量は変更できません。';
  end if;
  select status into v_count_status from public.inventory_counts where id=new.inventory_count_id;
  if v_count_status is distinct from 'in_progress' then
    raise exception using errcode='42501',message='進行中ではない棚卸しsnapshotは変更できません。';
  end if;
  new.difference_quantity:=case when new.actual_quantity is null then null else new.actual_quantity-new.system_quantity end;
  new.check_status:=case when new.actual_quantity is null then 'unchecked' else 'checked' end;
  new.checked_at:=case when new.actual_quantity is null then null else coalesce(new.checked_at,clock_timestamp()) end;
  return new;
end $$;
drop trigger if exists guard_inventory_count_item_snapshot on public.inventory_count_items;
create trigger guard_inventory_count_item_snapshot before insert or update on public.inventory_count_items
for each row execute function public.guard_inventory_count_item_snapshot();

-- Snapshot rows can only be created by create_inventory_count. Soft-delete and
-- direct DELETE would change the population being counted, so both are denied.
revoke insert,delete on public.inventory_counts from authenticated;
revoke insert,delete on public.inventory_count_items from authenticated;
drop policy if exists g1b_insert_role on public.inventory_counts;
drop policy if exists g1b_delete_role on public.inventory_counts;
drop policy if exists g1b_insert_role on public.inventory_count_items;
drop policy if exists g1b_delete_role on public.inventory_count_items;
drop policy if exists "inventory_counts_insert_own_store" on public.inventory_counts;
drop policy if exists "inventory_counts_delete_own_store" on public.inventory_counts;
drop policy if exists "inventory_count_items_insert_own_store" on public.inventory_count_items;
drop policy if exists "inventory_count_items_delete_own_store" on public.inventory_count_items;
-- Keep table privileges for stable PostgREST denial semantics; with no
-- INSERT/DELETE policy, RLS still rejects every authenticated row.
grant insert,delete on public.inventory_counts to authenticated;
grant insert,delete on public.inventory_count_items to authenticated;

create or replace function public.guard_inventory_terminal_transition()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status in ('completed','cancelled') and old.status is distinct from new.status
     and current_setting('garage.inventory_rpc',true) is distinct from 'on' then
    raise exception using errcode='42501', message='棚卸しの確定・取消は専用処理を使用してください。';
  end if;
  return new;
end $$;
drop trigger if exists guard_inventory_terminal_transition on public.inventory_counts;
create trigger guard_inventory_terminal_transition before update of status on public.inventory_counts
for each row execute function public.guard_inventory_terminal_transition();

create or replace function public.create_inventory_count(
  p_store_id uuid,p_count jsonb,p_items jsonb,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role text; v_id uuid; v_item jsonb; v_system numeric;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  v_role:=public.current_user_store_role(p_store_id);
  if v_role is null or v_role not in ('owner','admin','staff') then raise exception using errcode='42501',message='棚卸しを作成する権限がありません。'; end if;
  if nullif(btrim(p_idempotency_key),'') is null or nullif(btrim(p_count->>'count_no'),'') is null or nullif(btrim(p_count->>'name'),'') is null then raise exception using errcode='22023',message='棚卸し番号・名称・操作IDが必要です。'; end if;
  select id into v_id from public.inventory_counts where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('ok',true,'inventory_count_id',v_id,'already_created',true); end if;
  insert into public.inventory_counts(store_id,count_no,name,count_type,count_category,status,scheduled_date,target_inventory,target_vehicle_statuses,target_part_categories,target_condition_memo,target_locations,shelf_area,location_memo,check_method,device_type,barcode_usage,unread_handling,approval_status,internal_memo,caution_note,snapshot_at,started_at,idempotency_key,difference_count,unchecked_count,adjustment_target_count)
  values(p_store_id,btrim(p_count->>'count_no'),btrim(p_count->>'name'),coalesce(p_count->>'count_type','vehicle'),coalesce(p_count->>'count_category','regular'),'in_progress',nullif(p_count->>'scheduled_date','')::date,coalesce(p_count->>'target_inventory','vehicles'),coalesce(array(select jsonb_array_elements_text(coalesce(p_count->'target_vehicle_statuses','[]'::jsonb))),array[]::text[]),coalesce(array(select jsonb_array_elements_text(coalesce(p_count->'target_part_categories','[]'::jsonb))),array[]::text[]),nullif(p_count->>'target_condition_memo',''),coalesce(array(select jsonb_array_elements_text(coalesce(p_count->'target_locations','[]'::jsonb))),array[]::text[]),nullif(p_count->>'shelf_area',''),nullif(p_count->>'location_memo',''),coalesce(p_count->>'check_method','visual'),coalesce(p_count->>'device_type','none'),coalesce(p_count->>'barcode_usage','none'),coalesce(p_count->>'unread_handling','keep_unchecked'),'not_requested',nullif(p_count->>'internal_memo',''),nullif(p_count->>'caution_note',''),clock_timestamp(),clock_timestamp(),p_idempotency_key,0,0,0) returning id into v_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if nullif(v_item->>'vehicle_id','') is not null then
      select 1 into v_system from public.vehicles where id=(v_item->>'vehicle_id')::uuid and store_id=p_store_id and deleted_at is null and coalesce(is_archived,false)=false;
      if not found then raise exception using errcode='23503',message='棚卸し対象車両が店舗scopeにありません。'; end if;
    elsif nullif(v_item->>'part_sku','') is not null then
      select stock into v_system from public.repair_parts where store_id=p_store_id and part_no=v_item->>'part_sku' and deleted_at is null;
      if not found then raise exception using errcode='23503',message='棚卸し対象部品が店舗scopeにありません。'; end if;
    else
      raise exception using errcode='22023',message='車両または部品識別子が必要です。';
    end if;
    insert into public.inventory_count_items(store_id,inventory_count_id,item_type,vehicle_id,part_sku,management_no,item_name,location_name,system_quantity,actual_quantity,difference_quantity,check_status,memo)
    values(p_store_id,v_id,coalesce(v_item->>'item_type','vehicle'),nullif(v_item->>'vehicle_id','')::uuid,nullif(v_item->>'part_sku',''),nullif(v_item->>'management_no',''),nullif(v_item->>'item_name',''),nullif(v_item->>'location_name',''),v_system,nullif(v_item->>'actual_quantity','')::numeric,case when nullif(v_item->>'actual_quantity','') is null then null else nullif(v_item->>'actual_quantity','')::numeric-v_system end,case when nullif(v_item->>'actual_quantity','') is null then 'unchecked' else 'checked' end,nullif(v_item->>'memo',''));
  end loop;
  update public.inventory_counts c set unchecked_count=(select count(*) from public.inventory_count_items i where i.inventory_count_id=c.id and i.check_status='unchecked' and i.deleted_at is null),difference_count=(select count(*) from public.inventory_count_items i where i.inventory_count_id=c.id and coalesce(i.difference_quantity,0)<>0 and i.deleted_at is null),adjustment_target_count=(select count(*) from public.inventory_count_items i where i.inventory_count_id=c.id and coalesce(i.difference_quantity,0)<>0 and i.deleted_at is null) where c.id=v_id;
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,metadata) values(p_store_id,v_actor,v_role,'create','inventory_count',v_id,jsonb_build_object('snapshot_at',clock_timestamp(),'operation_key_hash',encode(extensions.digest(p_idempotency_key,'sha256'),'hex')));
  return jsonb_build_object('ok',true,'inventory_count_id',v_id,'already_created',false);
exception when unique_violation then
  select id into v_id from public.inventory_counts where store_id=p_store_id and idempotency_key=p_idempotency_key;
  if v_id is not null then return jsonb_build_object('ok',true,'inventory_count_id',v_id,'already_created',true); end if;
  raise;
end $$;

create or replace function public.finalize_inventory_count(p_inventory_count_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count public.inventory_counts%rowtype; v_role text; v_unchecked bigint; v_diff bigint;
begin
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if not found then raise exception using errcode='P0002',message='棚卸しが見つかりません。'; end if;
  v_role:=public.current_user_store_role(v_count.store_id);
  if v_role is null or v_role not in ('owner','admin') then raise exception using errcode='42501',message='棚卸しを確定する権限がありません。'; end if;
  if v_count.status='completed' then return jsonb_build_object('ok',true,'already_completed',true,'inventory_count_id',v_count.id); end if;
  if v_count.status<>'in_progress' then raise exception using errcode='23514',message='確定できない棚卸し状態です。'; end if;
  select count(*) filter(where check_status='unchecked' or actual_quantity is null),count(*) filter(where coalesce(difference_quantity,0)<>0) into v_unchecked,v_diff from public.inventory_count_items where inventory_count_id=v_count.id and deleted_at is null;
  if v_unchecked>0 then raise exception using errcode='23514',message='未確認明細が残っています。'; end if;
  perform set_config('garage.inventory_rpc','on',true);
  update public.inventory_counts set status='completed',completed_at=clock_timestamp(),difference_count=v_diff,unchecked_count=0,adjustment_target_count=v_diff,approval_status='approved',approved_at=clock_timestamp() where id=v_count.id;
  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,metadata) values(v_count.store_id,auth.uid(),v_role,'update','inventory_count',v_count.id,jsonb_build_object('event','completed','difference_count',v_diff,'operation_key_hash',encode(extensions.digest(coalesce(p_idempotency_key,''),'sha256'),'hex')));
  return jsonb_build_object('ok',true,'inventory_count_id',v_count.id,'difference_count',v_diff);
end $$;
revoke all on function public.create_inventory_count(uuid,jsonb,jsonb,text) from public,anon;
revoke all on function public.finalize_inventory_count(uuid,text) from public,anon;
grant execute on function public.create_inventory_count(uuid,jsonb,jsonb,text) to authenticated;
grant execute on function public.finalize_inventory_count(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- STRIPE-001/002: ordered event application and durable reconciliation ledger.
-- ---------------------------------------------------------------------------
alter table public.stripe_webhook_events add column if not exists stripe_created bigint;
alter table public.stripe_webhook_events add column if not exists object_id text;
alter table public.company_subscriptions add column if not exists last_stripe_event_created bigint;
alter table public.company_subscriptions add column if not exists last_stripe_event_id text;
alter table public.plan_change_requests add column if not exists stripe_session_id text;
create unique index if not exists plan_change_requests_stripe_session_uidx
  on public.plan_change_requests(stripe_session_id);

create table if not exists public.billing_sync_operations(
  id uuid primary key default extensions.gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,actor_user_id uuid,operation_type text not null,idempotency_key text not null,
  requested_plan text,status text not null check(status in ('started','stripe_applied','completed','reconciliation_required','failed')),
  error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key),foreign key(company_id,tenant_id) references public.stores(id,tenant_id)
);
alter table public.billing_sync_operations enable row level security;
revoke all on public.billing_sync_operations from anon,authenticated;
grant all on public.billing_sync_operations to service_role;
drop trigger if exists set_billing_sync_operations_updated_at on public.billing_sync_operations;
create trigger set_billing_sync_operations_updated_at before update on public.billing_sync_operations for each row execute function public.set_updated_at();

create or replace function public.apply_ordered_stripe_subscription_event(
 p_company_id uuid,p_plan text,p_status text,p_customer_id text,p_subscription_id text,p_event_id text,p_event_created bigint
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_tenant uuid; v_row public.company_subscriptions%rowtype; v_staff int; v_stores int; v_storage int; v_inventory int; v_link boolean;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then raise exception using errcode='42501',message='service role required'; end if;
  if p_event_created is null or nullif(p_event_id,'') is null then raise exception using errcode='22023',message='Stripe event version is required'; end if;
  select tenant_id into v_tenant from public.stores where id=p_company_id;
  if v_tenant is null then raise exception using errcode='23503',message='subscription store scope not found'; end if;
  select * into v_row from public.company_subscriptions where tenant_id=v_tenant and status in ('active','trialing','past_due','suspended','cancelled') order by updated_at desc limit 1 for update;
  if found and (v_row.last_stripe_event_created>p_event_created or (v_row.last_stripe_event_created=p_event_created and coalesce(v_row.last_stripe_event_id,'')>=p_event_id)) then
    return jsonb_build_object('ok',true,'applied',false,'reason','superseded');
  end if;
  if p_plan='starter' then v_staff:=1;v_stores:=1;v_storage:=2048;v_inventory:=50;v_link:=false;
  elsif p_plan='standard' then v_staff:=3;v_stores:=1;v_storage:=10240;v_inventory:=200;v_link:=true;
  elsif p_plan='pro' then v_staff:=10;v_stores:=3;v_storage:=51200;v_inventory:=500;v_link:=true;
  else raise exception using errcode='22023',message='invalid plan'; end if;
  if found then
    update public.company_subscriptions set plan=p_plan,status=p_status,included_staff_count=v_staff,included_store_count=v_stores,storage_limit_mb=v_storage,current_inventory_limit=v_inventory,l_link_integration_enabled=v_link,stripe_customer_id=coalesce(p_customer_id,stripe_customer_id),stripe_subscription_id=coalesce(p_subscription_id,stripe_subscription_id),last_stripe_event_created=p_event_created,last_stripe_event_id=p_event_id where id=v_row.id;
  else
    insert into public.company_subscriptions(company_id,tenant_id,plan,status,included_staff_count,included_store_count,storage_limit_mb,current_inventory_limit,l_link_integration_enabled,stripe_customer_id,stripe_subscription_id,last_stripe_event_created,last_stripe_event_id)
    values(p_company_id,v_tenant,p_plan,p_status,v_staff,v_stores,v_storage,v_inventory,v_link,p_customer_id,p_subscription_id,p_event_created,p_event_id);
  end if;
  return jsonb_build_object('ok',true,'applied',true,'tenant_id',v_tenant);
end $$;
revoke all on function public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint) to service_role;

-- ---------------------------------------------------------------------------
-- AUTH-002: legacy table remains compatibility-read only; no authorization RPC writes it.
-- ---------------------------------------------------------------------------
revoke insert,update,delete on public.store_members from anon,authenticated;

create or replace function public.accept_membership_invite(p_membership_id uuid,p_invite_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_email text;v_row public.memberships%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  select lower(email) into v_email from auth.users where id=v_actor;
  select * into v_row from public.memberships where id=p_membership_id for update;
  if not found then raise exception using errcode='P0002',message='招待が見つかりません。'; end if;
  if v_row.invite_token_hash is distinct from encode(extensions.digest(coalesce(p_invite_token,''),'sha256'),'hex') then raise exception using errcode='42501',message='招待を承認できません。'; end if;
  if v_row.status='active' and v_row.user_id=v_actor then return jsonb_build_object('ok',true,'membership_id',v_row.id,'already_accepted',true); end if;
  if v_row.status<>'invited' or v_row.invite_cancelled_at is not null or v_row.invite_expires_at<=now() then raise exception using errcode='P0002',message='招待は無効または期限切れです。'; end if;
  if v_email is null or v_email<>lower(btrim(v_row.email)) then raise exception using errcode='42501',message='招待対象本人だけが承認できます。'; end if;
  if not exists(select 1 from public.stores s join public.tenants t on t.id=s.tenant_id where s.id=v_row.store_id and s.tenant_id=v_row.tenant_id and public.store_is_authorization_eligible(s.status) and t.status='active') then raise exception using errcode='42501',message='招待先を利用できません。'; end if;
  if exists(select 1 from public.memberships m where m.tenant_id=v_row.tenant_id and m.user_id=v_actor and m.status='active' and m.deleted_at is null and m.id<>v_row.id) then raise exception using errcode='23505',message='既に有効なmembershipがあります。'; end if;
  update public.memberships set user_id=v_actor,status='active',joined_at=coalesce(joined_at,now()),invite_accepted_at=now(),disabled_at=null,updated_by=v_actor where id=v_row.id;
  insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by,deleted_at)
    values(v_row.id,v_row.tenant_id,v_row.store_id,v_actor,null)
    on conflict(membership_id,store_id) do update set deleted_at=null,updated_at=now();
  return jsonb_build_object('ok',true,'membership_id',v_row.id,'already_accepted',false);
end $$;

create or replace function public.change_membership_role(p_membership_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_actor_role text;v_target public.memberships%rowtype;v_owner_count bigint;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  if p_role not in ('owner','admin','implementer','staff','viewer') then raise exception using errcode='22023',message='roleが不正です。'; end if;
  select * into v_target from public.memberships where id=p_membership_id for update;
  if not found or v_target.status<>'active' or v_target.disabled_at is not null or v_target.deleted_at is not null then raise exception using errcode='P0002',message='有効なmembershipが見つかりません。'; end if;
  perform 1 from public.tenants where id=v_target.tenant_id for update;
  v_actor_role:=public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role='owner' then null;
  elsif v_actor_role='admin' and v_target.role in ('staff','viewer') and p_role in ('staff','viewer') then null;
  else raise exception using errcode='42501',message='roleを変更する権限がありません。'; end if;
  if v_target.user_id=v_actor and v_actor_role<>'owner' and p_role<>v_target.role then raise exception using errcode='42501',message='自分自身のroleを変更できません。'; end if;
  if v_target.role='owner' and p_role<>'owner' then
    select count(*) into v_owner_count from public.memberships where tenant_id=v_target.tenant_id and role='owner' and status='active' and disabled_at is null and deleted_at is null;
    if v_owner_count<=1 then raise exception using errcode='23514',message='最後のownerは降格できません。'; end if;
  end if;
  update public.memberships set role=p_role,updated_by=v_actor where id=v_target.id;
  return jsonb_build_object('ok',true,'membership_id',v_target.id,'role',p_role);
end $$;

create or replace function public.deactivate_membership(p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_actor_role text;v_target public.memberships%rowtype;v_owner_count bigint;
begin
  if v_actor is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  select * into v_target from public.memberships where id=p_membership_id for update;
  if not found or v_target.status<>'active' or v_target.disabled_at is not null or v_target.deleted_at is not null then raise exception using errcode='P0002',message='有効なmembershipが見つかりません。'; end if;
  perform 1 from public.tenants where id=v_target.tenant_id for update;
  v_actor_role:=public.current_user_role_for_tenant(v_target.tenant_id);
  if v_actor_role='owner' then null;
  elsif v_actor_role='admin' and v_target.role in ('staff','viewer') then null;
  else raise exception using errcode='42501',message='membershipを無効化する権限がありません。'; end if;
  if v_target.role='owner' then
    select count(*) into v_owner_count from public.memberships where tenant_id=v_target.tenant_id and role='owner' and status='active' and disabled_at is null and deleted_at is null;
    if v_owner_count<=1 then raise exception using errcode='23514',message='最後のownerは無効化できません。'; end if;
  end if;
  update public.memberships set status='inactive',disabled_at=now(),updated_by=v_actor where id=v_target.id;
  return jsonb_build_object('ok',true,'membership_id',v_target.id);
end $$;

revoke all on function public.accept_membership_invite(uuid,text) from public,anon;
revoke all on function public.change_membership_role(uuid,text) from public,anon;
revoke all on function public.deactivate_membership(uuid) from public,anon;
grant execute on function public.accept_membership_invite(uuid,text) to authenticated;
grant execute on function public.change_membership_role(uuid,text) to authenticated;
grant execute on function public.deactivate_membership(uuid) to authenticated;

-- Signup writes only canonical membership state. The legacy table is retained
-- as a read-only compatibility artifact and is never populated by new flows.
create or replace function public.create_store_for_current_user(store_name text,owner_display_name text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=auth.uid();v_tenant_id uuid;v_store_id uuid;v_membership_id uuid;v_email text;
begin
  if v_user_id is null then raise exception using errcode='28000',message='ログインが必要です。'; end if;
  if exists(select 1 from public.memberships m where m.user_id=v_user_id and m.deleted_at is null) then raise exception using errcode='23505',message='既に所属が登録されています。'; end if;
  if nullif(btrim(store_name),'') is null then raise exception using errcode='22023',message='店舗名を入力してください。'; end if;
  select lower(email) into v_email from auth.users where id=v_user_id;
  insert into public.tenants(name,status,plan_code,created_by,updated_by) values(btrim(store_name),'active','free',v_user_id,v_user_id) returning id into v_tenant_id;
  insert into public.stores(name,company_name,email,plan_code,status,tenant_id,created_by,updated_by) values(btrim(store_name),btrim(store_name),v_email,'free','active',v_tenant_id,v_user_id,v_user_id) returning id into v_store_id;
  insert into public.memberships(tenant_id,store_id,user_id,email,role,status,display_name,joined_at,invite_accepted_at,created_by,updated_by)
    values(v_tenant_id,v_store_id,v_user_id,v_email,'owner','active',nullif(btrim(owner_display_name),''),now(),now(),v_user_id,v_user_id)
    returning id into v_membership_id;
  insert into public.membership_store_assignments(membership_id,tenant_id,store_id,created_by) values(v_membership_id,v_tenant_id,v_store_id,v_user_id);
  insert into public.company_subscriptions(company_id,tenant_id,plan,status,included_staff_count,extra_staff_count,included_store_count,extra_store_count,storage_limit_mb,extra_storage_gb,current_inventory_limit,l_link_integration_enabled)
    values(v_store_id,v_tenant_id,'free','active',1,0,1,0,500,0,5,false);
  return v_store_id;
end $$;
revoke all on function public.create_store_for_current_user(text,text) from public,anon;
grant execute on function public.create_store_for_current_user(text,text) to authenticated;

-- No EXECUTE is granted to anon. Existing G1-A invite/role RPC grants remain least privilege.
-- END source migration

INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES('20260728000100',ARRAY['../migrations/20260728000100_high_remediation_batch.sql']::text[],'high_remediation_batch');

DO $g7_postcheck$
DECLARE
  v_bad bigint;
  v_count bigint;
  v_digest text;
  r record;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>50 THEN RAISE EXCEPTION 'G7_POSTCHECK_LEDGER_COUNT'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000050')<>1 THEN RAISE EXCEPTION 'DB007_POSTCHECK_VERSION_COUNT'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000050')<>1 THEN RAISE EXCEPTION 'DB007_POSTCHECK_VERSION_COUNT'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000050')<>1 THEN RAISE EXCEPTION 'DB007_POSTCHECK_VERSION_COUNT'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000100')<>1 THEN RAISE EXCEPTION 'G7_POSTCHECK_VERSION_COUNT'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20260728000050'
      AND statements=ARRAY['../migrations/20260728000050_inventory_count_items_compatibility.sql']::text[]
      AND name='inventory_count_items_compatibility'
  ) THEN RAISE EXCEPTION 'DB007_POSTCHECK_LEDGER_PAYLOAD'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20260728000050'
      AND statements=ARRAY['../migrations/20260728000050_inventory_count_items_compatibility.sql']::text[]
      AND name='inventory_count_items_compatibility'
  ) THEN RAISE EXCEPTION 'DB007_POSTCHECK_LEDGER_PAYLOAD'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20260728000050'
      AND statements=ARRAY['../migrations/20260728000050_inventory_count_items_compatibility.sql']::text[]
      AND name='inventory_count_items_compatibility'
  ) THEN RAISE EXCEPTION 'DB007_POSTCHECK_LEDGER_PAYLOAD'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20260728000100'
      AND statements=ARRAY['../migrations/20260728000100_high_remediation_batch.sql']::text[]
      AND name='high_remediation_batch'
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_LEDGER_PAYLOAD'; END IF;

  IF to_regclass('public.billing_sync_operations') IS NULL THEN RAISE EXCEPTION 'G7_POSTCHECK_BILLING_SYNC_TABLE'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='billing_sync_operations' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_BILLING_SYNC_RLS'; END IF;
  IF EXISTS(SELECT 1 FROM public.billing_sync_operations) THEN RAISE EXCEPTION 'G7_POSTCHECK_UNEXPECTED_BACKFILL'; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('repair_part_stock_movements','operation_key'),
      ('inventory_counts','snapshot_at'),('inventory_counts','idempotency_key'),
      ('stripe_webhook_events','stripe_created'),('stripe_webhook_events','object_id'),
      ('company_subscriptions','last_stripe_event_created'),('company_subscriptions','last_stripe_event_id'),
      ('plan_change_requests','stripe_session_id')
    ) expected(table_name,column_name)
    WHERE NOT EXISTS(
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid=to_regclass('public.'||expected.table_name)
        AND a.attname=expected.column_name AND NOT a.attisdropped
    )
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_COLUMN_MISSING'; END IF;

  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.uploaded_files'::regclass AND conname='uploaded_files_path_scope_check') THEN RAISE EXCEPTION 'G7_POSTCHECK_UPLOAD_CHECK'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_counts'::regclass AND conname='inventory_counts_status_g7_check') THEN RAISE EXCEPTION 'G7_POSTCHECK_INVENTORY_CHECK'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.billing_sync_operations'::regclass AND contype='p') THEN RAISE EXCEPTION 'G7_POSTCHECK_BILLING_PRIMARY_KEY'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.billing_sync_operations'::regclass AND contype='f')<>2 THEN RAISE EXCEPTION 'G7_POSTCHECK_BILLING_FOREIGN_KEYS'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.billing_sync_operations'::regclass AND contype='u') THEN RAISE EXCEPTION 'G7_POSTCHECK_BILLING_IDEMPOTENCY_UNIQUE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='inventory_counts_one_active_store_uidx') THEN RAISE EXCEPTION 'G7_POSTCHECK_INVENTORY_UNIQUE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='repair_part_stock_movements_operation_uidx') THEN RAISE EXCEPTION 'G7_POSTCHECK_SERVICE_UNIQUE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='plan_change_requests_stripe_session_uidx') THEN RAISE EXCEPTION 'G7_POSTCHECK_STRIPE_SESSION_UNIQUE'; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('public.garage_plan_limit_guard()'),
      ('public.guard_maintenance_cancel_transition()'),
      ('public.cancel_maintenance_job(uuid,text,text)'),
      ('public.guard_inventory_count_item_snapshot()'),
      ('public.guard_inventory_terminal_transition()'),
      ('public.create_inventory_count(uuid,jsonb,jsonb,text)'),
      ('public.finalize_inventory_count(uuid,text)'),
      ('public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint)'),
      ('public.accept_membership_invite(uuid,text)'),
      ('public.change_membership_role(uuid,text)'),
      ('public.deactivate_membership(uuid)'),
      ('public.create_store_for_current_user(text,text)')
    ) expected(signature)
    WHERE to_regprocedure(expected.signature) IS NULL
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_RPC_FUNCTION_MISSING'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN(
        'garage_plan_limit_guard','guard_maintenance_cancel_transition','cancel_maintenance_job',
        'guard_inventory_count_item_snapshot','guard_inventory_terminal_transition',
        'create_inventory_count','finalize_inventory_count','apply_ordered_stripe_subscription_event',
        'accept_membership_invite','change_membership_role','deactivate_membership','create_store_for_current_user'
      )
      AND pg_get_userbyid(p.proowner)<>'postgres'
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_FUNCTION_OWNER'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN(
        'garage_plan_limit_guard','guard_maintenance_cancel_transition','cancel_maintenance_job',
        'guard_inventory_count_item_snapshot','guard_inventory_terminal_transition',
        'create_inventory_count','finalize_inventory_count','apply_ordered_stripe_subscription_event',
        'accept_membership_invite','change_membership_role','deactivate_membership','create_store_for_current_user'
      )
      AND NOT ('search_path=public, pg_temp'=ANY(coalesce(p.proconfig,ARRAY[]::text[])))
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_FUNCTION_SEARCH_PATH'; END IF;

  IF has_table_privilege('authenticated','public.stores','INSERT')
     OR has_table_privilege('authenticated','public.uploaded_files','INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.store_members','INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','public.billing_sync_operations','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'G7_POSTCHECK_DIRECT_WRITE_GRANT'; END IF;
  IF has_function_privilege('anon','public.cancel_maintenance_job(uuid,text,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.cancel_maintenance_job(uuid,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.apply_ordered_stripe_subscription_event(uuid,text,text,text,text,text,bigint)','EXECUTE')
  THEN RAISE EXCEPTION 'G7_POSTCHECK_EXECUTE_GRANT'; END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='g7_soft_delete_visibility' AND permissive='RESTRICTIVE')<>8 THEN RAISE EXCEPTION 'G7_POSTCHECK_PII_POLICIES'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND policyname='g7_soft_delete_visibility'
      AND (coalesce(qual,'') NOT LIKE '%deleted_at IS NULL%' OR coalesce(qual,'') NOT LIKE '%current_user_can_admin_store%')
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_PII_POLICY_SHAPE'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN(
        'current_user_role_for_tenant','current_user_store_role','current_user_can_write_store',
        'current_user_can_admin_store','current_user_store_ids','current_user_tenant_ids',
        'list_accessible_garage_stores','get_garage_ui_context_v2','switch_active_garage_store',
        'accept_membership_invite','change_membership_role','deactivate_membership','create_store_for_current_user'
      )
      AND pg_get_functiondef(p.oid) ~* '\mstore_members\M'
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_LEGACY_MEMBERSHIP_FALLBACK'; END IF;

  IF EXISTS(SELECT 1 FROM public.repair_parts WHERE stock<0) THEN RAISE EXCEPTION 'G7_POSTCHECK_NEGATIVE_INVENTORY'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_counts WHERE status='in_progress' AND deleted_at IS NULL GROUP BY store_id HAVING count(*)>1) THEN RAISE EXCEPTION 'G7_POSTCHECK_DUPLICATE_ACTIVE_INVENTORY'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.company_subscriptions
    WHERE included_staff_count<0 OR extra_staff_count<0 OR included_store_count<0 OR extra_store_count<0
      OR storage_limit_mb<0 OR extra_storage_gb<0 OR current_inventory_limit<0
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_INVALID_QUOTA_STATE'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.company_subscriptions
    WHERE (last_stripe_event_created IS NULL)<>(last_stripe_event_id IS NULL)
       OR coalesce(last_stripe_event_created,0)<0
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_INVALID_STRIPE_EVENT_ORDER'; END IF;
  IF EXISTS(SELECT 1 FROM public.stripe_webhook_events GROUP BY stripe_event_id HAVING count(*)>1) THEN RAISE EXCEPTION 'G7_POSTCHECK_DUPLICATE_WEBHOOK'; END IF;

  IF EXISTS(SELECT 1 FROM public.repair_part_stock_movements WHERE operation_key IS NOT NULL)
     OR EXISTS(SELECT 1 FROM public.inventory_counts WHERE snapshot_at IS NOT NULL OR idempotency_key IS NOT NULL)
     OR EXISTS(SELECT 1 FROM public.stripe_webhook_events WHERE stripe_created IS NOT NULL OR object_id IS NOT NULL)
     OR EXISTS(SELECT 1 FROM public.company_subscriptions WHERE last_stripe_event_created IS NOT NULL OR last_stripe_event_id IS NOT NULL)
     OR EXISTS(SELECT 1 FROM public.plan_change_requests WHERE stripe_session_id IS NOT NULL)
  THEN RAISE EXCEPTION 'G7_POSTCHECK_UNEXPECTED_BACKFILL'; END IF;

  FOR r IN SELECT * FROM g7_before_table_fingerprints ORDER BY table_name LOOP
    EXECUTE format(
      'select count(*),md5(coalesce(string_agg(row_hash,'''' order by row_hash),'''')) from (select md5((select jsonb_object_agg(e.key,e.value) from jsonb_each(to_jsonb(g7_row)) e where e.key=any($1))::text) row_hash from public.%I g7_row) q',
      r.table_name
    ) INTO v_count,v_digest USING r.column_names;
    IF v_count<>r.row_count OR v_digest<>r.row_digest THEN
      RAISE EXCEPTION 'G7_POSTCHECK_BUSINESS_DATA_CHANGED:%',r.table_name;
    END IF;
  END LOOP;

  FOR r IN
    SELECT n.nspname schema_name,c.relname table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN('r','p')
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='store_id' AND NOT a.attisdropped)
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format(
      'select count(*) from %I.%I x join public.stores s on s.id=x.store_id where x.tenant_id is not null and x.tenant_id<>s.tenant_id',
      r.schema_name,r.table_name
    ) INTO v_bad;
    IF v_bad<>0 THEN RAISE EXCEPTION 'G7_POSTCHECK_CROSS_TENANT:%:%',r.table_name,v_bad; END IF;
  END LOOP;

  IF EXISTS(SELECT 1 FROM public.deals d LEFT JOIN public.vehicles v ON v.id=d.vehicle_id WHERE d.vehicle_id IS NOT NULL AND (v.id IS NULL OR v.store_id<>d.store_id)) THEN RAISE EXCEPTION 'G7_POSTCHECK_DEAL_VEHICLE_SCOPE'; END IF;
  IF EXISTS(SELECT 1 FROM public.deals d LEFT JOIN public.customers c ON c.id=d.customer_id WHERE d.customer_id IS NOT NULL AND (c.id IS NULL OR c.store_id<>d.store_id)) THEN RAISE EXCEPTION 'G7_POSTCHECK_DEAL_CUSTOMER_SCOPE'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoices i LEFT JOIN public.deals d ON d.id=i.deal_id WHERE i.deal_id IS NOT NULL AND (d.id IS NULL OR d.store_id<>i.store_id)) THEN RAISE EXCEPTION 'G7_POSTCHECK_INVOICE_DEAL_SCOPE'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.invoice_payment_ledger l
    LEFT JOIN public.invoices i ON i.id=l.invoice_id
    LEFT JOIN public.stores s ON s.id=l.store_id
    WHERE i.id IS NULL OR s.id IS NULL OR i.store_id<>l.store_id OR s.tenant_id IS DISTINCT FROM l.tenant_id
  ) THEN RAISE EXCEPTION 'G7_POSTCHECK_PAYMENT_ORPHAN_SCOPE'; END IF;
END
$g7_postcheck$;

SELECT jsonb_build_object(
  'status','PASS',
  'migrationVersion','20260728000100',
  'ledger',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'rlsTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND c.relrowsecurity),
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
  'g7Policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='g7_soft_delete_visibility'),
  'unexpectedBackfill',0,
  'unexpectedBusinessDataChanges',0,
  'negativeInventory',0,
  'duplicateActiveInventory',0,
  'crossTenant',0,
  'crossStore',0,
  'orphan',0
) AS g7_current_result;

COMMIT;
