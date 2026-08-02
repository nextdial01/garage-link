import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const G1_A = 'supabase/migrations/20260726000100_membership_admission_lock.sql';
const G1_B = 'supabase/migrations/20260726000200_role_aware_business_write_lock.sql';
const G1_C = 'supabase/migrations/20260726000500_service_role_tenant_store_integrity.sql';
const G1_D = 'supabase/migrations/20260727000100_active_store_preference.sql';

test.describe('DB-005 store authorization eligibility', () => {
  test('common helper permits only active and trial and fails closed for all other values', async () => {
    const sql = await readFile(G1_A, 'utf8');
    const start = sql.indexOf('create or replace function public.store_is_authorization_eligible');
    const end = sql.indexOf('$$;', start);
    const helper = sql.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(helper).toContain("p_status in ('active', 'trial')");
    expect(helper).toContain('coalesce(');
    expect(helper).not.toContain("'inactive'");
    expect(helper).not.toContain("'suspended'");
    expect(helper).not.toContain("'cancelled'");
    expect(helper).not.toContain("'deleted'");
  });

  test('G1-A precheck and G1-A through G1-D authorization use the common store helper', async () => {
    const paths = [G1_A, G1_B, G1_C, G1_D];
    const sources = await Promise.all(paths.map((path) => readFile(path, 'utf8')));

    for (const [index, sql] of sources.entries()) {
      expect(sql, paths[index]).toContain('public.store_is_authorization_eligible(');
    }

    expect(sources[0]).not.toContain("s.status is distinct from 'active'");
  });

  test('trial never bypasses canonical active membership and role constraints', async () => {
    const sql = await readFile(G1_D, 'utf8');
    const start = sql.indexOf('create or replace function public.current_user_accessible_store_ids');
    const end = sql.indexOf('$$;', start);
    const helper = sql.slice(start, end);

    expect(helper).toContain('public.memberships');
    expect(helper).toContain("m.status='active'");
    expect(helper).toContain("m.role in ('owner','admin','implementer','staff','viewer')");
    expect(helper).toContain('m.disabled_at is null');
    expect(helper).toContain('m.deleted_at is null');
    expect(helper).toContain('public.store_is_authorization_eligible(s.status)');
    expect(helper).not.toContain('public.store_members');
  });

  test('R1 and C5 checks share the active-or-trial fail-closed rule', async () => {
    const [precheck, postcheck, c5] = await Promise.all([
      readFile('docs/quality-audit/operator/db004-r1/01-read-only-precheck.sql', 'utf8'),
      readFile('docs/quality-audit/operator/db004-r1/06-read-only-postcheck.sql', 'utf8'),
      readFile('docs/quality-audit/operator/db004-r1/09-c5-read-only-checklist.sql', 'utf8'),
    ]);

    for (const sql of [precheck, postcheck, c5]) {
      expect(sql).toMatch(/status\s+not\s+in\s*\(\s*'active'\s*,\s*'trial'\s*\)/i);
    }
  });
});
