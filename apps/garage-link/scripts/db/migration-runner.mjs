#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const allowedKinds = new Set(['baseline', 'incremental', 'repair', 'data_backfill', 'contract']);

function fail(code, detail) {
  process.stderr.write(`${code}: ${detail}\n`);
  process.exit(2);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function entryFiles(entry) {
  if (entry.file && !entry.files) return [entry.file];
  if (!entry.file && Array.isArray(entry.files) && entry.files.length > 0) return entry.files;
  fail('INVALID_ENTRY_FILES', entry.version ?? 'unknown');
}

function checksumFor(root, allowedRoot, entry) {
  const files = entryFiles(entry);
  if (files.length === 1) return sha256(readFileSync(resolveSafe(root, allowedRoot, files[0])));
  const parts = files.map((file) => `${file}\0${sha256(readFileSync(resolveSafe(root, allowedRoot, file)))}`);
  return sha256(parts.join('\n'));
}

function resolveSafe(root, allowedRoot, file) {
  const absolute = resolve(root, file);
  const fromAllowedRoot = relative(allowedRoot, absolute);
  if (fromAllowedRoot === '..' || fromAllowedRoot.startsWith(`..${sep}`) || fromAllowedRoot.startsWith(sep)) {
    fail('PATH_OUTSIDE_MANIFEST', file);
  }
  return absolute;
}

function validateManifest(manifestPath) {
  const absoluteManifest = resolve(manifestPath);
  const root = dirname(absoluteManifest);
  const manifest = JSON.parse(readFileSync(absoluteManifest, 'utf8'));
  const allowedRoot = resolve(root, manifest.allowedRoot ?? '.');
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.entries)) {
    fail('INVALID_MANIFEST', 'formatVersion=1 and entries[] are required');
  }

  const versions = new Set();
  let previous = '';
  for (const entry of manifest.entries) {
    if (!/^\d{12,14}$/.test(entry.version ?? '') || !entry.name || !allowedKinds.has(entry.kind) || !entry.checksum) {
      fail('INVALID_ENTRY', JSON.stringify(entry));
    }
    entryFiles(entry);
    if (versions.has(entry.version)) fail('DUPLICATE_VERSION', entry.version);
    if (previous && entry.version.localeCompare(previous) <= 0) {
      fail('ORDER_VIOLATION', `${previous} -> ${entry.version}`);
    }
    versions.add(entry.version);
    previous = entry.version;
    const actual = checksumFor(root, allowedRoot, entry);
    if (actual !== entry.checksum) fail('CHECKSUM_DRIFT', `${entry.version} ${entry.name}`);
    if (entry.dependsOn !== undefined && (!Array.isArray(entry.dependsOn) || entry.dependsOn.some((version) => !/^\d{14}$/.test(version)))) {
      fail('INVALID_DEPENDENCY', entry.version);
    }
  }
  if (manifest.rollbacks !== undefined) {
    if (!Array.isArray(manifest.rollbacks)) fail('INVALID_ROLLBACKS', 'rollbacks must be an array');
    for (const rollback of manifest.rollbacks) {
      if (!/^\d{14}$/.test(rollback.version ?? '') || !rollback.file || !rollback.checksum) {
        fail('INVALID_ROLLBACK', JSON.stringify(rollback));
      }
      const actual = sha256(readFileSync(resolveSafe(root, allowedRoot, rollback.file)));
      if (actual !== rollback.checksum) fail('ROLLBACK_CHECKSUM_DRIFT', rollback.version);
    }
  }
  return { manifest, root, allowedRoot };
}

function docker(args, { input, quiet = false } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail('DOCKER_UNAVAILABLE', result.error.message);
  if (result.status !== 0 && !quiet) {
    process.stderr.write(result.stderr || result.stdout);
  }
  return result;
}

