-- DB-004 R1 / store b7c22a4ee049
-- Supabase SQL Editorでこのファイルだけを単独実行する。
-- 許可変更: tenants +1, stores tenant_id +1, memberships +1,
--             company_subscriptions tenant_id +1, audit_logs +1。

begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $db004_r1$
declare
  c_store_fp constant text := 'b7c22a4ee049';
  c_owner_fp constant text := 'a7350f6f0933';
  c_legacy_role constant text := 'owner';
  c_expected_store_status constant text := 'active';
  c_correlation constant text := '820a4de6-15fe-43ae-9779-a87e79998ddf';
  c_recovery_key_fp constant text := '06c3f3c874c3';
  v_store public.stores%rowtype;
  v_subscription public.company_subscriptions%rowtype;
  v_owner_id uuid;
  v_tenant_id uuid;
  v_existing_tenant_id uuid;
  v_count bigint;
  v_changed bigint;
  v_bad bigint;
  v_relation record;
  v_now timestamptz := clock_timestamp();
begin
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'DB004_PRECHECK_DIGEST_UNAVAILABLE';
  end if;

  select count(*) into v_count
  from public.stores s
  where left(encode(extensions.digest(s.id::text, 'sha256'), 'hex'), 12) = c_store_fp;
  if v_count <> 1 then raise exception 'DB004_STORE_FINGERPRINT_COUNT:%', v_count; end if;

  select s.* into strict v_store
  from public.stores s
  where left(encode(extensions.digest(s.id::text, 'sha256'), 'hex'), 12) = c_store_fp
  for update;
  perform pg_advisory_xact_lock(hashtextextended('db004-r1:' || c_store_fp, 0));

  if v_store.status <> c_expected_store_status then
    raise exception 'DB004_STORE_STATUS_MISMATCH';
  end if;

  select count(*) into v_count
  from public.store_members sm
  where sm.store_id = v_store.id
    and left(encode(extensions.digest(sm.user_id::text, 'sha256'), 'hex'), 12) = c_owner_fp
    and sm.role = c_legacy_role
    and coalesce(sm.status, 'active') in ('active', 'member');
  if v_count <> 1 then raise exception 'DB004_OWNER_MAPPING_COUNT:%', v_count; end if;
  select sm.user_id into strict v_owner_id from public.store_members sm
  where sm.store_id=v_store.id and left(encode(extensions.digest(sm.user_id::text,'sha256'),'hex'),12)=c_owner_fp
    and sm.role=c_legacy_role and coalesce(sm.status,'active') in('active','member');

  select count(*) into v_count from public.store_members where store_id = v_store.id;
  if v_count <> 1 then raise exception 'DB004_OWNER_CANDIDATE_NOT_UNIQUE:%', v_count; end if;
  if not exists (select 1 from auth.users au where au.id = v_owner_id) then
    raise exception 'DB004_AUTH_USER_MISSING';
  end if;

  select count(*) into v_count
  from public.audit_logs a
  where a.action = 'db004_independent_tenant_recovery'
    and a.metadata ->> 'correlationId' = c_correlation
    and a.metadata ->> 'storeFingerprint' = c_store_fp;
  if v_count > 1 then raise exception 'DB004_DUPLICATE_RECOVERY_AUDIT:%', v_count; end if;

  if v_count = 1 then
    select a.target_id into v_existing_tenant_id
    from public.audit_logs a
    where a.action = 'db004_independent_tenant_recovery'
      and a.metadata ->> 'correlationId' = c_correlation
      and a.metadata ->> 'storeFingerprint' = c_store_fp;
    if not exists (
      select 1 from public.audit_logs a
      where a.action = 'db004_independent_tenant_recovery'
        and a.metadata ->> 'correlationId' = c_correlation
        and a.metadata ->> 'storeFingerprint' = c_store_fp
        and a.metadata ->> 'ownerFingerprint' = c_owner_fp
        and a.metadata ->> 'recoveryKeyFingerprint' = c_recovery_key_fp
        and a.target_id = v_existing_tenant_id
    ) then raise exception 'DB004_IDEMPOTENCY_MAPPING_CONFLICT'; end if;
    if v_store.tenant_id is distinct from v_existing_tenant_id
       or not exists (select 1 from public.tenants t where t.id = v_existing_tenant_id and t.status = 'active')
       or (select count(*) from public.memberships m where m.tenant_id = v_existing_tenant_id and m.store_id = v_store.id and m.user_id = v_owner_id and m.role = 'owner' and m.status = 'active') <> 1
       or (select count(*) from public.company_subscriptions cs where cs.company_id = v_store.id and cs.tenant_id = v_existing_tenant_id) <> 1
    then raise exception 'DB004_IDEMPOTENT_STATE_MISMATCH'; end if;
    raise notice 'DB004_ALREADY_COMPLETED store=% tenantFingerprint=%', c_store_fp,
      left(encode(extensions.digest(v_existing_tenant_id::text, 'sha256'), 'hex'), 12);
    return;
  end if;

  if v_store.tenant_id is not null then raise exception 'DB004_STORE_TENANT_ALREADY_SET'; end if;
  if exists (select 1 from public.memberships m where m.store_id = v_store.id or m.user_id = v_owner_id) then
    raise exception 'DB004_CANONICAL_MEMBERSHIP_ALREADY_EXISTS';
  end if;

  select count(*) into v_count from public.company_subscriptions cs where cs.company_id = v_store.id;
  if v_count <> 1 then raise exception 'DB004_SUBSCRIPTION_NOT_UNIQUE:%', v_count; end if;
  select cs.* into strict v_subscription
  from public.company_subscriptions cs where cs.company_id = v_store.id for update;
  if v_subscription.tenant_id is not null then raise exception 'DB004_SUBSCRIPTION_TENANT_ALREADY_SET'; end if;
  if v_store.plan_code is not null and v_subscription.plan is not null and v_store.plan_code <> v_subscription.plan
     and not (v_store.status='trial' and v_store.plan_code='trial' and v_subscription.plan='free') then
    raise exception 'DB004_PLAN_SCOPE_CONFLICT';
  end if;

  for v_relation in
    select n.nspname schema_name, c.relname table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
      and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='store_id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
  loop
    execute format('select count(*) from %I.%I where store_id = $1 and tenant_id is not null', v_relation.schema_name, v_relation.table_name)
      into v_bad using v_store.id;
    if v_bad <> 0 then raise exception 'DB004_TENANT_SCOPED_CHILD_EXISTS:%:%', v_relation.table_name, v_bad; end if;
  end loop;

  for v_relation in
    select n.nspname schema_name, c.relname table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
      and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
      and c.relname <> 'company_subscriptions'
  loop
    execute format('select count(*) from %I.%I where company_id = $1 and tenant_id is not null', v_relation.schema_name, v_relation.table_name)
      into v_bad using v_store.id;
    if v_bad <> 0 then raise exception 'DB004_COMPANY_TENANT_RELATION_EXISTS:%:%', v_relation.table_name, v_bad; end if;
  end loop;

  for v_relation in
    select cn.nspname child_schema, cc.relname child_table, ca.attname child_fk,
           pn.nspname parent_schema, pc.relname parent_table, pa.attname parent_pk
    from pg_constraint fk
    join pg_class cc on cc.oid=fk.conrelid join pg_namespace cn on cn.oid=cc.relnamespace
    join pg_class pc on pc.oid=fk.confrelid join pg_namespace pn on pn.oid=pc.relnamespace
    join pg_attribute ca on ca.attrelid=cc.oid and ca.attnum=fk.conkey[1]
    join pg_attribute pa on pa.attrelid=pc.oid and pa.attnum=fk.confkey[1]
    where fk.contype='f' and array_length(fk.conkey,1)=1 and array_length(fk.confkey,1)=1
      and cn.nspname='public' and pn.nspname='public'
      and exists (select 1 from pg_attribute x where x.attrelid=cc.oid and x.attname='store_id' and not x.attisdropped)
      and exists (select 1 from pg_attribute x where x.attrelid=pc.oid and x.attname='store_id' and not x.attisdropped)
  loop
    execute format('select count(*) from %I.%I c left join %I.%I p on p.%I=c.%I where c.store_id=$1 and c.%I is not null and (p.%I is null or p.store_id<>$1)',
      v_relation.child_schema,v_relation.child_table,v_relation.parent_schema,v_relation.parent_table,
      v_relation.parent_pk,v_relation.child_fk,v_relation.child_fk,v_relation.parent_pk)
      into v_bad using v_store.id;
    if v_bad <> 0 then raise exception 'DB004_CROSS_STORE_OR_ORPHAN:%:%', v_relation.child_table, v_bad; end if;
  end loop;

  v_tenant_id := gen_random_uuid();
  insert into public.tenants(id,name,status,plan_code,created_by,updated_by,created_at,updated_at)
  values(v_tenant_id,'GARAGE LINK recovered tenant ' || c_store_fp,'active',
         coalesce(v_subscription.plan,v_store.plan_code,'free'),v_owner_id,v_owner_id,v_now,v_now);
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'DB004_TENANT_INSERT_COUNT:%', v_changed; end if;

  update public.stores set tenant_id=v_tenant_id where id=v_store.id and tenant_id is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'DB004_STORE_UPDATE_COUNT:%', v_changed; end if;

  insert into public.memberships(tenant_id,store_id,user_id,role,status,joined_at,created_by,updated_by,created_at,updated_at)
  values(v_tenant_id,v_store.id,v_owner_id,'owner','active',v_now,v_owner_id,v_owner_id,v_now,v_now);
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'DB004_MEMBERSHIP_INSERT_COUNT:%', v_changed; end if;

  update public.company_subscriptions set tenant_id=v_tenant_id
  where id=v_subscription.id and company_id=v_store.id and tenant_id is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'DB004_SUBSCRIPTION_UPDATE_COUNT:%', v_changed; end if;

  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata,created_at)
  values(v_store.id,v_owner_id,'owner','db004_independent_tenant_recovery','tenant',v_tenant_id,
    jsonb_build_object('storeTenantWasNull',true,'canonicalMembershipCount',0,'subscriptionTenantWasNull',true),
    jsonb_build_object('tenantFingerprint',left(encode(extensions.digest(v_tenant_id::text,'sha256'),'hex'),12),'canonicalOwnerCount',1,'subscriptionUpdatedCount',1),
    jsonb_build_object('correlationId',c_correlation,'recoveryKeyFingerprint',c_recovery_key_fp,
      'storeFingerprint',c_store_fp,'ownerFingerprint',c_owner_fp,
      'newTenantFingerprint',left(encode(extensions.digest(v_tenant_id::text,'sha256'),'hex'),12),
      'operatorApproved',true,'reason','legacy tenant recovery','businessRowsUpdated',0,
      'assignment','pending_g1d','preference','pending_g1d'),v_now);
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'DB004_AUDIT_INSERT_COUNT:%', v_changed; end if;

  if (select count(*) from public.stores where id=v_store.id and tenant_id=v_tenant_id) <> 1
     or (select count(*) from public.tenants where id=v_tenant_id and status='active') <> 1
     or (select count(*) from public.memberships where tenant_id=v_tenant_id and store_id=v_store.id and user_id=v_owner_id and role='owner' and status='active' and joined_at is not null) <> 1
     or (select count(*) from public.company_subscriptions where id=v_subscription.id and company_id=v_store.id and tenant_id=v_tenant_id) <> 1
     or (select count(*) from public.audit_logs where action='db004_independent_tenant_recovery' and target_id=v_tenant_id and metadata->>'correlationId'=c_correlation and metadata->>'storeFingerprint'=c_store_fp) <> 1
  then raise exception 'DB004_POSTCHECK_FAILED'; end if;

  raise notice 'DB004_COMPLETED store=% tenantFingerprint=%', c_store_fp,
    left(encode(extensions.digest(v_tenant_id::text,'sha256'),'hex'),12);
end
$db004_r1$;

commit;

select
  left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12) as store_fingerprint,
  left(encode(extensions.digest(s.tenant_id::text,'sha256'),'hex'),12) as tenant_fingerprint,
  (select count(*) from public.memberships m where m.tenant_id=s.tenant_id and m.store_id=s.id and m.role='owner' and m.status='active') as active_owner_count,
  (select count(*) from public.company_subscriptions cs where cs.company_id=s.id and cs.tenant_id=s.tenant_id) as subscription_match_count,
  (select count(*) from public.audit_logs a where a.action='db004_independent_tenant_recovery' and a.metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf' and a.metadata->>'storeFingerprint'='b7c22a4ee049') as recovery_audit_count
from public.stores s
where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)='b7c22a4ee049';
