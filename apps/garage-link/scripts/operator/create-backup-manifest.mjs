#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [directory, projectFingerprint, snapshotFingerprint, expectedLedger] = process.argv.slice(2);
if (!directory || !/^[0-9a-f]{12}$/.test(projectFingerprint || '') || !/^[0-9a-f]{64}$/.test(snapshotFingerprint || '') || !/^\d+$/.test(expectedLedger || '')) process.exit(2);
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = readdirSync(directory)
  .filter((name) => /^0[1-8]-/.test(name))
  .sort()
  .map((name) => {
    const path = resolve(directory, name);
    return { name, bytes: statSync(path).size, sha256: sha256(path) };
  });
if (files.length !== 8 || files.some((file) => file.bytes === 0)) process.exit(3);
const manifest = {
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  projectFingerprint,
  snapshotFingerprint,
  expectedMigrationLedger: Number(expectedLedger),
  method: 'direct PostgreSQL logical dump; no Supabase management API',
  credentialIncluded: false,
  files,
};
writeFileSync(resolve(directory, '00-backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