function assertIsolatedContainer(container) {
  if (!/^garage-link-g0b-[a-z0-9-]+$/.test(container ?? '')) fail('UNSAFE_CONTAINER', container ?? 'missing');
  const inspected = docker(['inspect', container, '--format', '{{json .}}']);
  if (inspected.status !== 0) fail('CONTAINER_NOT_FOUND', container);
  const value = JSON.parse(inspected.stdout);
  if (value.HostConfig?.NetworkMode !== 'none') fail('NETWORK_NOT_DENIED', value.HostConfig?.NetworkMode ?? 'unknown');
  const ports = value.HostConfig?.PortBindings ?? {};
  if (Object.keys(ports).length !== 0) fail('PUBLISHED_PORTS_FORBIDDEN', JSON.stringify(ports));
  const image = value.Config?.Image ?? '';
  if (!image.startsWith('public.ecr.aws/supabase/postgres:')) fail('NON_SUPABASE_IMAGE', image);
}

function psql(container, sql, { tuples = false, quiet = false } = {}) {
  const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  if (tuples) args.push('-Atq');
  else if (quiet) args.push('-q');
  const result = docker(args, { input: sql, quiet });
  return result;
}

function assertSupabaseBootstrap(container) {
  const sql = `
do $$
begin
  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception 'G0B_DATABASE_IDENTITY_MISMATCH';
  end if;
  if to_regnamespace('auth') is null or to_regnamespace('storage') is null
     or to_regnamespace('extensions') is null or to_regnamespace('realtime') is null
     or to_regnamespace('vault') is null or to_regnamespace('graphql') is null then
    raise exception 'G0B_SUPABASE_SCHEMA_MISSING';
  end if;
  if to_regprocedure('auth.uid()') is null then raise exception 'G0B_AUTH_UID_MISSING'; end if;
  if not exists (select 1 from pg_roles where rolname='anon' and not rolsuper and not rolbypassrls)
     or not exists (select 1 from pg_roles where rolname='authenticated' and not rolsuper and not rolbypassrls)
     or not exists (select 1 from pg_roles where rolname='service_role' and rolbypassrls) then
    raise exception 'G0B_SUPABASE_ROLE_MISMATCH';
  end if;
end $$;
`;
  const result = psql(container, sql, { quiet: true });
  if (result.status !== 0) fail('SUPABASE_BOOTSTRAP_INVALID', result.stderr.trim());
}

function ensureLedger(container) {
  const sql = `
create schema if not exists supabase_migrations authorization postgres;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
create table if not exists supabase_migrations.migration_integrity (
  version text primary key references supabase_migrations.schema_migrations(version) on delete restrict,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  kind text not null,
  environment text not null,
  state text not null check (state in ('applied','rolled_back')),
  applied_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  execution_order bigint generated always as identity unique,
  rollback_file text
);
create table if not exists supabase_migrations.migration_runs (
  id bigint generated always as identity primary key,
  version text not null,
  operation text not null check (operation in ('apply','rollback','restore_check','manual_repair')),
  environment text not null,
  status text not null check (status in ('running','succeeded','failed')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  error_code text
);
revoke all on schema supabase_migrations from public, anon, authenticated, service_role;
revoke all on all tables in schema supabase_migrations from public, anon, authenticated, service_role;
alter default privileges in schema supabase_migrations revoke all on tables from public, anon, authenticated, service_role;
`;
  const result = psql(container, sql, { quiet: true });
  if (result.status !== 0) fail('LEDGER_BOOTSTRAP_FAILED', result.stderr.trim());
}

function query(container, sql) {
  const result = psql(container, sql, { tuples: true, quiet: true });
  if (result.status !== 0) fail('LEDGER_QUERY_FAILED', result.stderr.trim());
  return result.stdout.trim();
}

