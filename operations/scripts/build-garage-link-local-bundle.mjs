#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [repoArg, outputArg] = process.argv.slice(2);
if (!repoArg || !outputArg) throw new Error('usage: build-garage-link-local-bundle.mjs REPO OUTPUT');
const repo = path.resolve(repoArg);
const output = path.resolve(outputArg);
if (fs.existsSync(output)) throw new Error(`OUTPUT_EXISTS:${output}`);
const supabase = path.join(repo, 'apps/garage-link/supabase');
const baseline = path.join(supabase, 'baseline');
const manifestPath = path.join(baseline, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.formatVersion !== 1 || !Array.isArray(manifest.entries) || !Array.isArray(manifest.excluded)) {
  throw new Error('INVALID_BASELINE_MANIFEST');
}
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const resolveSource = (relative) => path.resolve(baseline, relative);
const physical = fs.readdirSync(path.join(supabase, 'migrations')).filter((name) => name.endsWith('.sql')).sort();
const excluded = new Set(manifest.excluded
  .map((entry) => path.basename(resolveSource(entry.file)))
  .filter((name) => physical.includes(name)));
const referenced = new Set();
let prior = '';
const migrationDir = path.join(output, 'supabase/migrations');
const rollbackDir = path.join(output, 'supabase/rollback');
fs.mkdirSync(migrationDir, { recursive: true });
fs.mkdirSync(rollbackDir, { recursive: true });
const generated = [];
for (const entry of manifest.entries) {
  if (!/^\d{12,14}$/.test(entry.version) || (prior && entry.version <= prior)) throw new Error(`INVALID_ENTRY_ORDER:${entry.version}`);
  prior = entry.version;
  const files = entry.file ? [entry.file] : entry.files;
  if (!Array.isArray(files) || files.length === 0) throw new Error(`ENTRY_WITHOUT_SOURCE:${entry.version}`);
  const chunks = files.map((file) => {
    const source = resolveSource(file);
    const bytes = fs.readFileSync(source);
    if (source.includes(`${path.sep}migrations${path.sep}`)) referenced.add(path.basename(source));
    return { file, bytes };
  });
  const sourceHash = chunks.length === 1
    ? sha(chunks[0].bytes)
    : sha(chunks.map(({ file, bytes }) => `${file}\0${sha(bytes)}`).join('\n'));
  if (sourceHash !== entry.checksum) throw new Error(`SOURCE_CHECKSUM_MISMATCH:${entry.version}`);
  const body = chunks.length === 1
    ? chunks[0].bytes
    : Buffer.from(chunks.map(({ file, bytes }) => `-- source: ${file}\n${bytes.toString('utf8').trimEnd()}\n`).join('\n'));
  const name = `${entry.version}_${entry.name}.sql`;
  fs.writeFileSync(path.join(migrationDir, name), body);
  generated.push({ version: entry.version, name, sha256: sha(body) });
}
const unclassified = physical.filter((name) => !referenced.has(name) && !excluded.has(name));
if (unclassified.length) throw new Error(`UNCLASSIFIED_MIGRATION:${unclassified.join(',')}`);
if (physical.length !== referenced.size + excluded.size) throw new Error('MIGRATION_PARTITION_MISMATCH');
const rollbacks = [];
for (const entry of manifest.rollbacks ?? []) {
  const source = resolveSource(entry.file);
  const bytes = fs.readFileSync(source);
  if (sha(bytes) !== entry.checksum) throw new Error(`ROLLBACK_CHECKSUM_MISMATCH:${entry.version}`);
  const name = path.basename(source);
  fs.writeFileSync(path.join(rollbackDir, name), bytes);
  rollbacks.push({ version: entry.version, name, sha256: sha(bytes) });
}
fs.writeFileSync(path.join(output, 'supabase/config.toml'), 'project_id = "garage-link-local-commercial-gate"\n\n[db]\nmajor_version = 17\n\n[db.migrations]\nenabled = true\nschema_paths = []\n\n[db.seed]\nenabled = false\nsql_paths = []\n');
const result = {
  status: 'PASS',
  migrationCount: generated.length,
  physicalCount: physical.length,
  appliedPhysicalCount: referenced.size,
  excludedCount: excluded.size,
  generated,
  rollbacks,
};
if (result.migrationCount !== 53 || result.physicalCount !== 54 || result.appliedPhysicalCount !== 52 || result.excludedCount !== 2) {
  throw new Error(`BUNDLE_CARDINALITY_MISMATCH:${JSON.stringify(result)}`);
}
fs.writeFileSync(path.join(output, 'bundle-manifest.json'), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
