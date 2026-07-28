import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const MIGRATION = 'supabase/migrations/20260726000500_service_role_tenant_store_integrity.sql';
const ROLLBACK = 'supabase/rollback/20260726000500_service_role_tenant_store_integrity.down.sql';

test.describe('G1-C service role and tenant/store integrity', () => {
  test('service-role high-risk paths require an explicit tenant context', async () => {
    const context = await readFile('src/lib/security/garageTenantContext.ts', 'utf8');
    expect(context).toContain('export type GarageTenantContext');
    expect(context).toContain('tenantId: string');
    expect(context).toContain('source: GarageTenantSource');
    expect(context).toContain('correlationId: string');
    expect(context).toContain("source === 'api'");
    expect(context).toContain(".from('stores')");
    expect(context).toContain(".eq('tenant_id', input.expectedTenantId)");

    for (const route of [
      'src/app/api/jobs/inspection-reminders/route.ts',
      'src/app/api/cron/purge-expired-store-data/route.ts',
      'src/app/api/s2s/line-link/delivery-candidates/route.ts',
      'src/app/api/s2s/line-link/delivery-candidates/ack/route.ts',
      'src/app/api/s2s/line-link/inquiries/route.ts',
    ]) {
      const source = await readFile(route, 'utf8');
      expect(source, route).toContain('GarageTenantContext');
      expect(source, route).toMatch(/correlationId|auth\.context/);
    }
  });

  test('L-LINK credentials are bound to one active tenant and store', async () => {
    const auth = await readFile('src/lib/line-link/s2sAuth.ts', 'utf8');
    const migration = await readFile(MIGRATION, 'utf8');

    expect(auth).toContain(".from('line_link_connections')");
    expect(auth).toContain(".eq('key_id', keyId)");
    expect(auth).toContain(".eq('store_id', storeId)");
    expect(auth).toContain(".eq('status', 'active')");
    expect(auth).toContain('tenantId');
    expect(migration).toContain('create table if not exists public.line_link_connections');
    expect(migration).toContain('line_link_connections_store_tenant_fk');
    expect(migration).toContain('line_link_inbound_nonces_store_tenant_fk');
  });

  test('cross-store parent relations are rejected by composite foreign keys', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    for (const constraint of [
      'deals_customer_store_fk',
      'deals_vehicle_store_fk',
      'quotes_deal_store_fk',
      'invoices_deal_store_fk',
      'payment_items_invoice_store_fk',
      'maintenance_jobs_customer_store_fk',
      'inventory_count_items_count_store_fk',
      'line_form_responses_form_store_fk',
    ]) {
      expect(sql, constraint).toContain(constraint);
    }
    expect(sql).toContain('G1C_PRECHECK_CROSS_SCOPE');
  });

  test('scope columns are immutable for ordinary and service-role updates', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('guard_scope_columns_immutable');
    expect(sql).toContain('G1C_SCOPE_IMMUTABLE');
    expect(sql).toContain("'tenant_id'");
    expect(sql).toContain("'store_id'");
    expect(sql).toContain("'company_id'");
  });

  test('cron never invokes all-store service RPCs with a null scope', async () => {
    const reminder = await readFile('src/app/api/jobs/inspection-reminders/route.ts', 'utf8');
    const purge = await readFile('src/app/api/cron/purge-expired-store-data/route.ts', 'utf8');
    expect(reminder).not.toContain('runGenerationJobs(service, null)');
    expect(reminder).toContain(".rpc('service_list_eligible_garage_stores')");
    expect(reminder).not.toMatch(/\.from\(['"]stores['"]\)/);
    expect(purge).toContain('purge_expired_store_data_for_tenant');
    expect(purge).not.toContain("rpc('purge_expired_store_data')");
  });

  test('accounting export requires the explicit import/export capability', async () => {
    const route = await readFile('src/app/api/accounting-export/route.ts', 'utf8');
    expect(route).toContain(".select('tenant_id, store_id, role')");
    expect(route).toContain("['owner', 'admin', 'implementer']");
    expect(route).toContain('status: 403');
  });

  test('rollback is security preserving', async () => {
    const sql = await readFile(ROLLBACK, 'utf8');
    expect(sql).toContain('security-preserving rollback');
    expect(sql).toContain('guard_scope_columns_immutable');
    expect(sql).not.toContain('drop table public.line_link_connections');
  });
});
