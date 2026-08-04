#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const qaRoot = resolve(root, 'supabase/qa');
const productionRoot = resolve(root, 'supabase/migrations');
const manifest = JSON.parse(await readFile(resolve(qaRoot, 'manifest.json'), 'utf8'));
const fail = (code) => { throw new Error(code); };
if (manifest.lane !== 'staging-qa-only' || manifest.requiredProjectRef !== 'gaytoojzwqkpuvfofeql' || manifest.denylistedProjectRefs?.includes(manifest.requiredProjectRef)) fail('QA_LANE_IDENTITY_CONTRACT_INVALID');

const migrationFiles = (await readdir(resolve(qaRoot, 'migrations'))).filter((file) => /^\d{14}_.+\.sql$/.test(file)).sort();
const rollbackFiles = (await readdir(resolve(qaRoot, 'rollback'))).filter((file) => /^\d{14}_.+\.down\.sql$/.test(file)).sort().reverse();
const entryFiles = manifest.entries.map((entry) => entry.file);
const rollbackManifestFiles = manifest.rollbacks.map((entry) => entry.file);
if (new Set(entryFiles).size !== entryFiles.length || new Set(rollbackManifestFiles).size !== rollbackManifestFiles.length) fail('QA_MANIFEST_FILE_DUPLICATE');
if (JSON.stringify([...entryFiles].sort()) !== JSON.stringify(migrationFiles.map((file) => `migrations/${file}`).sort())) fail('QA_MIGRATION_FILE_MANIFEST_MISMATCH');
if (JSON.stringify([...rollbackManifestFiles].sort()) !== JSON.stringify(rollbackFiles.map((file) => `rollback/${file}`).sort())) fail('QA_ROLLBACK_FILE_MANIFEST_MISMATCH');
const versions = manifest.entries.map((entry) => entry.version);
const rollbackVersions = manifest.rollbacks.map((entry) => entry.version);
if (new Set(versions).size !== versions.length || new Set(rollbackVersions).size !== rollbackVersions.length) fail('QA_VERSION_DUPLICATE');
if (JSON.stringify(versions) !== JSON.stringify([...versions].sort())) fail('QA_ENTRIES_NOT_ASCENDING');
if (JSON.stringify(rollbackVersions) !== JSON.stringify([...rollbackVersions].sort().reverse())) fail('QA_ROLLBACKS_NOT_DESCENDING');
if (JSON.stringify([...versions].sort()) !== JSON.stringify([...rollbackVersions].sort())) fail('QA_ENTRY_ROLLBACK_VERSION_SET_MISMATCH');
const entrySet = new Set(versions);
for (const entry of manifest.entries) {
  if (entry.dependsOn?.some((dependency) => !entrySet.has(dependency) || dependency >= entry.version)) fail(`QA_DEPENDENCY_INVALID:${entry.version}`);
  if ((await readdir(productionRoot)).some((file) => file.startsWith(entry.version))) fail(`QA_DDL_IN_PRODUCTION_PATH:${entry.version}`);
  const content = await readFile(resolve(qaRoot, entry.file));
  if (createHash('sha256').update(content).digest('hex') !== entry.checksum) fail(`QA_CHECKSUM_MISMATCH:${entry.version}`);
}
for (const rollback of manifest.rollbacks) {
  const content = await readFile(resolve(qaRoot, rollback.file));
  if (createHash('sha256').update(content).digest('hex') !== rollback.checksum) fail(`QA_ROLLBACK_CHECKSUM_MISMATCH:${rollback.version}`);
}
process.stdout.write(JSON.stringify({ ok: true, lane: manifest.lane, entries: manifest.entries.length, rollbacks: manifest.rollbacks.length, unregisteredMigrations: 0, unregisteredRollbacks: 0 }) + '\n');
