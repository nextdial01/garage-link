#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const parser = resolve(root, 'scripts/operator/parse-postgres-url.mjs');
const verifier = resolve(root, 'scripts/operator/verify-postgres-identity.mjs');
const runner = resolve(root, 'scripts/operator/run-g7-current.sh');
const identitySql = resolve(root, 'scripts/operator/sql/g7-current-identity.sql');
const ref = 'wmlpuzuskfiwdipluglz';
const otherRef = 'abcdefghijklmnopqrst';
const password = 'fixture:secret/value';
const direct = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
const session = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require`;

const parse = (uri, expectedRef = ref) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'g7-uri-test-'));
  const result = spawnSync(process.execPath, [parser, directory, expectedRef], { input: uri, encoding: 'utf8' });
  return { directory, result };
};
const expectPass = (uri, kind) => {
  const { directory, result } = parse(uri);
  try {
    if (result.status !== 0) throw new Error(`expected ${kind} PASS, got ${result.status}`);
    if (result.stdout || result.stderr) throw new Error(`${kind} emitted output`);
    const metaRaw = readFileSync(resolve(directory, 'connection-meta.json'), 'utf8');
    const meta = JSON.parse(metaRaw);
    const pgpass = readFileSync(resolve(directory, 'pgpass'), 'utf8');
    if (meta.connectionKind !== kind || meta.projectRef !== ref) throw new Error(`${kind} identity mismatch`);
    if (metaRaw.includes(password) || metaRaw.includes('fixture%3Asecret')) throw new Error(`${kind} leaked password to metadata`);
    if (!pgpass.includes('fixture\\:secret/value')) throw new Error(`${kind} pgpass escaping mismatch`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    if (directory && (() => { try { readFileSync(resolve(directory, 'pgpass')); return true; } catch { return false; } })()) throw new Error(`${kind} pgpass cleanup failed`);
  }
};
const expectReject = (uri, label) => {
  const { directory, result } = parse(uri);
  try {
    if (result.status === 0) throw new Error(`${label} unexpectedly passed`);
    if (result.stdout || result.stderr) throw new Error(`${label} emitted sensitive diagnostics`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

expectPass(direct, 'direct');
expectPass(session, 'session_pooler');
expectReject(`postgresql://postgres:secret@db.${otherRef}.supabase.co:5432/postgres`, 'other direct project');
expectReject(`postgresql://postgres.${otherRef}:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`, 'other pooler project');
expectReject(`postgresql://postgres:secret@db.${ref}.supabase.co.evil.example:5432/postgres`, 'host suffix attack');
expectReject(`postgresql://postgres.${ref}:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`, 'transaction pooler');
expectReject('not-a-postgres-uri', 'malformed URI');
expectReject(`https://postgres:secret@db.${ref}.supabase.co/postgres`, 'wrong protocol');

const identity = {
  database: 'postgres', currentUser: 'postgres', sessionUser: 'postgres', ledgerCount: 48,
  targetMigrationCount: 0, garageSignatureCount: 5, requiredRelationMissing: 0,
};
const verify = (value, expectedStatus = 0) => {
  const result = spawnSync(process.execPath, [verifier, ref, 'postgres', '48', '20260728000100'], {
    input: JSON.stringify(value), encoding: 'utf8',
  });
  if (result.status !== expectedStatus) throw new Error(`identity verifier status ${result.status}, expected ${expectedStatus}`);
  if (result.stderr) throw new Error('identity verifier emitted diagnostics');
  return result;
};
const verified = verify(identity);
if (!verified.stdout.includes('IDENTITY_PASS') || verified.stdout.includes(password)) throw new Error('identity PASS output invalid');
verify({ ...identity, ledgerCount: 47 }, 1);
verify({ ...identity, garageSignatureCount: 0 }, 1);
verify({ ...identity, requiredRelationMissing: 1 }, 1);
verify({ ...identity, currentUser: 'authenticator' }, 1);

const runnerSource = readFileSync(runner, 'utf8');
const verifierGate = runnerSource.indexOf('node "$IDENTITY_VERIFIER"');
const backupGate = runnerSource.indexOf('CURRENT_STAGE="backup"');
if (verifierGate < 0 || backupGate < 0 || verifierGate >= backupGate) throw new Error('backup is not strictly after identity PASS');
if (!runnerSource.includes('trap on_exit EXIT INT TERM') || !runnerSource.includes('cleanup_secrets')) throw new Error('runner cleanup trap missing');
if (!readFileSync(identitySql, 'utf8').includes('begin transaction read only;')) throw new Error('identity query is not read-only');

process.stdout.write('OPS007_CONNECTION_IDENTITY_PASS\n');
