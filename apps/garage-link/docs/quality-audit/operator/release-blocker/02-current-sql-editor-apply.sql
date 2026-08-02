-- GARAGE LINK AUTH-004 / BILL-003 / CRON-001 Current single-transaction package
-- Source: supabase/migrations/20260728000200_auth_billing_release_blocker_batch.sql
-- Source SHA-256: 2960b3884000d37e8027a37c48bc66dafeb85c829e1faab190720379576398b6
-- Manifest SHA-256: bb055ac364cebf49876e197a58d407fd338fd7106e13a977dd7de27bd12ead5f
-- Generated: 2026-07-28T06:18:08.808Z
-- Execute once, unedited, in GARAGE LINK Supabase SQL Editor.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $release_identity$
DECLARE v_signature integer;
BEGIN
  IF current_database()<>'postgres' THEN RAISE EXCEPTION 'RELEASE_IDENTITY_DATABASE'; END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'RELEASE_IDENTITY_LEDGER'; END IF;
  SELECT
    (CASE WHEN coalesce(obj_description(to_regclass('public.stores')),'') LIKE 'GARAGE LINK%' THEN 1 ELSE 0 END)+
    (CASE WHEN coalesce(obj_description(to_regclass('public.invoices')),'') LIKE 'GARAGE LINK%' THEN 1 ELSE 0 END)+
    (CASE WHEN coalesce(obj_description(to_regclass('public.audit_logs')),'') LIKE 'GARAGE LINK%' THEN 1 ELSE 0 END)
  INTO v_signature;
  IF v_signature<>3 THEN RAISE EXCEPTION 'RELEASE_IDENTITY_SIGNATURE'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>50 THEN RAISE EXCEPTION 'RELEASE_LEDGER_DRIFT'; END IF;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260728000200') THEN RAISE EXCEPTION 'RELEASE_BATCH_ALREADY_APPLIED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260728000100') THEN RAISE EXCEPTION 'RELEASE_BATCH_PREDECESSOR_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('admin_email_otp_bootstrap_context','release_qa_admin_bootstrap_context','service_resolve_garage_store_scope','service_list_eligible_garage_stores')) THEN RAISE EXCEPTION 'RELEASE_BATCH_SCHEMA_WITHOUT_LEDGER'; END IF;
END
$release_identity$;

DO $release_precheck$
DECLARE r record; v_bad bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM public.stores WHERE tenant_id IS NULL) THEN RAISE EXCEPTION 'RELEASE_STORE_TENANT_NULL'; END IF;
  IF EXISTS(SELECT 1 FROM public.memberships m JOIN public.stores s ON s.id=m.store_id WHERE m.status='active' AND (m.deleted_at IS NOT NULL OR m.disabled_at IS NOT NULL OR m.joined_at IS NULL OR s.tenant_id IS DISTINCT FROM m.tenant_id OR NOT public.store_is_authorization_eligible(s.status))) THEN RAISE EXCEPTION 'RELEASE_INVALID_MEMBERSHIP'; END IF;
  IF EXISTS(SELECT 1 FROM public.memberships WHERE status='active' AND deleted_at IS NULL AND disabled_at IS NULL GROUP BY tenant_id,user_id HAVING count(*)>1) THEN RAISE EXCEPTION 'RELEASE_DUPLICATE_MEMBERSHIP'; END IF;
  IF EXISTS(SELECT 1 FROM public.company_subscriptions cs JOIN public.stores s ON s.id=cs.company_id WHERE cs.tenant_id IS DISTINCT FROM s.tenant_id) THEN RAISE EXCEPTION 'RELEASE_BILLING_SCOPE'; END IF;
  FOR r IN SELECT c.relname table_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='store_id' AND NOT a.attisdropped) AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('select count(*) from public.%I x join public.stores s on s.id=x.store_id where x.tenant_id is not null and x.tenant_id<>s.tenant_id',r.table_name) INTO v_bad;
    IF v_bad<>0 THEN RAISE EXCEPTION 'RELEASE_CROSS_TENANT:%:%',r.table_name,v_bad; END IF;
  END LOOP;
  IF to_regclass('cron.job') IS NOT NULL THEN EXECUTE 'select count(*) from cron.job where active' INTO v_bad; IF v_bad<>0 THEN RAISE EXCEPTION 'RELEASE_ACTIVE_CRON'; END IF; END IF;
