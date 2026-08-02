import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const MIGRATION = 'supabase/migrations/20260726000100_membership_admission_lock.sql';

test.describe('G1-A membership admission lock', () => {
  test('memberships is the sole authorization source and legacy fallback is removed', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    for (const functionName of [
      'current_user_tenant_ids',
      'current_user_store_ids',
      'current_user_role_for_tenant',
    ]) {
      const start = sql.indexOf(`create or replace function public.${functionName}`);
      expect(start, functionName).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf('$$;', start);
      const body = sql.slice(start, end);
      expect(body).toContain('public.memberships');
      expect(body).not.toContain('public.store_members');
      expect(body).toContain('set search_path = public, pg_temp');
    }
  });

  test('direct writes to both membership tables are revoked', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    expect(sql).toContain('revoke insert, update, delete on public.memberships from anon, authenticated;');
    expect(sql).toContain('revoke insert, update, delete on public.store_members from anon, authenticated;');
    expect(sql).toContain('drop policy if exists "store_members_insert_member_stores_or_self"');
    expect(sql).toContain('drop policy if exists "memberships_insert_admin"');
    expect(sql).toContain('drop policy if exists "memberships_update_admin"');
  });

  test('all SECURITY DEFINER membership RPCs use a fixed search_path and authenticated actor', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const functions = [
      'invite_membership',
      'reissue_membership_invite',
      'accept_membership_invite',
      'cancel_membership_invite',
      'change_membership_role',
      'deactivate_membership',
    ];

    for (const functionName of functions) {
      const start = sql.indexOf(`create or replace function public.${functionName}`);
      expect(start, functionName).toBeGreaterThanOrEqual(0);
      const end = sql.indexOf('$$;', start);
      const body = sql.slice(start, end);
      expect(body).toContain('security definer');
      expect(body).toContain('set search_path = public, pg_temp');
      expect(body).toContain('auth.uid()');
    }
  });

  test('role/status constraints and active-membership uniqueness are enforced', async () => {
    const sql = await readFile(MIGRATION, 'utf8');

    expect(sql).toContain("'owner', 'admin', 'implementer', 'staff', 'viewer'");
    expect(sql).toContain("'active', 'invited', 'suspended', 'cancelled', 'inactive'");
    expect(sql).toContain('create unique index if not exists memberships_one_active_user_per_tenant');
    expect(sql).toContain("where status = 'active' and user_id is not null and deleted_at is null");
  });

  test('the app authorization layer has no store_members fallback or implementer-to-admin promotion', async () => {
    const tenantSource = await readFile('src/lib/auth/tenant.ts', 'utf8');
    const permissionSource = await readFile('src/lib/auth/permissions.ts', 'utf8');

    expect(tenantSource).not.toContain("('store_members')");
    expect(tenantSource).not.toContain("return 'admin';");
    expect(permissionSource).not.toContain("('store_members')");
    expect(permissionSource).toContain('requireActiveGarageStore');
  });

  test('owner precheck is canonical-only and records legacy drift without blocking', async () => {
    const sql = await readFile(MIGRATION, 'utf8');
    const precheckStart = sql.indexOf('-- 正本側の曖昧な行は推測補正せず');
    const precheckEnd = sql.indexOf('alter table public.memberships drop constraint', precheckStart);
    const precheck = sql.slice(precheckStart, precheckEnd);
    const ownerCheckStart = precheck.indexOf("raise exception 'G1A_PRECHECK: active owner");

    expect(precheckStart).toBeGreaterThanOrEqual(0);
    expect(ownerCheckStart).toBeGreaterThanOrEqual(0);
    expect(precheck).toContain("m.role = 'owner'");
    expect(precheck).toContain("m.status = 'active'");
    expect(precheck).toContain('s.id = m.store_id and s.tenant_id = m.tenant_id');
    expect(precheck).toContain('public.store_is_authorization_eligible(s.status)');
    expect(precheck).toContain('G1A_PRECHECK_LEGACY_DRIFT_COUNT');

    const ownerPredicate = precheck.slice(precheck.lastIndexOf('if exists (', ownerCheckStart), ownerCheckStart);
    expect(ownerPredicate).not.toContain('public.store_members');
  });
});
