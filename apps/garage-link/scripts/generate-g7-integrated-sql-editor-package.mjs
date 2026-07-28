#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'supabase/baseline/manifest.json');
const compatibilityPath = path.join(root, 'supabase/migrations/20260728000050_inventory_count_items_compatibility.sql');
const compatibilityRollbackPath = path.join(root, 'supabase/rollback/20260728000050_inventory_count_items_compatibility.down.sql');
const g7Path = path.join(root, 'supabase/migrations/20260728000100_high_remediation_batch.sql');
const packagePath = path.join(root, 'docs/quality-audit/operator/g7-high-remediation/02-current-sql-editor-apply.sql');
const instructionsPath = path.join(root, 'docs/quality-audit/operator/g7-high-remediation/03-sql-editor-instructions.md');
const contractEvidencePath = path.join(root, 'docs/quality-audit/evidence/g7-schema-contract.json');
const backupEvidencePath = path.join(root, 'docs/quality-audit/evidence/g7-backup-validation.json');
const snapshotEvidencePath = path.join(root, 'docs/quality-audit/evidence/g7-high-remediation-preflight.json');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const q = (value) => String(value).replaceAll("'", "''");

const [manifestRaw, compatibilitySql, compatibilityRollbackSql, g7Sql, oldPackage, contractRaw, backupRaw, snapshotRaw] = await Promise.all([
  readFile(manifestPath, 'utf8'),
  readFile(compatibilityPath, 'utf8'),
  readFile(compatibilityRollbackPath, 'utf8'),
  readFile(g7Path, 'utf8'),
  readFile(packagePath, 'utf8'),
  readFile(contractEvidencePath, 'utf8'),
  readFile(backupEvidencePath, 'utf8'),
  readFile(snapshotEvidencePath, 'utf8'),
]);

const contract = JSON.parse(contractRaw);
const backup = JSON.parse(backupRaw);
const snapshot = JSON.parse(snapshotRaw);
if (contract.status !== 'PASS' || !/^[0-9a-f]{64}$/.test(contract.currentAppSchemaFingerprint ?? '')) {
  throw new Error('G7_SCHEMA_CONTRACT_EVIDENCE_INVALID');
}
if (backup.backup?.status !== 'PASS') throw new Error('G7_BACKUP_EVIDENCE_INVALID');

const manifest = JSON.parse(manifestRaw);
const compatibilityVersion = '20260728000050';
const g7Version = '20260728000100';
const compatibilityEntry = {
  version: compatibilityVersion,
  name: 'inventory_count_items_compatibility',
  file: '../migrations/20260728000050_inventory_count_items_compatibility.sql',
  kind: 'incremental',
  dependsOn: ['20260727000300'],
  checksum: sha256(compatibilitySql),
};
const entriesWithoutCompatibility = manifest.entries.filter((entry) => entry.version !== compatibilityVersion);
const g7Entry = entriesWithoutCompatibility.find((entry) => entry.version === g7Version);
if (!g7Entry) throw new Error('G7_MANIFEST_ENTRY_MISSING');
g7Entry.checksum = sha256(g7Sql);
g7Entry.dependsOn = [...new Set([...(g7Entry.dependsOn ?? []), compatibilityVersion])].sort();
manifest.entries = [...entriesWithoutCompatibility, compatibilityEntry].sort((a, b) => a.version.localeCompare(b.version));

const compatibilityRollback = {
  version: compatibilityVersion,
  file: '../rollback/20260728000050_inventory_count_items_compatibility.down.sql',
  checksum: sha256(compatibilityRollbackSql),
};
manifest.rollbacks = [
  ...(manifest.rollbacks ?? []).filter((entry) => entry.version !== compatibilityVersion),
  compatibilityRollback,
].sort((a, b) => b.version.localeCompare(a.version));

const updatedManifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(manifestPath, updatedManifestRaw);

const precheckStart = oldPackage.indexOf('DO $g7_precheck$');
const fingerprintStart = oldPackage.indexOf('CREATE TEMP TABLE g7_before_table_fingerprints');
const compatibilitySourceStart = oldPackage.indexOf('-- BEGIN compatibility migration');
const sourceStart = oldPackage.indexOf('-- BEGIN source migration');
const postcheckStart = oldPackage.indexOf('DO $g7_postcheck$');
if ([precheckStart, fingerprintStart, sourceStart, postcheckStart].some((value) => value < 0)) {
  throw new Error('G7_PACKAGE_TEMPLATE_ANCHOR_MISSING');
}
const dataPrecheck = oldPackage.slice(precheckStart, fingerprintStart).trim();
const fingerprintEnd = compatibilitySourceStart >= 0 ? compatibilitySourceStart : sourceStart;
const rowFingerprint = oldPackage.slice(fingerprintStart, fingerprintEnd).trim();
let postcheck = oldPackage.slice(postcheckStart).trim();
postcheck = postcheck.replace(
  /IF \(SELECT count\(\*\) FROM supabase_migrations\.schema_migrations\)<>\d+ THEN RAISE EXCEPTION 'G7_POSTCHECK_LEDGER_COUNT'; END IF;/,
  "IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>50 THEN RAISE EXCEPTION 'G7_POSTCHECK_LEDGER_COUNT'; END IF;",
);
postcheck = postcheck.replace(
  "IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000100')<>1 THEN RAISE EXCEPTION 'G7_POSTCHECK_VERSION_COUNT'; END IF;",
  "IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000050')<>1 THEN RAISE EXCEPTION 'DB007_POSTCHECK_VERSION_COUNT'; END IF;\n  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260728000100')<>1 THEN RAISE EXCEPTION 'G7_POSTCHECK_VERSION_COUNT'; END IF;",
);
postcheck = postcheck.replace(
  "IF NOT EXISTS(\n    SELECT 1 FROM supabase_migrations.schema_migrations\n    WHERE version='20260728000100'",
  "IF NOT EXISTS(\n    SELECT 1 FROM supabase_migrations.schema_migrations\n    WHERE version='20260728000050'\n      AND statements=ARRAY['../migrations/20260728000050_inventory_count_items_compatibility.sql']::text[]\n      AND name='inventory_count_items_compatibility'\n  ) THEN RAISE EXCEPTION 'DB007_POSTCHECK_LEDGER_PAYLOAD'; END IF;\n  IF NOT EXISTS(\n    SELECT 1 FROM supabase_migrations.schema_migrations\n    WHERE version='20260728000100'",
);

