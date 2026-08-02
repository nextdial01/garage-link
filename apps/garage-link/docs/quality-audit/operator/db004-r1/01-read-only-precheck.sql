-- DB-004 R1 read-only precheck. 変更は一切行わない。
begin transaction read only;
set local statement_timeout = '120s';

select
  current_database() = 'postgres' as database_name_ok,
  current_setting('server_version_num')::int >= 150000 as postgres_version_ok,
  to_regclass('public.tenants') is not null as tenants_present,
  to_regclass('public.stores') is not null as stores_present,
  to_regclass('public.memberships') is not null as memberships_present,
  to_regclass('public.store_members') is not null as legacy_members_present,
  to_regclass('public.company_subscriptions') is not null as subscriptions_present,
  to_regclass('public.audit_logs') is not null as audit_present,
  to_regprocedure('extensions.digest(text,text)') is not null as digest_present;

with expected(store_fp,owner_fp,legacy_role,expected_status,recovery_key_fp) as (
  values
    ('2c127637ea1c','4a0360984dc0','owner','trial','079dd4c23908'),
    ('b7c22a4ee049','a7350f6f0933','owner','active','06c3f3c874c3'),
    ('eb2bcbf525ea','dc5e4dbb6ea5','owner','active','dbe342055dc9'),
    ('c4ff77ffe6b2','e9d226b2af53','staff','active','eecf0a3ad617')
), resolved as (
  select e.*,s.id store_id,s.status,s.tenant_id,
    (select count(*) from public.store_members sm where sm.store_id=s.id) legacy_member_count,
    (select count(*) from public.store_members sm where sm.store_id=s.id and sm.role=e.legacy_role
       and coalesce(sm.status,'active') in ('active','member')
       and left(encode(extensions.digest(sm.user_id::text,'sha256'),'hex'),12)=e.owner_fp) owner_mapping_count,
    (select count(*) from auth.users au join public.store_members sm on sm.user_id=au.id
       where sm.store_id=s.id and left(encode(extensions.digest(au.id::text,'sha256'),'hex'),12)=e.owner_fp) auth_user_count,
    (select count(*) from public.company_subscriptions cs where cs.company_id=s.id) subscription_count,
    (select count(*) from public.company_subscriptions cs where cs.company_id=s.id and cs.tenant_id is not null) subscription_tenant_count,
    (select count(*) from public.memberships m where m.store_id=s.id) canonical_store_membership_count,
    (select count(*) from public.audit_logs a where a.action='db004_independent_tenant_recovery'
       and a.metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf'
       and a.metadata->>'storeFingerprint'=e.store_fp) recovery_audit_count
  from expected e
  left join public.stores s on left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)=e.store_fp
)
select store_fp,owner_fp,legacy_role,expected_status,recovery_key_fp,
  case when store_id is not null and status=expected_status and tenant_id is null
    and legacy_member_count=1 and owner_mapping_count=1 and auth_user_count=1
    and subscription_count=1 and subscription_tenant_count=0
    and canonical_store_membership_count=0 and recovery_audit_count=0
    then 'PASS' else 'FAIL' end as result,
  (store_id is not null)::int store_found,
  status, (tenant_id is null)::int tenant_is_null,
  legacy_member_count,owner_mapping_count,auth_user_count,subscription_count,
  subscription_tenant_count,canonical_store_membership_count,recovery_audit_count
from resolved order by store_fp;

do $db004_precheck$
declare
  c_correlation constant text := '820a4de6-15fe-43ae-9779-a87e79998ddf';
  v record;
  v_store public.stores%rowtype;
  v_subscription public.company_subscriptions%rowtype;
  v_owner_id uuid;
  v_count bigint;
  v_bad bigint;
  v_relation record;
