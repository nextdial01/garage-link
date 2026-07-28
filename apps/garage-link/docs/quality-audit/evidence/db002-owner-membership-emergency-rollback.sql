-- DB-002 emergency rollback runbook
-- 通常運用では実行しない。別のoperator明示承認とcurrent project fingerprint確認が必要。
-- 実行前に下記2 placeholderを承認値へ置換する。未置換なら必ずrollbackする。

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select set_config('app.db002.rollback_approved', '__OPERATOR_APPROVED_TRUE__', true);
select set_config('app.db002.rollback_correlation_id', '__NEW_ROLLBACK_CORRELATION_ID__', true);

do $rollback$
declare
  v public.memberships%rowtype;
  v_after public.memberships%rowtype;
  v_repair_audit public.audit_logs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_updated integer;
begin
  if current_setting('app.db002.rollback_approved', true) <> 'true'
     or current_setting('app.db002.rollback_correlation_id', true) in ('', '__NEW_ROLLBACK_CORRELATION_ID__') then
    raise exception 'DB002_ROLLBACK_NOT_APPROVED';
  end if;

  if (select count(*) from public.memberships m
      where substr(encode(extensions.digest(m.id::text, 'sha256'), 'hex'), 1, 12)='096c2c207e42'
        and substr(encode(extensions.digest(m.tenant_id::text, 'sha256'), 'hex'), 1, 12)='cbc9a4f71eee') <> 1 then
    raise exception 'DB002_ROLLBACK_TARGET_MISMATCH';
  end if;

  select * into strict v
  from public.memberships m
  where substr(encode(extensions.digest(m.id::text, 'sha256'), 'hex'), 1, 12)='096c2c207e42'
    and substr(encode(extensions.digest(m.tenant_id::text, 'sha256'), 'hex'), 1, 12)='cbc9a4f71eee'
  for update;
  perform pg_advisory_xact_lock(hashtextextended(v.id::text, 0));

  select * into strict v_repair_audit
  from public.audit_logs
  where metadata->>'correlation_id'='dec35909-f204-4914-8b94-53bf35ae79cb'
    and action='data_repair' and target_type='membership' and target_id=v.id;

  if v.role<>'owner' or v.status<>'active'
     or substr(encode(extensions.digest(v.store_id::text, 'sha256'), 'hex'), 1, 12)<>'6add7888f35c'
     or substr(encode(extensions.digest(v.user_id::text, 'sha256'), 'hex'), 1, 12)<>'fa1ac2cdec39'
     or v.joined_at is distinct from (v_repair_audit.after_data->>'joined_at')::timestamptz
     or v.updated_at is distinct from (v_repair_audit.after_data->>'updated_at')::timestamptz then
    raise exception 'DB002_ROLLBACK_POST_REPAIR_CHANGE_DETECTED';
  end if;

  update public.memberships
     set joined_at=null
   where id=v.id
     and joined_at=(v_repair_audit.after_data->>'joined_at')::timestamptz
     and updated_at=(v_repair_audit.after_data->>'updated_at')::timestamptz;
  get diagnostics v_updated=row_count;
  if v_updated<>1 then raise exception 'DB002_ROLLBACK_UPDATE_COUNT_INVALID'; end if;

  select * into strict v_after from public.memberships where id=v.id;
  if (to_jsonb(v)-array['joined_at','updated_at'])<>(to_jsonb(v_after)-array['joined_at','updated_at'])
     or v_after.joined_at is not null then
    raise exception 'DB002_ROLLBACK_UNEXPECTED_COLUMN_CHANGE';
  end if;

  insert into public.audit_logs
    (store_id,user_id,user_role,action,target_type,target_id,before_data,after_data,metadata,created_at)
  values
    (v.store_id,null,'system','data_repair_rollback','membership',v.id,
     jsonb_build_object('joined_at',v.joined_at,'updated_at',v.updated_at),
     jsonb_build_object('joined_at',null,'updated_at',v_after.updated_at),
     jsonb_build_object(
       'correlation_id',current_setting('app.db002.rollback_correlation_id'),
       'original_correlation_id','dec35909-f204-4914-8b94-53bf35ae79cb',
       'finding_id','DB-002','actor_type','human_operator_approved_emergency_rollback'),
     v_now);
end
$rollback$;

commit;
