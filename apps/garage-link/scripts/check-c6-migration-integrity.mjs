#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_VERSIONS = [
  '20260726000100',
  '20260726000200',
  '20260726000300',
  '20260726000400',
  '20260726000450',
  '20260726000500',
  '20260727000100',
  '20260727000200',
  '20260727000300',
];

const MANIFEST_PATH = 'supabase/baseline/manifest.json';
const RUNBOOK_PATH = 'docs/quality-audit/operator/db004-r1/10-c6-migration-runbook.md';
const START = '<!-- C6_MANIFEST_CHECKSUMS_START -->';
const END = '<!-- C6_MANIFEST_CHECKSUMS_END -->';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactSequence(actual, expected, label) {
  assert(actual.length === expected.length, `${label}: expected ${expected.length}, got ${actual.length}`);
  assert(new Set(actual).size === actual.length, `${label}: duplicate version`);
  assert(actual.every((value, index) => value === expected[index]), `${label}: missing, unexpected, or out-of-order version`);
}

let manifestRaw = await readFile(MANIFEST_PATH);
let manifest = JSON.parse(manifestRaw);
if (process.argv.includes('--sync-manifest')) {
  for (const entry of manifest.entries.filter((candidate) => EXPECTED_VERSIONS.includes(candidate.version))) {
    const filePath = path.resolve(path.dirname(MANIFEST_PATH), entry.file);
    entry.checksum = sha256(await readFile(filePath));
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  manifestRaw = await readFile(MANIFEST_PATH);
  manifest = JSON.parse(manifestRaw);
}
const manifestEntries = manifest.entries.filter((entry) => EXPECTED_VERSIONS.includes(entry.version));
exactSequence(manifestEntries.map((entry) => entry.version), EXPECTED_VERSIONS, 'manifest');

const actualRows = [];
for (const entry of manifestEntries) {
  const filePath = path.resolve(path.dirname(MANIFEST_PATH), entry.file);
  const actual = sha256(await readFile(filePath));
  assert(actual === entry.checksum, `${entry.version}: migration SQL and manifest checksum mismatch`);
  actualRows.push({
    version: entry.version,
    name: entry.name,
    file: path.relative(process.cwd(), filePath),
    checksum: actual,
  });
}

let runbook = await readFile(RUNBOOK_PATH, 'utf8');
const orderSection = runbook.slice(runbook.indexOf('## 適用順'), runbook.indexOf('## migrationごとの手順'));
const runbookVersions = [...orderSection.matchAll(/\|\s*\d+\s*\|\s*`(\d{14})`\s*\|/g)].map((match) => match[1]);
exactSequence(runbookVersions, EXPECTED_VERSIONS, 'runbook order table');

const generated = [
  START,
  '<!-- scripts/check-c6-migration-integrity.mjs --write-runbook でmanifestから生成。手作業で編集しない。 -->',
  '| Version | Manifest SHA-256 |',
  '|---|---|',
  ...actualRows.map((row) => `| \`${row.version}\` | \`${row.checksum}\` |`),
  END,
].join('\n');

const startIndex = runbook.indexOf(START);
const endIndex = runbook.indexOf(END);
assert(startIndex >= 0 && endIndex > startIndex, 'runbook generated checksum block is missing');
const currentGenerated = runbook.slice(startIndex, endIndex + END.length);

if (process.argv.includes('--write-runbook') && currentGenerated !== generated) {
  runbook = `${runbook.slice(0, startIndex)}${generated}${runbook.slice(endIndex + END.length)}`;
  await writeFile(RUNBOOK_PATH, runbook);
}

const finalRunbook = await readFile(RUNBOOK_PATH, 'utf8');
assert(finalRunbook.includes(generated), 'runbook generated checksum block drift');

const result = {
  status: 'PASS',
  expectedCount: EXPECTED_VERSIONS.length,
  manifestEntryCount: manifest.entries.length,
  manifestSha256: sha256(manifestRaw),
  versions: actualRows,
  checks: {
    versionMissing: 0,
    versionDuplicate: 0,
    orderMismatch: 0,
    migrationManifestChecksumMismatch: 0,
    unexpectedMigration: 0,
    runbookGeneratedBlockDrift: 0,
  },
};

const jsonOutArg = process.argv.find((value) => value.startsWith('--json-out='));
if (jsonOutArg) {
  await writeFile(jsonOutArg.slice('--json-out='.length), `${JSON.stringify(result, null, 2)}\n`);
}

console.log(JSON.stringify(result, null, 2));