END
$release_precheck$;

CREATE TEMP TABLE release_before_fingerprint(table_name text PRIMARY KEY,row_count bigint,row_digest text) ON COMMIT DROP;
DO $release_capture$
DECLARE r record; v_count bigint; v_digest text;
BEGIN
  FOR r IN SELECT c.relname table_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') ORDER BY c.relname LOOP
    EXECUTE format('select count(*),md5(coalesce(string_agg(x,'''' order by x),'''')) from (select md5(to_jsonb(t)::text) x from public.%I t) q',r.table_name) INTO v_count,v_digest;
    INSERT INTO release_before_fingerprint VALUES(r.table_name,v_count,v_digest);
  END LOOP;
END
$release_capture$;

-- Exact migration body begins.
-- GARAGE LINK release blocker batch: AUTH-004 / BILL-003 / CRON-001.
-- Forward-only expand migration. No business rows are backfilled or deleted.


-- Supabase production exposes auth.jwt(), while the isolated PostgreSQL
-- regression harness deliberately does not. Read the same request claim from
-- PostgreSQL settings so the service-only contract is portable and testable.
create or replace function public.garage_request_jwt_role()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_role text;
  v_claims jsonb;
begin
  v_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if v_role is not null then return v_role; end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return '';
  end;
  return coalesce(v_claims ->> 'role', '');
end;
$$;

revoke all on function public.garage_request_jwt_role()
  from public, anon, authenticated, service_role;
alter function public.garage_request_jwt_role() owner to postgres;

-- Resolve the authenticated administrator through canonical membership data
-- before an OTP challenge exists. This is not an authentication bypass: only
-- the server-held service identity can call it and it never creates a session.
create or replace function public.admin_email_otp_bootstrap_context(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_contexts jsonb;
  v_count integer;
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_user_id is null or p_session_id is null then return null; end if;

  select
    count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', lower(u.email),
        'tenant_id', m.tenant_id,
        'store_id', s.id,
        'role', m.role
      )
      order by m.tenant_id, s.id
    )
  into v_count, v_contexts
  from public.memberships m
  join auth.users u on u.id = m.user_id
  join public.tenants t on t.id = m.tenant_id and t.status = 'active'
  join public.stores s
    on s.id = m.store_id
   and s.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(s.status)
  left join public.membership_store_assignments msa
    on msa.membership_id = m.id
   and msa.tenant_id = m.tenant_id
   and msa.store_id = s.id
   and msa.deleted_at is null
  where m.user_id = p_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and (m.role in ('owner', 'admin') or msa.id is not null);

  -- Ambiguous multi-tenant/store identities are denied instead of guessed.
  if v_count <> 1 then return null; end if;
  return v_contexts -> 0;
end;
$$;

revoke all on function public.admin_email_otp_bootstrap_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_email_otp_bootstrap_context(uuid, uuid)
  to service_role;
alter function public.admin_email_otp_bootstrap_context(uuid, uuid) owner to postgres;

