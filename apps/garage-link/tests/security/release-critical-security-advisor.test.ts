import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/202608100001_release_critical_security_advisor_search_path.sql');

test('Security Advisor mutable search_path fixes do not broaden function access', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  expect(migration).toContain('alter function public.set_updated_at() set search_path = pg_catalog;');
  expect(migration).toContain('alter function public.adjust_repair_part_stock_g1b_impl(uuid, uuid, integer)');
  expect(migration).toContain('set search_path = public, pg_temp;');
  expect(migration).not.toMatch(/grant\s+.*(?:anon|authenticated)/i);
});
