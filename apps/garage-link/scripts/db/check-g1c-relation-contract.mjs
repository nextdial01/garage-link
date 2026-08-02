#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname,'../..');
const contract = JSON.parse(readFileSync(resolve(appRoot,'supabase/baseline/g1c-relation-contract.json'),'utf8'));
const manifest = JSON.parse(readFileSync(resolve(appRoot,'supabase/baseline/manifest.json'),'utf8'));
const catalogArg = process.argv.indexOf('--catalog');
const appliedArg = process.argv.indexOf('--applied-through');
const phaseArg = process.argv.indexOf('--phase');
const appliedThrough = appliedArg >= 0 ? process.argv[appliedArg + 1] : '';
const phase = phaseArg >= 0 ? process.argv[phaseArg + 1] : 'static';

function fail(code,detail) {
  process.stderr.write(`${code}: ${detail}\n`);
  process.exit(2);
}

if (contract.formatVersion !== 1 || !Array.isArray(contract.relations)) fail('DB003_CONTRACT_INVALID','format');
const entryByVersion = new Map(manifest.entries.map((entry) => [entry.version,entry]));
const names = new Set();
for (const relation of contract.relations) {
  if (names.has(relation.name)) fail('DB003_CONTRACT_DUPLICATE',relation.name);
  names.add(relation.name);
  if (relation.expectedState !== 'required-present') fail('DB003_CONTRACT_UNKNOWN_STATE',relation.name);
  const creator = entryByVersion.get(relation.createdBy);
  if (!creator) fail('DB003_CONTRACT_CREATOR_MISSING',relation.name);
  const creatorSql = readFileSync(resolve(appRoot,'supabase',creator.file.replace('../','')),'utf8');
  if (!creatorSql.includes(`create table if not exists public.${relation.name}`)) {
    fail('DB003_CONTRACT_CREATOR_MISMATCH',relation.name);
  }
  if (!Array.isArray(relation.requiredColumns) || relation.requiredColumns.length === 0) {
    fail('DB003_CONTRACT_COLUMNS_MISSING',relation.name);
  }
}

const results = [];
if (catalogArg >= 0) {
  const catalog = JSON.parse(readFileSync(resolve(process.argv[catalogArg + 1]),'utf8'));
  const actualByName = new Map(catalog.relations.map((relation) => [relation.name,relation]));
  for (const expected of contract.relations) {
    const actual = actualByName.get(expected.name) ?? { name: expected.name, exists: false,columns:[],rls:false };
    if (!actual.exists) {
      const creatorPending = appliedThrough && expected.createdBy.localeCompare(appliedThrough) > 0;
      if (phase === 'pre-upgrade' && creatorPending) {
        results.push({ relation: expected.name,expected: expected.expectedState,actual: 'absent',result: 'PENDING_CREATE' });
        continue;
      }
      fail('DB003_REQUIRED_RELATION_ABSENT',expected.name);
    }
    const missing = expected.requiredColumns.filter((column) => !actual.columns.includes(column));
    if (missing.length) fail('DB003_REQUIRED_COLUMN_ABSENT',`${expected.name}.${missing.join(',')}`);
    if (!actual.rls) fail('DB003_REQUIRED_RLS_DISABLED',expected.name);
    results.push({ relation: expected.name,expected: expected.expectedState,actual: 'present',result: 'PASS' });
  }
}

process.stdout.write(`${JSON.stringify({ status:'ok',phase,relations:contract.relations.length,results })}\n`);
