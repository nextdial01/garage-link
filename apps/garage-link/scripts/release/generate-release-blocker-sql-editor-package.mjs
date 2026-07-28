#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const version = '20260728000200';
const migrationRel = `supabase/migrations/${version}_auth_billing_release_blocker_batch.sql`;
const migrationPath = path.join(root, migrationRel);
const manifestPath = path.join(root, 'supabase/baseline/manifest.json');
const packagePath = path.join(root, 'docs/quality-audit/operator/release-blocker/02-current-sql-editor-apply.sql');
const evidencePath = path.join(root, 'docs/quality-audit/evidence/current-migration-batch-preflight.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const [migrationRaw, manifestRaw] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(manifestPath, 'utf8'),
]);
const manifest = JSON.parse(manifestRaw);
const entry = manifest.entries.find((candidate) => candidate.version === version);
if (!entry) throw new Error('RELEASE_BATCH_MANIFEST_ENTRY_MISSING');
const migrationSha = sha256(migrationRaw);
if (entry.checksum !== migrationSha) throw new Error('RELEASE_BATCH_MANIFEST_CHECKSUM_DRIFT');
const beginIndex = migrationRaw.search(/^begin;\s*$/im);
const commitMatches = [...migrationRaw.matchAll(/^commit;\s*$/gim)];
const commitIndex = commitMatches.at(-1)?.index ?? -1;
if (beginIndex < 0 || commitIndex < beginIndex) {
  throw new Error('RELEASE_BATCH_TRANSACTION_WRAPPER_MISSING');
}
const beginEnd = migrationRaw.indexOf('\n', beginIndex) + 1;
const migrationBody = `${migrationRaw.slice(0, beginIndex)}${migrationRaw.slice(beginEnd, commitIndex)}`.trim();
const generatedAt = new Date().toISOString();

const sql = `-- GARAGE LINK AUTH-004 / BILL-003 / CRON-001 Current single-transaction package
-- Source: ${migrationRel}
-- Source SHA-256: ${migrationSha}
-- Manifest SHA-256: ${sha256(manifestRaw)}
-- Generated: ${generatedAt}
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
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') THEN RAISE EXCEPTION 'RELEASE_BATCH_ALREADY_APPLIED'; END IF;
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
${migrationBody}
-- Exact migration body ends.

INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES('${version}',ARRAY['../migrations/${version}_auth_billing_release_blocker_batch.sql']::text[],'auth_billing_release_blocker_batch');

DO $release_postcheck$
DECLARE r record; v_count bigint; v_digest text;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>51 THEN RAISE EXCEPTION 'RELEASE_POST_LEDGER_COUNT'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='${version}')<>1 THEN RAISE EXCEPTION 'RELEASE_POST_LEDGER_VERSION'; END IF;
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
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('admin_email_otp_bootstrap_context','release_qa_admin_bootstrap_context') AND pg_get_functiondef(p.oid) ~* '\\mstore_members\\M') THEN RAISE EXCEPTION 'RELEASE_POST_LEGACY_FALLBACK'; END IF;
  FOR r IN SELECT * FROM release_before_fingerprint ORDER BY table_name LOOP
    EXECUTE format('select count(*),md5(coalesce(string_agg(x,'''' order by x),'''')) from (select md5(to_jsonb(t)::text) x from public.%I t) q',r.table_name) INTO v_count,v_digest;
    IF v_count<>r.row_count OR v_digest<>r.row_digest THEN RAISE EXCEPTION 'RELEASE_POST_BUSINESS_DATA_CHANGED:%',r.table_name; END IF;
  END LOOP;
END
$release_postcheck$;

SELECT jsonb_build_object('status','PASS','migrationVersion','${version}','ledger',(SELECT count(*) FROM supabase_migrations.schema_migrations),'unexpectedBusinessChanges',0,'externalSends',0) AS current_migration_batch_result;
COMMIT;
`;

await writeFile(packagePath, sql);
const evidence = {
  schemaVersion: 1,
  generatedAt,
  status: 'PASS',
  version,
  migration: { path: migrationRel, sha256: migrationSha },
  manifest: { path: 'supabase/baseline/manifest.json', entries: manifest.entries.length, sha256: sha256(manifestRaw) },
  package: { path: path.relative(root, packagePath), sha256: sha256(sql) },
  expectedLedgerBefore: 50,
  expectedLedgerAfter: 51,
};
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
