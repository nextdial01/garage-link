import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const migrationPath = 'supabase/migrations/20260727000200_accounting_state_integrity.sql';

test.describe('G4-A accounting state integrity', () => {
  test('payment ledger is append-only and reversal references the original payment', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists public.invoice_payment_ledger');
    expect(sql).toContain("entry_type in ('payment','reversal','refund')");
    expect(sql).toContain('original_payment_id');
    expect(sql).toContain('create or replace function public.guard_payment_ledger_append_only');
    expect(sql).toContain('revoke all on public.invoice_payment_ledger from public,anon,authenticated');
  });

  test('issued invoice and items cannot be directly overwritten', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('create or replace function public.guard_invoice_accounting_state');
    expect(sql).toContain('create or replace function public.guard_invoice_item_accounting_state');
    expect(sql).toContain('G4A_ISSUED_INVOICE_IMMUTABLE');
    expect(sql).toContain('G4A_PAYMENT_TOTAL_RPC_ONLY');
  });

  test('accounting mutations are atomic RPCs with role, scope, locks and idempotency', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    for (const fn of ['issue_garage_invoice', 'void_garage_invoice', 'record_garage_payment', 'record_garage_payment_reversal']) {
      expect(sql).toContain(`create or replace function public.${fn}`);
    }
    expect(sql).toContain('for update');
    expect(sql).toContain('current_user_store_role');
    expect(sql).toContain('accounting_operations');
    expect(sql).toContain('IDEMPOTENCY_CONFLICT');
    expect(sql).toContain('REFUND_EXCEEDS_PAYMENT');
  });

  test('sale cancellation voids unpaid issued invoice and refuses paid or delivered sales', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('create or replace function public.cancel_vehicle_sale');
    expect(sql).toContain('PAYMENT_EXISTS');
    expect(sql).toContain('DELIVERED_CANNOT_CANCEL');
    expect(sql).toContain("issue_status='cancelled'");
    expect(sql).toContain("status='void'");
  });

  test('sale claim snapshots one used quote and expires competing vehicle quotes', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('quote_id uuid');
    expect(sql).toContain('create or replace function public.capture_sale_quote_snapshot');
    expect(sql).toContain('G4A_QUOTE_SELECTION_REQUIRED');
    expect(sql).toContain("status='expired'");
  });

  test('Route Handlers use session actor and RPCs instead of direct accounting writes', async () => {
    const paths = [
      'src/app/api/invoices/[invoiceId]/issue/route.ts',
      'src/app/api/invoices/[invoiceId]/void/route.ts',
      'src/app/api/invoices/[invoiceId]/payments/route.ts',
      'src/app/api/payments/[paymentId]/reversals/route.ts',
    ];
    const routes = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
    for (const route of routes) {
      expect(route).toContain('supabase.auth.getUser()');
      expect(route).toContain('.rpc(');
      expect(route).not.toMatch(/\.from\(['"](?:invoices|invoice_payment_ledger)['"]\)[\s\S]*?\.\s*(?:insert|update|delete)/);
    }
  });

  test('user-facing invoice screens do not directly mutate issued status or paid totals', async () => {
    const detail = await readFile('src/app/invoices/[id]/page.tsx', 'utf8');
    const deal = await readFile('src/app/deals/[id]/page.tsx', 'utf8');
    const create = await readFile('src/app/deals/[id]/invoices/new/page.tsx', 'utf8');
    expect(detail).toContain('/payments`');
    expect(detail).toContain('/issue`');
    expect(detail).toContain('/void`');
    expect(detail).not.toMatch(/\.update\(\{[\s\S]{0,400}(?:paid_amount|issue_status|status: editStatus)/);
    expect(deal).toContain('/void`');
    expect(create).toContain("issue_status: 'draft'");
    expect(create).toContain('/issue`');
  });
});
