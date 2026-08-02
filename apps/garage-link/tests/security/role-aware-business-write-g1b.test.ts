import { readFile, readdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const MIGRATION = 'supabase/migrations/20260726000200_role_aware_business_write_lock.sql';
const ROLLBACK = 'supabase/rollback/20260726000200_role_aware_business_write_lock.down.sql';

test.describe('G1-B role-aware business write lock', () => {
  test('role helpers are memberships-only and fail closed', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    for (const functionName of ['current_user_store_role']) {
      const start = sql.indexOf(`create or replace function public.${functionName}`);
      expect(start, functionName).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf('$$;', start);
      const body = sql.slice(start, end);
      expect(body).toContain('set search_path = public, pg_temp');
      expect(body).toContain('public.memberships');
      expect(body).not.toContain('public.store_members');
      expect(body).toContain('auth.uid()');
    }

    for (const functionName of ['current_user_can_write_store', 'current_user_can_admin_store']) {
      const start = sql.indexOf(`create or replace function public.${functionName}`);
      expect(start, functionName).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf('$$;', start);
      const body = sql.slice(start, end);
      expect(body).toContain('set search_path = public, pg_temp');
      expect(body).toContain('current_user_store_role');
      expect(body).not.toContain('public.store_members');
    }
  });

  test('all classified tables and representative seven are covered', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const classification = await readFile('supabase/tests/g1b_table_classification.csv', 'utf8');
    const rows = classification.trim().split('\n').slice(1);

    expect(rows).toHaveLength(65);
    for (const table of ['vehicles', 'customers', 'deals', 'quotes', 'invoices', 'maintenance_jobs', 'inventory_counts']) {
      expect(classification).toContain(`${table},`);
      expect(sql).toContain(`'${table}'`);
    }
  });

  test('broad write policies are replaced and authenticated service-only writes are revoked', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    expect(sql).toContain("polcmd in ('a', 'w', 'd', '*')");
    expect(sql).toContain('current_user_can_write_store(store_id)');
    expect(sql).toContain('current_user_can_admin_store(store_id)');
    expect(sql).toContain('revoke insert, update, delete');
    expect(sql).toContain('from anon, authenticated');
  });

  test('dangerous stock and candidate RPCs enforce the latest role without legacy fallback', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    for (const functionName of [
      'adjust_repair_part_stock',
      'confirm_invoice_part_stock',
      'cancel_invoice_part_stock',
      'generate_followup_candidate_events',
      'generate_inspection_reminder_events',
    ]) {
      const start = sql.indexOf(`create or replace function public.${functionName}`);
      expect(start, functionName).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf('$$;', start);
      const body = sql.slice(start, end);
      expect(body).toContain('current_user_can_admin_store');
      expect(body).not.toContain('store_members');
    }
  });

  test('administrator pre-request guards use canonical memberships only', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    for (const functionName of ['enforce_administrator_aal2', 'enforce_administrator_email_otp']) {
      const start = sql.indexOf(`create or replace function public.${functionName}`);
      expect(start, functionName).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf('$$;', start);
      const body = sql.slice(start, end);
      expect(body).toContain('public.memberships');
      expect(body).not.toContain('public.store_members');
      expect(body).toContain("m.status = 'active'");
      expect(body).toContain('m.disabled_at is null');
      expect(body).toContain('m.deleted_at is null');
    }
  });

  test('legacy-backed read payloads are internal and fail closed on inconsistency', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    expect(sql).toContain('current_user_legacy_surface_is_consistent');
    for (const functionName of [
      'get_garage_ui_context',
      'get_garage_dashboard_payload',
      'get_garage_analytics_payload',
      'get_garage_plan_usage',
      'get_inspection_reminder_eligibility_summary',
      'get_member_contract_access',
    ]) {
      expect(sql).toContain(`rename to ${functionName}_g1b_impl`);
      expect(sql).toContain(`revoke all on function public.${functionName}_g1b_impl`);
    }
  });

  test('user-facing source contains no legacy membership authorization query', async () => {
    const files: string[] = [];
    async function visit(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) await visit(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    }
    await visit('src');

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(/\.from(?:<[\s\S]+?>)?\(['"]store_members['"]\)/);
    }
  });

  test('user-facing service-role mutation APIs re-check active membership and return 403', async () => {
    const routes = [
      'src/app/api/billing/change-options/route.ts',
      'src/app/api/billing/change-plan/route.ts',
      'src/app/api/billing/checkout/route.ts',
      'src/app/api/customer-follow-up/inspection-reminders/settings/route.ts',
      'src/app/api/jobs/inspection-reminders/route.ts',
      'src/app/api/line/send/route.ts',
      'src/app/api/line/settings/route.ts',
      'src/app/api/line/settings/migrate-secrets/route.ts',
    ];

    for (const route of routes) {
      const source = await readFile(route, 'utf8');
      expect(source, route).toContain("('current_user_active_store_membership')");
      expect(source, route).toContain(".eq('status', 'active')");
      expect(source, route).toMatch(/status:\s*403|,\s*403\)/);
    }

    const csvAuth = await readFile('src/lib/security/csvApi.ts', 'utf8');
    const storageAuth = await readFile('src/lib/storage/auth.ts', 'utf8');
    expect(csvAuth).toContain(".eq('status', 'active')");
    expect(csvAuth).not.toMatch(/role === 'viewer'/);
    expect(storageAuth).toContain(".eq('status', 'active')");
    const uploadGuard = storageAuth.slice(
      storageAuth.indexOf('export function canUploadFile'),
      storageAuth.indexOf('export function canDeleteFile')
    );
    expect(uploadGuard).not.toContain("role === 'viewer'");
  });

  test('rollback is security-preserving and does not restore viewer writes', async () => {
    const sql = await readFile(ROLLBACK, 'utf8');

    expect(sql).toContain('security-preserving rollback');
    expect(sql).toContain('current_user_can_admin_store');
    expect(sql).not.toContain('store_id in (select public.current_user_store_ids())');
  });
});
