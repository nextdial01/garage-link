import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const runner = join(process.cwd(), 'scripts/db/migration-runner.mjs');

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'garage-link-ledger-'));
  mkdirSync(join(root, 'sql'));
  writeFileSync(join(root, 'sql/001_first.sql'), 'select 1;\n');
  writeFileSync(join(root, 'sql/002_second.sql'), 'select 2;\n');
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({
    formatVersion: 1,
    environment: 'test',
    entries: [
      { version: '000000000001', name: 'fixture_baseline', file: 'sql/001_first.sql', kind: 'baseline', checksum: '4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c' },
      { version: '20260726000400', name: 'fixture_incremental', file: 'sql/002_second.sql', kind: 'incremental', checksum: 'ac4396cdee0295db27f816dc31134189999d0071663e618f4957bc23edb584d7' },
    ],
  }, null, 2));
  return root;
}

function validate(root) {
  return spawnSync(process.execPath, [runner, 'validate', '--manifest', join(root, 'manifest.json')], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('manifestのversion・順序・checksumが一致すれば検証できる', () => {
  const root = makeFixture();
  const result = validate(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"entries":2/);
});

test('適用対象SQLが書き換わるとchecksum driftでfail-closedになる', () => {
  const root = makeFixture();
  writeFileSync(join(root, 'sql/002_second.sql'), 'select 999;\n');
  const result = validate(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /CHECKSUM_DRIFT/);
});

test('version重複と順序逆転を拒否する', () => {
  const root = makeFixture();
  const manifestPath = join(root, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.entries[1].version = manifest.entries[0].version;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const result = validate(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DUPLICATE_VERSION|ORDER_VIOLATION/);
});

test('各migrationをtransactionとlock timeoutで保護する', () => {
  const source = readFileSync(runner, 'utf8');
  assert.match(source, /ownsTransaction/);
  assert.match(source, /set local lock_timeout='3s'/);
  assert.match(source, /set statement_timeout='120s'/);
});
