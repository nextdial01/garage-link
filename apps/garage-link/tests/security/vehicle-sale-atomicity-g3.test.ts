import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const MIGRATION = 'supabase/migrations/20260726000300_vehicle_sale_atomicity.sql';
const ROLLBACK = 'supabase/rollback/20260726000300_vehicle_sale_atomicity.down.sql';

test.describe('G3 vehicle sale atomicity', () => {
  test('the public sale seams are transactional SECURITY DEFINER RPCs', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    for (const functionName of ['reserve_vehicle_sale', 'cancel_vehicle_sale', 'complete_vehicle_delivery']) {
      const start = sql.indexOf(`create or replace function public.${functionName}`);
      expect(start, functionName).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf('$$;', start);
      const body = sql.slice(start, end);
      expect(body).toContain('security definer');
      expect(body).toContain('set search_path = public, pg_temp');
      expect(body).toContain('auth.uid()');
      expect(body).toContain('for update');
      expect(body).toContain('vehicle_sale_operations');
    }
  });

  test('the database owns active-sale uniqueness and direct transition guards', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    expect(sql).toContain('create table if not exists public.vehicle_sale_claims');
    expect(sql).toContain("where status = 'active'");
    expect(sql).toContain('unique');
    expect(sql).toContain('guard_deal_sale_transition');
    expect(sql).toContain('guard_vehicle_sale_transition');
    expect(sql).toContain('current_user_store_role(v_deal.store_id)');
    expect(sql).toContain("v_role not in ('owner', 'admin', 'staff')");
  });

  test('the user-facing route maps sale outcomes without exposing SQL errors', async () => {
    const route = await readFile('src/app/api/deals/[dealId]/sale/route.ts', 'utf8');

    expect(route).toContain("runSaleOperation(request, dealId, 'reserve_vehicle_sale')");
    expect(route).toContain("runSaleOperation(request, dealId, 'cancel_vehicle_sale')");
    expect(route).toContain("runSaleOperation(request, dealId, 'complete_vehicle_delivery')");
    expect(route).toContain('ALREADY_RESERVED: 409');
    expect(route).toContain('ROLE_FORBIDDEN: 403');
    expect(route).not.toContain('error.message');
  });

  test('deal and vehicle pages use the atomic route for sale state changes', async () => {
    const dealPage = await readFile('src/app/deals/[id]/page.tsx', 'utf8');
    const vehiclePage = await readFile('src/app/vehicles/[id]/page.tsx', 'utf8');

    expect(dealPage).toContain('/sale');
    expect(dealPage).toContain("dealForm.status === '成約'");
    expect(vehiclePage).toContain("form.status === '納車済み'");
    expect(vehiclePage).toContain('/sale');
  });

  test('rollback remains fail closed and never restores direct sale transitions', async () => {
    const sql = await readFile(ROLLBACK, 'utf8');

    expect(sql).toContain('security-preserving rollback');
    expect(sql).toContain('revoke execute on function public.reserve_vehicle_sale');
    expect(sql).toContain('guard_deal_sale_transition');
    expect(sql).toContain('guard_vehicle_sale_transition');
  });
});
