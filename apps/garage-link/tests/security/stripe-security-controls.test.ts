import { access, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loginIdentityHash } from '../../src/lib/security/authSecurity';

test.describe('Stripe security controls', () => {
  test('login and administrator lockouts are atomic and MFA is enforced in PostgREST', async () => {
    const [migration, enforcement, loginRoute, middleware, mfaForm, removal] = await Promise.all([
      readFile('supabase/migrations/20260722000200_auth_security_hardening.sql', 'utf8'),
      readFile('supabase/migrations/20260722000300_enforce_administrator_aal2.sql', 'utf8'),
      readFile('src/app/api/auth/password-login/route.ts', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
      readFile('src/app/security/mfa/MfaForm.tsx', 'utf8'),
      readFile('supabase/migrations/20260723000100_remove_admin_access_code.sql', 'utf8'),
    ]);

    expect(migration).toContain('create table if not exists public.auth_login_attempts');
    expect(migration).toContain('on conflict (identity_hash) do update');
    expect(migration).toContain('least(10, attempts.failed_attempts + 1)');
    expect(enforcement).toContain('pgrst.db_pre_request');
    expect(enforcement).toContain("coalesce(jwt ->> 'aal', 'aal1') <> 'aal2'");

    expect(loginRoute).toContain("service.rpc('get_login_lock'");
    expect(loginRoute).toContain("service.rpc('record_login_failure'");
    expect(loginRoute).toContain("service.rpc('clear_login_failures'");
    expect(middleware).toContain("'/api/auth/password-login'");

    expect(middleware).not.toContain('admin-access');
    await expect(access('src/app/api/security/admin-access/route.ts')).rejects.toThrow();
    await expect(access('src/app/security/admin-access/page.tsx')).rejects.toThrow();
    expect(removal).toContain('drop table if exists public.admin_access_credentials');

    expect(middleware).toContain("const postAuthPath = isSecurityGate(pathname)");
    expect(middleware.indexOf('shouldCheckAdminSecurity')).toBeLessThan(
      middleware.indexOf('const postAuthPath'),
    );

    expect(mfaForm).toContain('factors.data.all.filter');
    expect(mfaForm).toContain('supabase.auth.mfa.unenroll');
    expect(mfaForm).toContain('pendingFactorPreparation');
  });

  test('login lock identity is normalized and user-bound', async () => {
    const secret = 'test-secret-with-at-least-32-random-characters';
    expect(await loginIdentityHash(secret, ' OWNER@example.com ')).toBe(
      await loginIdentityHash(secret, 'owner@example.com'),
    );
    expect(await loginIdentityHash(secret, 'owner@example.com')).not.toBe(
      await loginIdentityHash(secret, 'other@example.com'),
    );
  });

});