function applyEntry(container, root, allowedRoot, entry, environment) {
  const current = query(container, `
select coalesce(m.name,'') || '|' || coalesce(i.checksum,'') || '|' || coalesce(i.state,'missing')
from supabase_migrations.schema_migrations m
left join supabase_migrations.migration_integrity i using (version)
where m.version=${sqlLiteral(entry.version)};
`);
  if (current) {
    const [name, checksum, state] = current.split('|');
    if (name !== entry.name) fail('LEDGER_NAME_DRIFT', `${entry.version} ${name} != ${entry.name}`);
    if (!checksum) fail('LEDGER_INTEGRITY_MISSING', entry.version);
    if (checksum !== entry.checksum) fail('LEDGER_CHECKSUM_DRIFT', entry.version);
    if (state === 'applied') return 'skipped';
    if (state !== 'rolled_back') fail('LEDGER_STATE_INVALID', `${entry.version} ${state}`);
  } else if (entry.kind === 'baseline') {
    const publicTables = Number(query(container, `select count(*) from pg_tables where schemaname='public';`) || '0');
    if (publicTables !== 0) fail('BASELINE_REQUIRES_EMPTY_DATABASE', String(publicTables));
  }

  const runId = query(container, `insert into supabase_migrations.migration_runs(version,operation,environment,status)
values (${sqlLiteral(entry.version)},'apply',${sqlLiteral(environment)},'running') returning id;`);
  const files = entryFiles(entry);
  const sqlBody = files.map((file) => readFileSync(resolveSafe(root, allowedRoot, file), 'utf8')).join('\n\n');
  const ownsTransaction = /^\s*begin\s*;/im.test(sqlBody);
  const sql = ownsTransaction
    ? `set lock_timeout='3s';\nset statement_timeout='120s';\n${sqlBody}`
    : `begin;\nset local lock_timeout='3s';\nset local statement_timeout='120s';\n${sqlBody}\ncommit;\n`;
  const applyResult = psql(container, sql, { quiet: true });
  if (applyResult.status !== 0) {
    psql(container, `update supabase_migrations.migration_runs set status='failed', finished_at=clock_timestamp(), error_code='SQL_APPLY_FAILED' where id=${Number(runId)};`, { quiet: true });
    process.stderr.write(applyResult.stderr || applyResult.stdout);
    fail('MIGRATION_FAILED', `${entry.version} ${entry.name}`);
  }

  const fileNames = files.map(sqlLiteral).join(',');
  const finalize = psql(container, `
insert into supabase_migrations.schema_migrations(version,statements,name)
values (${sqlLiteral(entry.version)}, array[${fileNames}]::text[], ${sqlLiteral(entry.name)})
on conflict (version) do update set statements=excluded.statements, name=excluded.name;
insert into supabase_migrations.migration_integrity(version,checksum,kind,environment,state,applied_at,updated_at)
values (${sqlLiteral(entry.version)},${sqlLiteral(entry.checksum)},${sqlLiteral(entry.kind)},${sqlLiteral(environment)},'applied',clock_timestamp(),clock_timestamp())
on conflict (version) do update set checksum=excluded.checksum, kind=excluded.kind, environment=excluded.environment, state='applied', updated_at=clock_timestamp();
update supabase_migrations.migration_runs set status='succeeded', finished_at=clock_timestamp() where id=${Number(runId)};
`, { quiet: true });
  if (finalize.status !== 0) fail('LEDGER_FINALIZE_FAILED', `${entry.version} ${finalize.stderr.trim()}`);
  return 'applied';
}

