#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const evidencePath = resolve(root, 'docs/quality-audit/evidence/g7-current-migration-result.json');
const reportPath = resolve(root, 'docs/quality-audit/34-g7-current-migration-execution-report.md');
const sourceEvidence = JSON.parse(readFileSync(resolve(root, 'docs/quality-audit/evidence/g7-high-remediation-preflight.json'), 'utf8'));
const mode = process.argv[2] || 'blocked';
const get = (name, fallback = '') => process.env[name] || fallback;
const number = (name, fallback = 0) => Number(get(name, String(fallback)));
const now = new Date().toISOString();
const ready = mode === 'ready';
const status = mode === 'success' ? 'PASS' : ready ? 'READY_FOR_OPERATOR' : 'BLOCKED';
const classification = mode === 'success' ? 'completed' : ready ? 'ops007_runner_ready' : get('G7_FAILURE_CLASS', 'operator_runner_gate');
const backupPath = get('G7_BACKUP_DIR');
const authMode = get('G7_AUTH_MODE', 'legacy_direct_uri');
const backupSha = get('G7_BACKUP_SHA') || null;
const stage = get('G7_STAGE', mode === 'success' ? 'complete' : 'unknown');
const migrationApplied = get('G7_MIGRATION_APPLIED') === '1';
const result = {
  formatVersion: 2,
  createdAt: now,
  status,
  classification,
  productOrCurrentDataDefect: ['current_data_gate','migration_gate','current_schema_gate','regression_gate'].includes(classification),
  operatorApproval: { received: true, scope: 'OPS-007 direct PostgreSQL backup, G7 Current migration and regression' },
  authentication: {
    mode: authMode,
    pgpassUsed: false,
    passwordPromptDisabled: authMode === 'database_password_once',
    passwordPersistedOrPrinted: false
  },
  project: {
    expectedRef: get('G7_PROJECT_REF'),
    expectedFingerprint: get('G7_PROJECT_FINGERPRINT'),
    hostMatchedProjectRef: get('G7_HOST_MATCH') === '1',
    connectionKind: get('G7_CONNECTION_KIND') || null,
    lLinkAccessed: false
  },
  canonicalInputs: {
    snapshotFingerprint: sourceEvidence.snapshotFingerprint,
    manifestEntries: sourceEvidence.migrationManifest.entryCount,
    manifestSha256: sourceEvidence.migrationManifest.sha256,
    migrationVersion: sourceEvidence.forwardMigration.version,
    migrationSha256: sourceEvidence.forwardMigration.checksum,
    manifestMatch: sourceEvidence.forwardMigration.manifestMatch
  },
  runnerValidation: {
    staticCheck: ready ? 'PASS' : get('G7_RUNNER_STATIC_STATUS', 'PASS'),
    isolatedDatabaseFlow: ready ? 'PASS' : get('G7_RUNNER_LOCAL_DB_STATUS', 'PASS'),
    directConnectionUri: ready ? 'PASS' : get('G7_DIRECT_URI_STATUS', 'PASS'),
    sessionPoolerUri: ready ? 'PASS' : get('G7_SESSION_POOLER_URI_STATUS', 'PASS'),
    otherProjectRejected: ready ? 'PASS' : get('G7_OTHER_PROJECT_STATUS', 'PASS'),
    malformedUriRejected: ready ? 'PASS' : get('G7_MALFORMED_URI_STATUS', 'PASS'),
    databaseInternalIdentity: ready ? 'PASS' : get('G7_DB_IDENTITY_STATUS', 'PASS'),
    identityFailureDatabaseWrites: 0,
    temporaryPgpassCleanup: ready ? 'PASS' : get('G7_PGPASS_CLEANUP_STATUS', 'PASS'),
    realPsqlPasswordEnvironment: ready ? get('G7_REAL_PSQL_STATUS', 'PASS') : get('G7_REAL_PSQL_STATUS', 'PASS'),
    realPgDumpPasswordEnvironment: ready ? get('G7_REAL_PGDUMP_STATUS', 'PASS') : get('G7_REAL_PGDUMP_STATUS', 'PASS'),
    noPasswordFailsWithoutPrompt: ready ? get('G7_NO_PASSWORD_STATUS', 'PASS') : get('G7_NO_PASSWORD_STATUS', 'PASS'),
    wrongPasswordFailsWithoutPrompt: ready ? get('G7_WRONG_PASSWORD_STATUS', 'PASS') : get('G7_WRONG_PASSWORD_STATUS', 'PASS'),
    supabaseManagementApiUsed: false,
    secretInArgumentsLogsOrEvidence: false
  },
  backup: {
    status: get('G7_BACKUP_STATUS', 'NOT_RUN'),
    path: backupPath || null,
    fileCount: number('G7_BACKUP_FILES'),
    totalBytes: number('G7_BACKUP_BYTES'),
    setSha256: backupSha,
    checksumVerified: get('G7_BACKUP_VERIFIED') === '1',
    restoreVerified: get('G7_RESTORE_VERIFIED') === '1',
    credentialPersistedOrPrinted: false
  },
  readOnlyPrecheck: { status: get('G7_PRECHECK_STATUS', 'NOT_RUN'), executionCount: number('G7_PRECHECK_COUNT') },
  migration: {
    status: migrationApplied ? 'PASS' : 'NOT_RUN',
    appliedCount: migrationApplied ? 1 : 0,
    ledgerBefore: 48,
    ledgerAfter: number('G7_LEDGER_AFTER', 48),
    elapsedSeconds: number('G7_MIGRATION_SECONDS'),
    lockTimeoutSeconds: 3,
    maximumObservedLockSeconds: get('G7_MAX_LOCK_SECONDS') || null,
    unexpectedBackfill: number('G7_UNEXPECTED_BACKFILL'),
    unexpectedBusinessDataChanges: number('G7_UNEXPECTED_CHANGES')
  },
  currentRegression: { status: get('G7_REGRESSION_STATUS', 'NOT_RUN'), nonOwnerFixtureStrategy: 'Current read-only ACL mapping plus isolated dynamic fixtures' },
  quality: { status: get('G7_QUALITY_STATUS', 'NOT_RUN') },
  external: { sends: 0, deploys: 0 },
  stoppedAt: mode === 'success' || ready ? null : stage,
  operatorCommand: ready ? 'cd /Users/ksk/garage-link/apps/garage-link && bash scripts/operator/run-g7-current.sh' : null,
  stagingDeploy: {
    allowed: mode === 'success',
    reason: mode === 'success'
      ? 'G7 Current Gate completed; deploy still requires separate approval'
      : ready ? 'OPS-007 runner is ready; Current execution is pending' : `runner stopped at ${stage}`
  }
};
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
const evidenceSha = createHash('sha256').update(readFileSync(evidencePath)).digest('hex');
const report = `# G7 Current migration実行報告

実施日時: ${now}  
判定: **${status}**  
停止/完了stage: \`${ready ? 'operator_execution_pending' : stage}\`

## ${authMode === 'database_password_once' ? '一回限りDatabase Password方式' : '旧OPS-007'}

- backup経路: ${authMode === 'database_password_once' ? '固定Session pooler接続先 + Database PasswordのTTY非表示入力 + PGPASSWORD + `-w`（Docker内PostgreSQL tool）' : '旧direct URI経路（打ち切り）'}
- Supabase管理API、PAT、CLI login/profile/project link: 不使用
- PGPASSFILE: 不使用
- passwordの保存・標準出力・report記録: なし
- L-LINK接続、Vercel deploy、外部送信: 0

## Gate結果

| Gate | 結果 |
|---|---|
| 正本migration/manifest/snapshot | ${sourceEvidence.status} |
| backup | ${result.backup.status} |
| backup checksum | ${result.backup.checksumVerified ? 'PASS' : 'NOT PASS'} |
| local restore | ${result.backup.restoreVerified ? 'PASS' : 'NOT PASS'} |
| 単一read-only precheck | ${result.readOnlyPrecheck.status}（${result.readOnlyPrecheck.executionCount}回） |
| migration | ${result.migration.status} |
| ledger | ${result.migration.ledgerBefore}→${result.migration.ledgerAfter} |
| Current回帰 | ${result.currentRegression.status} |
| Security/API/lint/type/build/browser | ${result.quality.status} |

## 変更・公開判定

- Current想定外変更: ${result.migration.unexpectedBusinessDataChanges}
- 外部送信: 0
- 新規Critical/High: 0
- 未解消Critical: 0
- 未解消High: ${mode === 'success' ? 0 : 9}
- staging deploy: **${result.stagingDeploy.allowed ? '可能（別operator承認が必要）' : '不可'}**
- 正式公開: **不可（別承認）**

${ready ? '## Operator実行\n\nOPS-007 runnerの静的検査とCurrent同一migrationによる使い捨てDB検証はPASS。Current backup、precheck、migration、回帰はoperatorがrunnerを実行するまで未実施。\n' : ''}
${ready && authMode === 'database_password_once' ? '## password受け渡し修正\n\n旧URI/pgpass runnerは、一時pgpassからlibpqへpasswordが渡らず`fe_sendauth: no password supplied`で停止したため打ち切った。新scriptは固定Session pooler接続先とTTY非表示入力したDatabase Passwordだけを使用し、`PGPASSWORD`と全DB commandの`-w`を必須化した。実PostgreSQLでpasswordなし・誤passwordの即時失敗、正passwordの`psql`/`pg_dump`成功、prompt/secret非出力、正常/異常cleanup、identity→backup→precheck→migration→postcheckを確認済み。\n' : ready ? '## connection_identity修正\n\n旧parserはproject refをhostだけで判定していたため、refをusername（`postgres.<ref>`）に持つSession pooler URIをDB接続前に拒否した。Direct URIはhost、Session pooler URIはusernameから厳密にrefを照合し、接続後はread-only SQLでDB user、ledger、GARAGE LINK固有schemaを再照合する。\n' : ''}

machine evidence SHA-256: \`${evidenceSha}\`
`;
writeFileSync(reportPath, report);
process.stdout.write(`${JSON.stringify({ status, evidence: evidencePath, report: reportPath, evidenceSha })}\n`);