-- Resolve a Preview QA administrator from canonical membership data only.
-- The application supplies the authenticated Auth user/session; this function
-- independently validates the QA marker, tenant, store, role and assignment.
create or replace function public.release_qa_admin_bootstrap_context(
  p_user_id uuid,
  p_session_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_contexts jsonb;
  v_count integer;
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_user_id is null or p_session_id is null or p_environment <> 'preview' then
    return null;
  end if;

  select
    count(*)::integer,
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', lower(u.email),
        'tenant_id', m.tenant_id,
        'store_id', s.id,
        'role', m.role
      )
      order by m.tenant_id, s.id
    )
  into v_count, v_contexts
  from public.memberships m
  join auth.users u
    on u.id = m.user_id
  join public.tenants t
    on t.id = m.tenant_id
   and t.status = 'active'
  join public.stores s
    on s.id = m.store_id
   and s.tenant_id = m.tenant_id
   and public.store_is_authorization_eligible(s.status)
  left join public.membership_store_assignments msa
    on msa.membership_id = m.id
   and msa.tenant_id = m.tenant_id
   and msa.store_id = s.id
   and msa.deleted_at is null
  where m.user_id = p_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'implementer')
    and m.disabled_at is null
    and m.deleted_at is null
    and coalesce(m.invite_accepted_at, m.joined_at) is not null
    and (m.role in ('owner', 'admin') or msa.id is not null)
    and lower(coalesce(u.email, '')) ~ '@[^@]+\.invalid$'
    and coalesce(u.raw_user_meta_data ->> 'purpose', '') = 'release-preview-fixture'
    and t.name like '[RELEASE QA]%'
    and s.name like '[RELEASE QA]%';

  -- Ambiguous multi-tenant/store QA identities are denied instead of guessed.
  if v_count <> 1 then
    return null;
  end if;
  return v_contexts -> 0;
end;
$$;

