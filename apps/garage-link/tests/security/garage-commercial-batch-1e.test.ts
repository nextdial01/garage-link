import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const migrationRoot = path.join(appRoot, 'supabase/migrations');
const contractPath = path.join(appRoot, 'supabase/tests/application_fingerprint_provider_dependency_contract.sql');

test.describe('Batch 1E provider dependency boundary', () => {
  test('canonical migrations justify every required provider dependency', async () => {
    const files = (await readdir(migrationRoot)).filter((name) => name.endsWith('.sql'));
    const source = (await Promise.all(files.map((name) => readFile(path.join(migrationRoot, name), 'utf8')))).join('\n');
    expect(source).toMatch(/auth\.uid\s*\(/);
    expect(source).toMatch(/auth\.jwt\s*\(/);
    expect(source).toMatch(/auth\.role\s*\(/);
    expect(source).toMatch(/auth\.users/);
  });

  test('contract uses stable semantics and rejects direct Data API grants', async () => {
    const contract = await readFile(contractPath, 'utf8');
    expect(contract).toContain("pg_get_function_result(p.oid)");
    expect(contract).toContain("has_function_privilege");
    expect(contract).toContain("EXCESSIVE_DATA_API_GRANT");
    expect(contract).not.toContain('pg_get_functiondef');
    expect(contract).not.toContain('relrowsecurity');
    expect(contract).not.toContain('pg_get_userbyid');
    expect(contract).not.toContain('oid::text');
  });
});
