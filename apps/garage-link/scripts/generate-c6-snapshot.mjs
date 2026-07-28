#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '../..');
const appPrefix = 'apps/garage-link/';
const output = 'docs/quality-audit/db006-current-supabase-c6-snapshot-manifest.json';
const manifestPath = 'supabase/baseline/manifest.json';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
const lines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const excluded = (file) =>
  file.includes('/docs/quality-audit/') ||
  file.includes('/node_modules/') ||
  file.includes('/.next/') ||
  file.includes('/test-results/') ||
  file.includes('/supabase/.temp/') ||
  /(^|\/)\.env(?:\.|$)/.test(file);

const tracked = lines(git('diff', '--name-only', '--', appPrefix));
const untracked = lines(git('ls-files', '--others', '--exclude-standard', '--', appPrefix));
const kinds = new Map([
  ...tracked.map((file) => [file, 'tracked-change']),
  ...untracked.map((file) => [file, 'untracked']),
]);
const files = [];
for (const file of [...kinds.keys()].filter((candidate) => !excluded(candidate)).sort()) {
  const absolute = path.join(repoRoot, file);
  const body = await readFile(absolute);
  files.push({ path: file, kind: kinds.get(file), size: (await stat(absolute)).size, sha256: sha256(body) });
}

const manifestRaw = await readFile(path.join(appRoot, manifestPath));
const manifest = JSON.parse(manifestRaw);
const payload = {
  formatVersion: 4,
  repositoryRoot: repoRoot,
  applicationRoot: appRoot,
  branch: git('branch', '--show-current'),
  head: git('rev-parse', 'HEAD'),
  scope: {
    description: 'Dirty-tree product, migration, test, and evidence-generator inputs; audit reports, secrets, build output, node_modules and test output are excluded.',
    trackedChangeCount: tracked.length,
    untrackedCount: untracked.length,
    fileCount: files.length,
    files,
  },
  migrationManifest: {
    path: manifestPath,
    entryCount: manifest.entries.length,
    sha256: sha256(manifestRaw),
    targetVersions: manifest.entries.filter((entry) => entry.version >= '20260726000100').map((entry) => ({
      version: entry.version,
      name: entry.name,
      checksum: entry.checksum,
    })),
  },
  packageLock: {
    path: '../../pnpm-lock.yaml',
    sha256: sha256(await readFile(path.resolve(appRoot, '../../pnpm-lock.yaml'))),
  },
  testCommands: ['pnpm verify:g0b'],
  buildCommand: 'next build --webpack',
  currentSupabase: {
    projectRef: 'wmlpuzuskfiwdipluglz',
    projectFingerprint: '5b41e1af2add',
    migrationAppliedBeforeC6: 0,
    currentLedgerBeforeC6: 39,
  },
};
const snapshotFingerprint = sha256(JSON.stringify(payload));
const document = { ...payload, createdAt: new Date().toISOString(), snapshotFingerprint };
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', output, snapshotFingerprint, fileCount: files.length, manifestSha256: payload.migrationManifest.sha256 }, null, 2));
