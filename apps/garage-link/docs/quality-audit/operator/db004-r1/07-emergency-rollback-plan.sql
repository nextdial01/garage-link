-- DB-004 R1 emergency rollback plan
-- 通常は実行しない。R1後に正当な操作がなく、9 migrationが未適用で、
-- 別operatorが明示承認した場合だけstore単位で使用する。
-- 初期状態では必ずDB004_ROLLBACK_DISABLEDで停止する。

begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';

do $db004_rollback$
declare
  c_execute constant boolean := false; -- 別operator承認後だけtrueへ変更
  c_store_fp constant text := 'REPLACE_WITH_ONE_APPROVED_STORE_FINGERPRINT';
  c_correlation constant text := '820a4de6-15fe-43ae-9779-a87e79998ddf';
  v_store public.stores%rowtype;
  v_tenant_id uuid;
  v_owner_id uuid;
  v_recovery_at timestamptz;
  v_count bigint;
  v_changed bigint;
  v_bad bigint;
  v_relation record;
begin
  if not c_execute then raise exception 'DB004_ROLLBACK_DISABLED'; end if;
  if c_store_fp not in ('2c127637ea1c','b7c22a4ee049','eb2bcbf525ea','c4ff77ffe6b2') then
    raise exception 'DB004_ROLLBACK_STORE_NOT_APPROVED';
  end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version in
    ('20260726000100','20260726000200','20260726000300','20260726000400','20260726000450',
     '20260726000500','20260727000100','20260727000200','20260727000300')) then
    raise exception 'DB004_ROLLBACK_FORBIDDEN_AFTER_C6';
  end if;

  select count(*) into v_count from public.stores s
    where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)=c_store_fp;
  if v_count<>1 then raise exception 'DB004_ROLLBACK_STORE_COUNT:%',v_count; end if;
  select s.* into strict v_store from public.stores s
    where left(encode(extensions.digest(s.id::text,'sha256'),'hex'),12)=c_store_fp for update;
  perform pg_advisory_xact_lock(hashtextextended('db004-r1:'||c_store_fp,0));

  select count(*) into v_count
  from public.audit_logs a
  where a.action='db004_independent_tenant_recovery'
    and a.metadata->>'correlationId'=c_correlation
    and a.metadata->>'storeFingerprint'=c_store_fp;
  if v_count<>1 then raise exception 'DB004_ROLLBACK_AUDIT_INVALID'; end if;
  select a.target_id,a.user_id,a.created_at into strict v_tenant_id,v_owner_id,v_recovery_at
  from public.audit_logs a
  where a.action='db004_independent_tenant_recovery'
    and a.metadata->>'correlationId'=c_correlation
    and a.metadata->>'storeFingerprint'=c_store_fp;
  if v_tenant_id is null or v_owner_id is null then raise exception 'DB004_ROLLBACK_AUDIT_TARGET_INVALID'; end if;
  if v_store.tenant_id is distinct from v_tenant_id then raise exception 'DB004_ROLLBACK_SCOPE_CHANGED'; end if;
  if (select count(*) from public.stores where tenant_id=v_tenant_id)<>1 then raise exception 'DB004_ROLLBACK_TENANT_SHARED'; end if;
  if (select count(*) from public.memberships where tenant_id=v_tenant_id and store_id=v_store.id and user_id=v_owner_id and role='owner' and status='active')<>1
     or (select count(*) from public.memberships where tenant_id=v_tenant_id)<>1 then raise exception 'DB004_ROLLBACK_MEMBERSHIP_CHANGED'; end if;
  if (select count(*) from public.company_subscriptions where company_id=v_store.id and tenant_id=v_tenant_id)<>1 then raise exception 'DB004_ROLLBACK_SUBSCRIPTION_CHANGED'; end if;
  if exists(select 1 from public.audit_logs where store_id=v_store.id and created_at>v_recovery_at
    and not(action='db004_independent_tenant_recovery' and metadata->>'correlationId'=c_correlation)) then
    raise exception 'DB004_ROLLBACK_POST_RECOVERY_ACTIVITY';
  end if;

  for v_relation in
    select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p') and c.relname not in('stores','memberships','company_subscriptions')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
  loop
    execute format('select count(*) from %I.%I where tenant_id=$1',v_relation.schema_name,v_relation.table_name)
      into v_bad using v_tenant_id;
    if v_bad<>0 then raise exception 'DB004_ROLLBACK_TENANT_IN_USE:%:%',v_relation.table_name,v_bad; end if;
  end loop;

  insert into public.audit_logs(store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata,created_at)
  values(v_store.id,v_owner_id,'owner','db004_independent_tenant_recovery_rollback','tenant',v_tenant_id,
    jsonb_build_object('tenantFingerprint',left(encode(extensions.digest(v_tenant_id::text,'sha256'),'hex'),12),'active',true),
    jsonb_build_object('recoveryDisabled',true),
    jsonb_build_object('correlationId',c_correlation,'storeFingerprint',c_store_fp,
      'reason','operator-approved emergency rollback','originalRecoveryPreserved',true),clock_timestamp());
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'DB004_ROLLBACK_AUDIT_COUNT:%',v_changed; end if;

  delete from public.memberships where tenant_id=v_tenant_id and store_id=v_store.id and user_id=v_owner_id;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'DB004_ROLLBACK_MEMBERSHIP_COUNT:%',v_changed; end if;
  update public.company_subscriptions set tenant_id=null where company_id=v_store.id and tenant_id=v_tenant_id;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'DB004_ROLLBACK_SUBSCRIPTION_COUNT:%',v_changed; end if;
  update public.stores set tenant_id=null where id=v_store.id and tenant_id=v_tenant_id;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'DB004_ROLLBACK_STORE_COUNT:%',v_changed; end if;
  delete from public.tenants where id=v_tenant_id;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then raise exception 'DB004_ROLLBACK_TENANT_COUNT:%',v_changed; end if;
end
$db004_rollback$;

commit;
