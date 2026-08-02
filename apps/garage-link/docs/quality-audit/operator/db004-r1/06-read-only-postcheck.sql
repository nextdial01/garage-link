-- DB-004 R1 read-only postcheck。4 apply SQLの完了後に実行する。
begin transaction read only;
set local statement_timeout = '120s';

with expected(store_fp,owner_fp,recovery_key_fp) as (
  values
    ('2c127637ea1c','4a0360984dc0','079dd4c23908'),
    ('b7c22a4ee049','a7350f6f0933','06c3f3c874c3'),
    ('eb2bcbf525ea','dc5e4dbb6ea5','dbe342055dc9'),
    ('c4ff77ffe6b2','e9d226b2af53','eecf0a3ad617')
), result as (
  select e.*,s.id store_id,s.tenant_id,
    left(encode(extensions.digest(s.tenant_id::text,'sha256'),'hex'),12) tenant_fp,
    (select count(*) from public.tenants t where t.id=s.tenant_id and t.status='active') tenant_count,
    (select count(*) from public.memberships m where m.tenant_id=s.tenant_id and m.store_id=s.id
      and m.role='owner' and m.status='active' and m.joined_at is not null
      and left(encode(extensions.digest(m.user_id::text,'sha256'),'hex'),12)=e.owner_fp) active_owner_count,
    (select count(*) from public.company_subscriptions cs where cs.company_id=s.id and cs.tenant_id=s.tenant_id) subscription_count,
    (select count(*) from public.audit_logs a where a.action='db004_independent_tenant_recovery'
      and a.target_id=s.tenant_id
      and a.metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf'
      and a.metadata->>'storeFingerprint'=e.store_fp
      and a.metadata->>'ownerFingerprint'=e.owner_fp
      and a.metadata->>'recoveryKeyFingerprint'=e.recovery_key_fp) audit_count
  from expected e left join public.stores s
    on left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)=e.store_fp
)
select store_fp,owner_fp,recovery_key_fp,tenant_fp,
  case when store_id is not null and tenant_id is not null and tenant_count=1
    and active_owner_count=1 and subscription_count=1 and audit_count=1 then 'PASS' else 'FAIL' end result,
  tenant_count,active_owner_count,subscription_count,audit_count
from result order by store_fp;

do $db004_postcheck$
declare
  c_correlation constant text := '820a4de6-15fe-43ae-9779-a87e79998ddf';
  v record;
  v_store_id uuid;
  v_tenant_id uuid;
  v_count bigint;
  v_bad bigint;
  v_relation record;
