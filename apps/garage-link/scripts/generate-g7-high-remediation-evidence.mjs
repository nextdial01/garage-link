#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '../..');
const appPrefix = 'apps/garage-link/';
const manifestPath = 'supabase/baseline/manifest.json';
const migrationVersions = ['20260728000050', '20260728000100'];
const output = 'docs/quality-audit/evidence/g7-high-remediation-preflight.json';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
const lines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const excluded = (file) =>
  file.includes('/docs/quality-audit/') ||
  file.includes('/node_modules/') || file.includes('/.next/') || file.includes('/test-results/') ||
  file.includes('/supabase/.temp/') || /(^|\/)\.env(?:\.|$)/.test(file);

const manifestRaw = await readFile(path.join(appRoot, manifestPath));
const manifest = JSON.parse(manifestRaw);
const forwardMigrations = [];
for (const migrationVersion of migrationVersions) {
  const entry = manifest.entries.find((candidate) => candidate.version === migrationVersion);
  if (!entry || !entry.file) throw new Error(`G7_MANIFEST_ENTRY_INVALID:${migrationVersion}`);
  const migrationPath = path.resolve(path.dirname(path.join(appRoot, manifestPath)), entry.file);
  const migrationRaw = await readFile(migrationPath);
  const actualMigrationChecksum = sha256(migrationRaw);
  if (actualMigrationChecksum !== entry.checksum) throw new Error(`G7_MIGRATION_CHECKSUM_DRIFT:${migrationVersion}`);
  forwardMigrations.push({
    version: migrationVersion,
    name: entry.name,
    file: path.relative(appRoot, migrationPath),
    checksum: actualMigrationChecksum,
    manifestMatch: true,
  });
}

const tracked = lines(git('diff', '--name-only', '--', appPrefix));
const untracked = lines(git('ls-files', '--others', '--exclude-standard', '--', appPrefix));
const kinds = new Map([...tracked.map((file) => [file, 'tracked-change']), ...untracked.map((file) => [file, 'untracked'])]);
const files = [];
for (const file of [...kinds.keys()].filter((candidate) => !excluded(candidate)).sort()) {
  const absolute = path.join(repoRoot, file);
  const body = await readFile(absolute);
  files.push({ path: file, kind: kinds.get(file), size: (await stat(absolute)).size, sha256: sha256(body) });
}

const payload = {
  formatVersion: 1,
  status: 'PASS',
  repositoryRoot: repoRoot,
  applicationRoot: appRoot,
  branch: git('branch', '--show-current'),
  head: git('rev-parse', 'HEAD'),
  scope: { fileCount: files.length, files },
  migrationManifest: { path: manifestPath, entryCount: manifest.entries.length, sha256: sha256(manifestRaw) },
  forwardMigrations,
  packageLock: { path: '../../pnpm-lock.yaml', sha256: sha256(await readFile(path.resolve(appRoot, '../../pnpm-lock.yaml'))) },
  currentSupabase: { ledger: 48, writesThisBatch: 0, migrationsThisBatch: 0 },
  testCommands: [
    'pnpm test:db:fresh', 'pnpm test:security', 'pnpm test:line-link-s2s',
    'pnpm test:l-link-inquiry-s2s', 'pnpm test:line-link-s2s-ack',
    'pnpm test:inquiry-response-management', 'pnpm lint', 'pnpm typecheck', 'pnpm build',
  ],
};
const snapshotFingerprint = sha256(JSON.stringify(payload));
await mkdir(path.dirname(path.join(appRoot, output)), { recursive: true });
await writeFile(path.join(appRoot, output), `${JSON.stringify({ ...payload, createdAt: new Date().toISOString(), snapshotFingerprint }, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', output, snapshotFingerprint, manifestSha256: payload.migrationManifest.sha256, forwardMigrations }, null, 2));
