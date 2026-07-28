import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(root, 'supabase/migrations/20260727000300_delivered_sale_correction.sql');
const g3MigrationPath = path.join(root, 'supabase/migrations/20260726000300_vehicle_sale_atomicity.sql');

test.describe('G4-B delivered sale correction boundary', () => {
  test('uses an independent case and preserves original sale records', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
    expect(sql).toContain('create table if not exists public.sale_correction_cases');
    expect(sql).toContain('customer_return');
    expect(sql).toContain('contract_correction');
    expect(sql).toContain('delivery_cancellation');
    expect(sql).toContain('vehicle_exchange');
    expect(sql).toContain('administrative_correction');
    expect(sql).toContain("status in ('requested','under_review','approved','processing')");
    expect(sql).toContain("v_claim.status <> 'delivered'");
    expect(sql).not.toMatch(/delete\s+from\s+public\.(vehicle_sale_claims|deals|invoices|invoice_payment_ledger)/);
  });

  test('exposes only authenticated, fixed-search-path mutation RPCs', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
    for (const fn of [
      'create_sale_correction_case', 'transition_sale_correction_case',
      'record_sale_correction_refund', 'complete_sale_correction_inspection',
      'resolve_sale_correction_ownership', 'confirm_sale_correction_restock',
      'resolve_sale_correction_external_procedure',
    ]) {
      expect(sql).toContain(`function public.${fn}`);
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
    expect(sql.match(/security definer\s+set search_path\s*=\s*public,\s*pg_temp/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
    expect(sql).not.toMatch(/grant execute on function public\.[^(]+\([^;]+\) to anon/);
  });

  test('refund, ownership and audit remain append-only and restock is explicit', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
    expect(sql).toContain('create table if not exists public.sale_correction_refunds');
    expect(sql).toContain('create table if not exists public.customer_vehicle_ownership_history');
    expect(sql).toContain('create table if not exists public.sale_correction_events');
    expect(sql).toContain('g4b_append_only_guard');
    expect(sql).toContain("v_case.vehicle_inspection_status <> 'completed'");
    expect(sql).toContain("v_case.status <> 'processing'");
    expect(sql).toContain("update public.vehicles set status='在庫中'");
  });

  test('suppresses unsent follow-up candidates without external communication', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
    expect(sql).toContain('g4b_block_followup_candidate');
    expect(sql).toContain("status='skipped'");
    expect(sql).toContain("status='pending'");
    expect(sql).not.toContain('http_post');
    expect(sql).not.toContain('net.http');
  });

  test('real route handler maps sanitized business outcomes', async () => {
    const createRoute = await readFile(path.join(root, 'src/app/api/sale-corrections/route.ts'), 'utf8');
    const actionRoute = await readFile(path.join(root, 'src/app/api/sale-corrections/[caseId]/actions/route.ts'), 'utf8');
    expect(createRoute).toContain("rpc('create_sale_correction_case'");
    expect(actionRoute).toContain("rpc('transition_sale_correction_case'");
    expect(actionRoute).toContain("rpc('record_sale_correction_refund'");
    expect(actionRoute).not.toMatch(/error\.message|error\.details|error\.hint/);
  });

  test('G3 reapply accepts only explicit G4-B restock history', async () => {
    const sql = (await readFile(g3MigrationPath, 'utf8')).toLowerCase();
    const g4bSql = (await readFile(migrationPath, 'utf8')).toLowerCase();
    expect(sql).toContain("to_regclass('public.sale_correction_cases')");
    expect(sql).toContain("c.restock_status = 'completed'");
    expect(sql).toContain('c.original_sale_claim_id');
    expect(sql).toContain("raise exception 'g3_precheck_duplicate_active_sale'");
    expect(sql).toContain("raise exception 'g3_precheck_inconsistent_sale_status'");
    expect(g4bSql).toContain("to_regclass('public.sale_correction_cases')");
    expect(g4bSql).toContain("correction.restock_status='completed'");
  });
});