begin
  if (select count(*) from supabase_migrations.schema_migrations)<>39 then raise exception 'DB004_LEDGER_CHANGED'; end if;
  if exists (
    select 1 from public.stores s
    where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)
      in ('2c127637ea1c','b7c22a4ee049','eb2bcbf525ea','c4ff77ffe6b2')
      and s.status not in ('active', 'trial')
  ) then
    raise exception 'DB005_STORE_NOT_AUTHORIZATION_ELIGIBLE';
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity)<>103 then raise exception 'DB004_RLS_CATALOG_CHANGED'; end if;
  if (select count(*) from pg_policies where schemaname='public')<>364 then raise exception 'DB004_POLICY_CATALOG_CHANGED'; end if;
  if (select count(*) from public.stores where tenant_id is null)<>0 then raise exception 'DB004_STORE_TENANT_NULL_REMAINS'; end if;
  if (select count(*) from public.audit_logs where action='db004_independent_tenant_recovery' and metadata->>'correlationId'=c_correlation)<>4 then
    raise exception 'DB004_AUDIT_TOTAL_NOT_4';
  end if;
  if (select count(distinct target_id) from public.audit_logs where action='db004_independent_tenant_recovery' and metadata->>'correlationId'=c_correlation)<>4 then
    raise exception 'DB004_TENANT_TOTAL_NOT_4';
  end if;

  for v in select * from (values
    ('2c127637ea1c','4a0360984dc0','079dd4c23908'),
    ('b7c22a4ee049','a7350f6f0933','06c3f3c874c3'),
    ('eb2bcbf525ea','dc5e4dbb6ea5','dbe342055dc9'),
    ('c4ff77ffe6b2','e9d226b2af53','eecf0a3ad617')
  ) x(store_fp,owner_fp,recovery_key_fp)
  loop
    select s.id,s.tenant_id into strict v_store_id,v_tenant_id from public.stores s
      where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)=v.store_fp;
    if v_tenant_id is null then raise exception 'DB004_TENANT_NULL:%',v.store_fp; end if;
    if (select count(*) from public.tenants where id=v_tenant_id and status='active')<>1 then raise exception 'DB004_TENANT_INVALID:%',v.store_fp; end if;
    if (select count(*) from public.stores where tenant_id=v_tenant_id)<>1 then raise exception 'DB004_TENANT_NOT_ONE_TO_ONE:%',v.store_fp; end if;
    if (select count(*) from public.memberships m where m.tenant_id=v_tenant_id and m.store_id=v_store_id
       and m.role='owner' and m.status='active' and m.joined_at is not null
       and left(encode(extensions.digest(m.user_id::text,'sha256'),'hex'),12)=v.owner_fp)<>1 then
      raise exception 'DB004_OWNER_INVALID:%',v.store_fp;
    end if;
    if exists(select 1 from public.memberships m where m.tenant_id=v_tenant_id
      and (m.status<>'active' or m.joined_at is null or m.user_id is null or m.store_id is distinct from v_store_id)) then
      raise exception 'DB004_INVALID_MEMBERSHIP:%',v.store_fp;
    end if;
    if (select count(*) from public.company_subscriptions where company_id=v_store_id and tenant_id=v_tenant_id)<>1 then
      raise exception 'DB004_SUBSCRIPTION_INVALID:%',v.store_fp;
    end if;
    if (select count(*) from public.audit_logs a where a.action='db004_independent_tenant_recovery'
      and a.target_id=v_tenant_id and a.metadata->>'correlationId'=c_correlation
      and a.metadata->>'storeFingerprint'=v.store_fp and a.metadata->>'ownerFingerprint'=v.owner_fp
      and a.metadata->>'recoveryKeyFingerprint'=v.recovery_key_fp)<>1 then
      raise exception 'DB004_AUDIT_INVALID:%',v.store_fp;
    end if;

    for v_relation in
      select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in('r','p')
        and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='store_id' and not a.attisdropped)
        and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
    loop
      execute format('select count(*) from %I.%I x join public.stores s on s.id=x.store_id where x.store_id=$1 and x.tenant_id is not null and x.tenant_id<>s.tenant_id',v_relation.schema_name,v_relation.table_name)
        into v_bad using v_store_id;
      if v_bad<>0 then raise exception 'DB004_CROSS_TENANT:%:%:%',v.store_fp,v_relation.table_name,v_bad; end if;
    end loop;

    for v_relation in
      select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in('r','p')
        and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped)
        and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
    loop
      execute format('select count(*) from %I.%I x join public.stores s on s.id=x.company_id where x.company_id=$1 and x.tenant_id is not null and x.tenant_id<>s.tenant_id',v_relation.schema_name,v_relation.table_name)
        into v_bad using v_store_id;
      if v_bad<>0 then raise exception 'DB004_COMPANY_CROSS_TENANT:%:%:%',v.store_fp,v_relation.table_name,v_bad; end if;
    end loop;

    for v_relation in
      select cn.nspname child_schema,cc.relname child_table,ca.attname child_fk,
             pn.nspname parent_schema,pc.relname parent_table,pa.attname parent_pk
      from pg_constraint fk
      join pg_class cc on cc.oid=fk.conrelid join pg_namespace cn on cn.oid=cc.relnamespace
      join pg_class pc on pc.oid=fk.confrelid join pg_namespace pn on pn.oid=pc.relnamespace
      join pg_attribute ca on ca.attrelid=cc.oid and ca.attnum=fk.conkey[1]
      join pg_attribute pa on pa.attrelid=pc.oid and pa.attnum=fk.confkey[1]
      where fk.contype='f' and array_length(fk.conkey,1)=1 and array_length(fk.confkey,1)=1
        and cn.nspname='public' and pn.nspname='public'
        and exists(select 1 from pg_attribute x where x.attrelid=cc.oid and x.attname='store_id' and not x.attisdropped)
        and exists(select 1 from pg_attribute x where x.attrelid=pc.oid and x.attname='store_id' and not x.attisdropped)
    loop
      execute format('select count(*) from %I.%I c left join %I.%I p on p.%I=c.%I where c.store_id=$1 and c.%I is not null and (p.%I is null or p.store_id<>$1)',
        v_relation.child_schema,v_relation.child_table,v_relation.parent_schema,v_relation.parent_table,
        v_relation.parent_pk,v_relation.child_fk,v_relation.child_fk,v_relation.parent_pk)
        into v_bad using v_store_id;
      if v_bad<>0 then raise exception 'DB004_CROSS_STORE_OR_ORPHAN:%:%:%',v.store_fp,v_relation.child_table,v_bad; end if;
    end loop;
    raise notice 'DB004_POSTCHECK_PASS store=% tenantFingerprint=%',v.store_fp,
      left(encode(extensions.digest(v_tenant_id::text,'sha256'),'hex'),12);
  end loop;
end
$db004_postcheck$;

select
  (select count(*) from public.stores where tenant_id is null) stores_tenant_null,
  (select count(*) from public.audit_logs where action='db004_independent_tenant_recovery' and metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf') recovery_audits,
  (select count(distinct target_id) from public.audit_logs where action='db004_independent_tenant_recovery' and metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf') recovered_tenants,
  (select count(*) from supabase_migrations.schema_migrations) migration_ledger_count,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity) rls_table_count,
  (select count(*) from pg_policies where schemaname='public') policy_count;

rollback;