revoke all on function public.release_qa_admin_bootstrap_context(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_qa_admin_bootstrap_context(uuid, uuid, text)
  to service_role;
alter function public.release_qa_admin_bootstrap_context(uuid, uuid, text) owner to postgres;

-- Revoke every trusted session and consume every outstanding challenge for one
-- canonical user. Repeated calls are safe.
create or replace function public.revoke_admin_trusted_sessions_for_user(
  p_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user_id is null then return 0; end if;
  update public.admin_trusted_sessions
     set revoked_at = coalesce(revoked_at, now()),
         last_used_at = now()
   where user_id = p_user_id
     and revoked_at is null;
  get diagnostics v_count = row_count;

  update public.admin_email_otp_challenges
     set consumed_at = coalesce(consumed_at, now())
   where user_id = p_user_id
     and consumed_at is null;

  -- p_reason is deliberately not persisted: role/scope invalidation must not
  -- introduce a log surface for PII, OTPs or secrets.
  perform p_reason;
  return v_count;
end;
$$;

revoke all on function public.revoke_admin_trusted_sessions_for_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_admin_trusted_sessions_for_user(uuid, text)
  to service_role;
alter function public.revoke_admin_trusted_sessions_for_user(uuid, text) owner to postgres;

create or replace function public.invalidate_admin_trusted_sessions_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_user uuid;
  v_new_user uuid;
begin
  if tg_op <> 'INSERT' then v_old_user := old.user_id; end if;
  if tg_op <> 'DELETE' then v_new_user := new.user_id; end if;

  if tg_op = 'DELETE'
     or old.user_id is distinct from new.user_id
     or old.role is distinct from new.role
     or old.status is distinct from new.status
     or old.tenant_id is distinct from new.tenant_id
     or old.store_id is distinct from new.store_id
     or old.disabled_at is distinct from new.disabled_at
     or old.deleted_at is distinct from new.deleted_at then
    perform public.revoke_admin_trusted_sessions_for_user(v_old_user, 'membership_scope_changed');
    if v_new_user is distinct from v_old_user then
      perform public.revoke_admin_trusted_sessions_for_user(v_new_user, 'membership_scope_changed');
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invalidate_admin_trusted_sessions_from_membership on public.memberships;
create trigger invalidate_admin_trusted_sessions_from_membership
after update of user_id, role, status, tenant_id, store_id, disabled_at, deleted_at
or delete on public.memberships
for each row execute function public.invalidate_admin_trusted_sessions_from_membership();

create or replace function public.invalidate_admin_trusted_sessions_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_id uuid;
  v_user_id uuid;
begin
  foreach v_membership_id in array array[
    case when tg_op <> 'INSERT' then old.membership_id else null end,
    case when tg_op <> 'DELETE' then new.membership_id else null end
  ] loop
    if v_membership_id is null then continue; end if;
    select m.user_id into v_user_id
      from public.memberships m
     where m.id = v_membership_id;
    perform public.revoke_admin_trusted_sessions_for_user(v_user_id, 'store_assignment_changed');
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invalidate_admin_trusted_sessions_from_assignment
  on public.membership_store_assignments;
create trigger invalidate_admin_trusted_sessions_from_assignment
after insert or update of membership_id, tenant_id, store_id, deleted_at
or delete on public.membership_store_assignments
for each row execute function public.invalidate_admin_trusted_sessions_from_assignment();

create or replace function public.invalidate_admin_trusted_sessions_from_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if old.status is not distinct from new.status
     and old.tenant_id is not distinct from new.tenant_id then
    return new;
  end if;

  for v_user_id in
    select distinct m.user_id
      from public.memberships m
      left join public.membership_store_assignments msa
        on msa.membership_id = m.id
       and msa.deleted_at is null
     where m.user_id is not null
       and (
         m.store_id in (old.id, new.id)
         or msa.store_id in (old.id, new.id)
         or m.tenant_id in (old.tenant_id, new.tenant_id)
       )
  loop
    perform public.revoke_admin_trusted_sessions_for_user(v_user_id, 'store_scope_changed');
  end loop;
  return new;
end;
$$;

drop trigger if exists invalidate_admin_trusted_sessions_from_store on public.stores;
create trigger invalidate_admin_trusted_sessions_from_store
after update of status, tenant_id on public.stores
for each row execute function public.invalidate_admin_trusted_sessions_from_store();

revoke all on function public.invalidate_admin_trusted_sessions_from_membership()
  from public, anon, authenticated;
revoke all on function public.invalidate_admin_trusted_sessions_from_assignment()
  from public, anon, authenticated;
revoke all on function public.invalidate_admin_trusted_sessions_from_store()
  from public, anon, authenticated;
alter function public.invalidate_admin_trusted_sessions_from_membership() owner to postgres;
alter function public.invalidate_admin_trusted_sessions_from_assignment() owner to postgres;
alter function public.invalidate_admin_trusted_sessions_from_store() owner to postgres;

-- BILL-003: the service identity has no direct stores SELECT grant. Resolve one
-- store scope through a narrow, fail-closed function instead.
create or replace function public.service_resolve_garage_store_scope(
  p_store_id uuid
)
returns table(store_id uuid, tenant_id uuid, store_status text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  return query
  select s.id, s.tenant_id, s.status
    from public.stores s
    join public.tenants t on t.id = s.tenant_id and t.status = 'active'
   where s.id = p_store_id
     and s.tenant_id is not null
     and public.store_is_authorization_eligible(s.status);
end;
$$;

create or replace function public.service_list_eligible_garage_stores()
returns table(store_id uuid, tenant_id uuid, store_status text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if public.garage_request_jwt_role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise insufficient_privilege using message = 'service role required';
  end if;
  return query
  select s.id, s.tenant_id, s.status
    from public.stores s
    join public.tenants t on t.id = s.tenant_id and t.status = 'active'
   where s.tenant_id is not null
     and public.store_is_authorization_eligible(s.status)
   order by s.tenant_id, s.id;
end;
$$;

revoke all on function public.service_resolve_garage_store_scope(uuid)
  from public, anon, authenticated;
revoke all on function public.service_list_eligible_garage_stores()
  from public, anon, authenticated;
grant execute on function public.service_resolve_garage_store_scope(uuid)
  to service_role;
grant execute on function public.service_list_eligible_garage_stores()
  to service_role;
alter function public.service_resolve_garage_store_scope(uuid) owner to postgres;
alter function public.service_list_eligible_garage_stores() owner to postgres;

notify pgrst, 'reload schema';
-- Exact migration body ends.

INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES('20260728000200',ARRAY['../migrations/20260728000200_auth_billing_release_blocker_batch.sql']::text[],'auth_billing_release_blocker_batch');

DO $release_postcheck$
DECLARE r record; v_count bigint; v_digest text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>51 THEN RAISE EXCEPTION 'RELEASE_POST_LEDGER_COUNT'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000200')<>1 THEN RAISE EXCEPTION 'RELEASE_POST_LEDGER_VERSION'; END IF;
  IF EXISTS(SELECT 1 FROM (VALUES
    ('public.admin_email_otp_bootstrap_context(uuid,uuid)'),
    ('public.release_qa_admin_bootstrap_context(uuid,uuid,text)'),
    ('public.revoke_admin_trusted_sessions_for_user(uuid,text)'),
    ('public.service_resolve_garage_store_scope(uuid)'),
    ('public.service_list_eligible_garage_stores()')
  ) x(signature) WHERE to_regprocedure(x.signature) IS NULL) THEN RAISE EXCEPTION 'RELEASE_POST_FUNCTION_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('admin_email_otp_bootstrap_context','release_qa_admin_bootstrap_context','service_resolve_garage_store_scope','service_list_eligible_garage_stores') AND pg_get_userbyid(p.proowner)<>'postgres') THEN RAISE EXCEPTION 'RELEASE_POST_FUNCTION_OWNER'; END IF;
  IF has_function_privilege('anon','public.admin_email_otp_bootstrap_context(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.admin_email_otp_bootstrap_context(uuid,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.admin_email_otp_bootstrap_context(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'RELEASE_POST_ADMIN_HELPER_GRANT'; END IF;
  IF has_function_privilege('anon','public.release_qa_admin_bootstrap_context(uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.release_qa_admin_bootstrap_context(uuid,uuid,text)','EXECUTE') OR NOT has_function_privilege('service_role','public.release_qa_admin_bootstrap_context(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'RELEASE_POST_QA_HELPER_GRANT'; END IF;
  IF has_function_privilege('authenticated','public.service_resolve_garage_store_scope(uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.service_resolve_garage_store_scope(uuid)','EXECUTE') THEN RAISE EXCEPTION 'RELEASE_POST_BILL_HELPER_GRANT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.memberships'::regclass AND tgname='invalidate_admin_trusted_sessions_from_membership' AND NOT tgisinternal) THEN RAISE EXCEPTION 'RELEASE_POST_MEMBERSHIP_TRIGGER'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.membership_store_assignments'::regclass AND tgname='invalidate_admin_trusted_sessions_from_assignment' AND NOT tgisinternal) THEN RAISE EXCEPTION 'RELEASE_POST_ASSIGNMENT_TRIGGER'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.stores'::regclass AND tgname='invalidate_admin_trusted_sessions_from_store' AND NOT tgisinternal) THEN RAISE EXCEPTION 'RELEASE_POST_STORE_TRIGGER'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('admin_email_otp_bootstrap_context','release_qa_admin_bootstrap_context') AND pg_get_functiondef(p.oid) ~* '\mstore_members\M') THEN RAISE EXCEPTION 'RELEASE_POST_LEGACY_FALLBACK'; END IF;
  FOR r IN SELECT * FROM release_before_fingerprint ORDER BY table_name LOOP
    EXECUTE format('select count(*),md5(coalesce(string_agg(x,'''' order by x),'''')) from (select md5(to_jsonb(t)::text) x from public.%I t) q',r.table_name) INTO v_count,v_digest;
    IF v_count<>r.row_count OR v_digest<>r.row_digest THEN RAISE EXCEPTION 'RELEASE_POST_BUSINESS_DATA_CHANGED:%',r.table_name; END IF;
  END LOOP;
END
$release_postcheck$;

SELECT jsonb_build_object('status','PASS','migrationVersion','20260728000200','ledger',(SELECT count(*) FROM supabase_migrations.schema_migrations),'unexpectedBusinessChanges',0,'externalSends',0) AS current_migration_batch_result;
COMMIT;