function rollbackEntries(container, root, allowedRoot, manifest, environment) {
  if (!Array.isArray(manifest.rollbacks) || manifest.rollbacks.length === 0) fail('ROLLBACKS_NOT_CONFIGURED', 'manifest');
  let rolledBack = 0;
  for (const rollback of manifest.rollbacks) {
    const entry = manifest.entries.find((candidate) => candidate.version === rollback.version);
    if (!entry) fail('ROLLBACK_ENTRY_MISSING', rollback.version);
    const state = query(container, `select checksum||'|'||state from supabase_migrations.migration_integrity where version=${sqlLiteral(rollback.version)};`);
    if (!state) fail('ROLLBACK_LEDGER_MISSING', rollback.version);
    const [checksum, currentState] = state.split('|');
    if (checksum !== entry.checksum) fail('LEDGER_CHECKSUM_DRIFT', rollback.version);
    if (currentState === 'rolled_back') continue;
    if (currentState !== 'applied') fail('LEDGER_STATE_INVALID', `${rollback.version} ${currentState}`);

    const runId = query(container, `insert into supabase_migrations.migration_runs(version,operation,environment,status)
values (${sqlLiteral(rollback.version)},'rollback',${sqlLiteral(environment)},'running') returning id;`);
    const sql = readFileSync(resolveSafe(root, allowedRoot, rollback.file), 'utf8');
    const result = psql(container, sql, { quiet: true });
    if (result.status !== 0) {
      psql(container, `update supabase_migrations.migration_runs set status='failed', finished_at=clock_timestamp(), error_code='ROLLBACK_SQL_FAILED' where id=${Number(runId)};`, { quiet: true });
      process.stderr.write(result.stderr || result.stdout);
      fail('ROLLBACK_FAILED', rollback.version);
    }
    const finalized = psql(container, `
update supabase_migrations.migration_integrity
set state='rolled_back', rollback_file=${sqlLiteral(rollback.file)}, updated_at=clock_timestamp()
where version=${sqlLiteral(rollback.version)};
update supabase_migrations.migration_runs set status='succeeded', finished_at=clock_timestamp() where id=${Number(runId)};
`, { quiet: true });
    if (finalized.status !== 0) fail('ROLLBACK_LEDGER_FINALIZE_FAILED', rollback.version);
    rolledBack += 1;
  }
  const rolledVersions = new Set(manifest.rollbacks.map((rollback) => rollback.version));
  for (const dependent of manifest.entries.filter((entry) => entry.dependsOn?.some((version) => rolledVersions.has(version)))) {
    psql(container, `update supabase_migrations.migration_integrity set state='rolled_back', rollback_file='dependency', updated_at=clock_timestamp() where version=${sqlLiteral(dependent.version)};`, { quiet: true });
  }
  return rolledBack;
}

const command = process.argv[2];
const manifestPath = argValue('--manifest');
if (!manifestPath || !['validate', 'apply', 'rollback', 'status'].includes(command)) {
  fail('USAGE', 'migration-runner.mjs <validate|apply|rollback|status> --manifest <path> [--container <name>]');
}

const { manifest, root, allowedRoot } = validateManifest(manifestPath);
if (command === 'validate') {
  process.stdout.write(`${JSON.stringify({ status: 'ok', entries: manifest.entries.length })}\n`);
  process.exit(0);
}

const container = argValue('--container');
const environment = argValue('--environment') ?? 'g0b-local';
if (!/^g0b-[a-z0-9-]+$/.test(environment)) fail('UNSAFE_ENVIRONMENT', environment);
assertIsolatedContainer(container);
assertSupabaseBootstrap(container);
ensureLedger(container);

if (command === 'status') {
  const rows = query(container, `select m.version||'|'||m.name||'|'||i.checksum||'|'||i.state from supabase_migrations.schema_migrations m join supabase_migrations.migration_integrity i using(version) order by i.execution_order;`);
  process.stdout.write(`${rows}\n`);
  process.exit(0);
}

if (command === 'rollback') {
  const rolledBack = rollbackEntries(container, root, allowedRoot, manifest, environment);
  process.stdout.write(`${JSON.stringify({ status: 'ok', rolledBack })}\n`);
  process.exit(0);
}

let applied = 0;
let skipped = 0;
const through = argValue('--through');
if (through && !manifest.entries.some((entry) => entry.version === through)) fail('THROUGH_VERSION_NOT_FOUND', through);
const selectedEntries = through
  ? manifest.entries.slice(0, manifest.entries.findIndex((entry) => entry.version === through) + 1)
  : manifest.entries;
for (const entry of selectedEntries) {
  const outcome = applyEntry(container, root, allowedRoot, entry, environment);
  if (outcome === 'applied') applied += 1;
  else skipped += 1;
}
process.stdout.write(`${JSON.stringify({ status: 'ok', applied, skipped, total: selectedEntries.length })}\n`);