const generatedAt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date()).replace(' ', 'T');

const identity = `DO $g7_identity$
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

  SELECT encode(extensions.digest(string_agg(format('%s.%s:%s:%s:%s:%s',table_schema,table_name,column_name,data_type,is_nullable,coalesce(column_default,'')),E'\\n' ORDER BY table_schema,table_name,ordinal_position),'sha256'),'hex')
    INTO v_schema_contract
  FROM information_schema.columns
  WHERE table_schema='public' AND NOT (table_name='inventory_count_items' AND column_name IN('deleted_at','is_archived'));
  IF v_schema_contract <> '${q(contract.currentAppSchemaFingerprint)}' THEN RAISE EXCEPTION 'G7_PRECHECK_APP_SCHEMA_FINGERPRINT_DRIFT'; END IF;
END
$g7_identity$;`;

const compatibilityLedger = `INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
SELECT '20260728000050', ARRAY['../migrations/20260728000050_inventory_count_items_compatibility.sql']::text[], 'inventory_count_items_compatibility'
WHERE NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260728000050');`;
const g7Ledger = `INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES('20260728000100',ARRAY['../migrations/20260728000100_high_remediation_batch.sql']::text[],'high_remediation_batch');`;

const packageSql = `-- GARAGE LINK DB-007 compatibility + G7 Current single-transaction SQL Editor package
-- Source compatibility migration: supabase/migrations/20260728000050_inventory_count_items_compatibility.sql
-- Source compatibility SHA-256: ${sha256(compatibilitySql)}
-- Source G7 migration: supabase/migrations/20260728000100_high_remediation_batch.sql
-- Source G7 SHA-256: ${sha256(g7Sql)}
-- Manifest entries: ${manifest.entries.length}; manifest SHA-256: ${sha256(updatedManifestRaw)}
-- Snapshot fingerprint: ${snapshot.snapshotFingerprint}
-- Backup directory: ${backup.backup.directory}
-- Backup SHA256SUMS.txt SHA-256: ${backup.backup.sha256SumsFileSha256}
-- Generated at: ${generatedAt} JST
-- Run once in GARAGE LINK Current Supabase Dashboard SQL Editor.
-- No psql meta-commands or external communication. Any exception rolls back both migrations and both ledger rows.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

${identity}

${dataPrecheck}

${rowFingerprint}

-- BEGIN compatibility migration (body is exact)
${compatibilitySql.trim()}
-- END compatibility migration

${compatibilityLedger}

-- BEGIN source migration (body is exact)
${g7Sql.trim()}
-- END source migration

${g7Ledger}

${postcheck}
`;
await writeFile(packagePath, packageSql);
const packageChecksum = sha256(packageSql);
await writeFile(instructionsPath, `# G7 Current SQL Editor実行手順

## Gate

**READY — compatibility migrationとG7を同一transactionで実行します。**

- package: \`02-current-sql-editor-apply.sql\`
- package SHA-256: \`${packageChecksum}\`
- compatibility: \`20260728000050\`
- G7: \`20260728000100\`
- 成功後ledger: 50件

## operator操作（1回のみ）

1. GARAGE LINK Supabase Dashboard（project ref \`wmlpuzuskfiwdipluglz\`）を開く
2. SQL Editorを開く
3. \`02-current-sql-editor-apply.sql\`の全文を貼り付ける
4. \`Run\`を1回押す

途中分割、再実行、terminal、CLI、PAT、Database Passwordは不要です。例外時はtransaction全体がrollbackされます。成功時は末尾の\`g7_current_result\`が\`status=PASS\`、\`ledger=50\`を返します。

Vercel deploy、外部送信、正式公開は別承認です。
`);

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  manifestEntries: manifest.entries.length,
  manifestSha256: sha256(updatedManifestRaw),
  compatibilityChecksum: sha256(compatibilitySql),
  compatibilityRollbackChecksum: sha256(compatibilityRollbackSql),
  g7Checksum: sha256(g7Sql),
  packageChecksum,
}, null, 2)}\n`);
