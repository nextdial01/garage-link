import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  adminAccessCookieValue,
  hasAdministratorRole,
  loginIdentityHash,
  verifyAdminAccessCookie,
} from '../../src/lib/security/adminAccess';

test.describe('Stripe security controls', () => {
  test('login and administrator lockouts are atomic and MFA is enforced in PostgREST', async () => {
    const [migration, enforcement, loginRoute, adminRoute, middleware, mfaForm, logout] = await Promise.all([
      readFile('supabase/migrations/20260722000200_auth_security_hardening.sql', 'utf8'),
      readFile('supabase/migrations/20260722000300_enforce_administrator_aal2.sql', 'utf8'),
      readFile('src/app/api/auth/password-login/route.ts', 'utf8'),
      readFile('src/app/api/security/admin-access/route.ts', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
      readFile('src/app/security/mfa/MfaForm.tsx', 'utf8'),
      readFile('src/app/logout/page.tsx', 'utf8'),
    ]);

    expect(migration).toContain('create table if not exists public.auth_login_attempts');
    expect(migration).toContain('on conflict (identity_hash) do update');
    expect(migration).toContain('least(10, attempts.failed_attempts + 1)');
    expect(migration).toContain('record_admin_access_failure');
    expect(enforcement).toContain('pgrst.db_pre_request');
    expect(enforcement).toContain("coalesce(jwt ->> 'aal', 'aal1') <> 'aal2'");

    expect(loginRoute).toContain("service.rpc('get_login_lock'");
    expect(loginRoute).toContain("service.rpc('record_login_failure'");
    expect(loginRoute).toContain("service.rpc('clear_login_failures'");
    expect(middleware).toContain("'/api/auth/password-login'");

    expect(adminRoute).toContain("service.rpc('record_admin_access_failure'");
    expect(adminRoute).toContain("service.rpc('clear_admin_access_failures'");
    expect(adminRoute).toContain("service.from('memberships')");
    expect(adminRoute).toContain("service.from('store_members')");
    expect(adminRoute).not.toContain("userClient.from<{ role: string | null }>('memberships')");
    expect(adminRoute).toContain('export async function DELETE');
    expect(logout).toContain("method: 'DELETE'");

    expect(middleware).toContain("const postAuthPath = isSecurityGate(pathname)");
    expect(middleware.indexOf('shouldCheckAdminSecurity')).toBeLessThan(
      middleware.indexOf('const postAuthPath'),
    );

    expect(mfaForm).toContain('factors.data.all.filter');
    expect(mfaForm).toContain('supabase.auth.mfa.unenroll');
    expect(mfaForm).toContain('pendingFactorPreparation');
  });

  test('administrator session cookie is signed, user-bound and tamper-resistant', async () => {
    const secret = 'test-secret-with-at-least-32-random-characters';
    const token = await adminAccessCookieValue(secret, 'user-1');

    expect(await verifyAdminAccessCookie(secret, 'user-1', token)).toBe(true);
    expect(await verifyAdminAccessCookie(secret, 'user-2', token)).toBe(false);
    expect(await verifyAdminAccessCookie(secret, 'user-1', token + 'tampered')).toBe(false);
    expect(await loginIdentityHash(secret, ' OWNER@example.com ')).toBe(
      await loginIdentityHash(secret, 'owner@example.com'),
    );
    expect(await loginIdentityHash(secret, 'owner@example.com')).not.toBe(
      await loginIdentityHash(secret, 'other@example.com'),
    );
  });

  test('administrator role remains valid when one optional role source is unavailable', () => {
    expect(hasAdministratorRole(
      { data: null, error: new Error('permission denied') },
      { data: [{ role: 'owner' }], error: null },
    )).toBe(true);

    expect(hasAdministratorRole(
      { data: null, error: new Error('permission denied') },
      { data: [{ role: 'staff' }], error: null },
    )).toBe(false);

    expect(hasAdministratorRole(
      { data: null, error: new Error('permission denied') },
      { data: null, error: new Error('permission denied') },
    )).toBe(false);
  });
});
