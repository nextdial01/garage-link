import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const MIGRATION = 'supabase/migrations/20260728000100_high_remediation_batch.sql';

test.describe('G7 unresolved High remediation contracts', () => {
  test('AUTH-002 and MEMBER-001 keep memberships canonical and accept invites safely', async () => {
    const [sql, membersPage, acceptPage, middleware] = await Promise.all([
      readFile(MIGRATION, 'utf8'),
      readFile('src/app/settings/members/page.tsx', 'utf8'),
      readFile('src/app/membership/accept/page.tsx', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
    ]);
    expect(sql).toContain('revoke insert,update,delete on public.store_members');
    expect(sql).toContain('insert into public.membership_store_assignments');
    expect(sql).not.toContain('insert into public.store_members(');
    expect(membersPage).toContain('/membership/accept#membership=');
    expect(membersPage).toContain('&token=');
    expect(acceptPage).toContain("supabase.rpc('accept_membership_invite'");
    expect(acceptPage).toContain("window.history.replaceState(null, '', '/membership/accept')");
    expect(middleware).toContain("'/membership/accept'");
  });

  test('BILL-001/BILL-002 serialize quotas and prohibit unscoped direct metadata writes', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("tg_table_name = 'memberships'");
    expect(sql).toContain('revoke insert on public.stores from anon,authenticated');
    expect(sql).toContain('drop policy if exists "stores_insert_authenticated"');
    expect(sql).toContain('alter table public.uploaded_files alter column tenant_id set not null');
    expect(sql).toContain("path like ('tenants/' || tenant_id::text || '/stores/' || store_id::text || '/%')");
    expect(sql).toContain('revoke insert, update, delete on public.uploaded_files');
  });

  test('PII-001 uses restrictive RLS visibility and keeps trash admin-scoped', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    expect(sql).toContain('as restrictive for select to authenticated');
    expect(sql).toContain('deleted_at is null');
    expect(sql).toContain('public.current_user_can_admin_store(store_id)');
  });

  test('SERVICE-001 and INVENTORY-001 use atomic idempotent RPCs and immutable snapshots', async () => {
    const [sql, maintenance, inventoryNew, inventoryDetail] = await Promise.all([
      readFile(MIGRATION, 'utf8'),
      readFile('src/app/maintenance/[id]/page.tsx', 'utf8'),
      readFile('src/app/inventory-counts/new/page.tsx', 'utf8'),
      readFile('src/app/inventory-counts/[id]/page.tsx', 'utf8'),
    ]);
    expect(sql).toContain('create or replace function public.cancel_maintenance_job');
    expect(sql).toContain('stock_adjusted=true');
    expect(sql).toContain('repair_part_stock_movements_operation_uidx');
    expect(sql).toContain('inventory_counts_one_active_store_uidx');
    expect(sql).toContain('inventory_count_items_vehicle_uidx');
    expect(sql).toContain('guard_inventory_count_item_snapshot');
    expect(sql).toContain('create or replace function public.create_inventory_count');
    expect(sql).toContain('create or replace function public.finalize_inventory_count');
    expect(sql).toContain("v_role is null or v_role not in ('owner','admin','staff')");
    expect(maintenance).toContain("supabase.rpc('cancel_maintenance_job'");
    expect(inventoryNew).toContain("supabase.rpc('create_inventory_count'");
    expect(inventoryDetail).toContain("supabase.rpc('finalize_inventory_count'");
    expect(inventoryDetail).not.toContain("from<InventoryItemRow>('inventory_count_items').insert(payload)");
  });

  test('STRIPE-001/002 order events and persist reconciliation state', async () => {
    const [sql, webhook, applyPlan, changePlan] = await Promise.all([
      readFile(MIGRATION, 'utf8'),
      readFile('src/app/api/billing/webhook/route.ts', 'utf8'),
      readFile('src/lib/stripe/applyPlan.ts', 'utf8'),
      readFile('src/app/api/billing/change-plan/route.ts', 'utf8'),
    ]);
    expect(sql).toContain('last_stripe_event_created');
    expect(sql).toContain("'superseded'");
    expect(sql).toContain('create table if not exists public.billing_sync_operations');
    expect(webhook).toContain('stripe_created: event.created');
    expect(applyPlan).toContain("admin.rpc('apply_ordered_stripe_subscription_event'");
    expect(changePlan).toContain("status: 'stripe_applied'");
    expect(changePlan).toContain("'reconciliation_required'");
    expect(changePlan).toContain('{ idempotencyKey }');
    expect(webhook).toContain('applyScheduledPlanIfDue(subscriptionId, event)');
    expect(applyPlan).toContain("onConflict: 'stripe_session_id'");
    expect(applyPlan).toContain('checkout_completion_record_failed');
  });
});