begin
  if to_regprocedure('extensions.digest(text,text)') is null then raise exception 'DB004_DIGEST_MISSING'; end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> 39 then
    raise exception 'DB004_REMOTE_LEDGER_EXPECTED_39';
  end if;
  if exists (
    select 1 from public.stores s
    where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)
      in ('2c127637ea1c','b7c22a4ee049','eb2bcbf525ea','c4ff77ffe6b2')
      and s.status not in ('active', 'trial')
  ) then
    raise exception 'DB005_STORE_NOT_AUTHORIZATION_ELIGIBLE';
  end if;

  for v in select * from (values
    ('2c127637ea1c','4a0360984dc0','owner','trial'),
    ('b7c22a4ee049','a7350f6f0933','owner','active'),
    ('eb2bcbf525ea','dc5e4dbb6ea5','owner','active'),
    ('c4ff77ffe6b2','e9d226b2af53','staff','active')
  ) x(store_fp,owner_fp,legacy_role,expected_status)
  loop
    select count(*) into v_count from public.stores s
      where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)=v.store_fp;
    if v_count<>1 then raise exception 'DB004_STORE_COUNT:%:%',v.store_fp,v_count; end if;
    select s.* into strict v_store from public.stores s
      where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)=v.store_fp;
    if v_store.status<>v.expected_status or v_store.tenant_id is not null then
      raise exception 'DB004_STORE_STATE:%',v.store_fp;
    end if;
    select count(*) into v_count from public.store_members sm
      where sm.store_id=v_store.id and sm.role=v.legacy_role
        and coalesce(sm.status,'active') in ('active','member')
        and left(encode(extensions.digest(sm.user_id::text,'sha256'),'hex'),12)=v.owner_fp;
    if v_count<>1 or (select count(*) from public.store_members where store_id=v_store.id)<>1 then
      raise exception 'DB004_OWNER_MAPPING:%',v.store_fp;
    end if;
    select sm.user_id into strict v_owner_id from public.store_members sm
      where sm.store_id=v_store.id and sm.role=v.legacy_role
        and coalesce(sm.status,'active') in('active','member')
        and left(encode(extensions.digest(sm.user_id::text,'sha256'),'hex'),12)=v.owner_fp;
    if not exists(select 1 from auth.users where id=v_owner_id) then raise exception 'DB004_AUTH_USER:%',v.store_fp; end if;
    if exists(select 1 from public.memberships where store_id=v_store.id or user_id=v_owner_id) then
      raise exception 'DB004_CANONICAL_RELATION:%',v.store_fp;
    end if;
    if (select count(*) from public.company_subscriptions where company_id=v_store.id)<>1
       or exists(select 1 from public.company_subscriptions where company_id=v_store.id and tenant_id is not null) then
      raise exception 'DB004_SUBSCRIPTION_MAPPING:%',v.store_fp;
    end if;
    select * into strict v_subscription from public.company_subscriptions where company_id=v_store.id;
    if v_store.plan_code is not null and v_subscription.plan is not null and v_store.plan_code<>v_subscription.plan
       and not(v_store.status='trial' and v_store.plan_code='trial' and v_subscription.plan='free') then
      raise exception 'DB004_PLAN_SCOPE_CONFLICT:%',v.store_fp;
    end if;
    if exists(select 1 from public.audit_logs a where a.action='db004_independent_tenant_recovery'
      and a.metadata->>'correlationId'=c_correlation and a.metadata->>'storeFingerprint'=v.store_fp) then
      raise exception 'DB004_CORRELATION_ALREADY_USED:%',v.store_fp;
    end if;

    for v_relation in
      select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in('r','p')
        and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='store_id' and not a.attisdropped)
        and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
    loop
      execute format('select count(*) from %I.%I where store_id=$1 and tenant_id is not null',v_relation.schema_name,v_relation.table_name)
        into v_bad using v_store.id;
      if v_bad<>0 then raise exception 'DB004_TENANT_CHILD:%:%:%',v.store_fp,v_relation.table_name,v_bad; end if;
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
        into v_bad using v_store.id;
      if v_bad<>0 then raise exception 'DB004_CROSS_STORE_OR_ORPHAN:%:%:%',v.store_fp,v_relation.child_table,v_bad; end if;
    end loop;
    raise notice 'DB004_PRECHECK_PASS store=% owner=%',v.store_fp,v.owner_fp;
  end loop;
end
$db004_precheck$;

select
  (select count(*) from supabase_migrations.schema_migrations) as migration_ledger_count,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity) as rls_table_count,
  (select count(*) from pg_policies where schemaname='public') as policy_count,
  (select count(*) from public.audit_logs where action='db004_independent_tenant_recovery'
    and metadata->>'correlationId'='820a4de6-15fe-43ae-9779-a87e79998ddf') as correlation_audit_count;

rollback;
