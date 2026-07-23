import { access, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loginIdentityHash } from '../../src/lib/security/authSecurity';
import {
  createTrustedDeviceCookieValue,
  otpHash,
  readTrustedDeviceCookieValue,
} from '../../src/lib/security/adminEmailOtp';

test.describe('Stripe security controls', () => {
  test('login lockout and administrator email OTP are enforced in PostgREST', async () => {
    const [migration, emailOtp, loginRoute, middleware, otpForm, removal] = await Promise.all([
      readFile('supabase/migrations/20260722000200_auth_security_hardening.sql', 'utf8'),
      readFile('supabase/migrations/20260723000300_admin_email_otp.sql', 'utf8'),
      readFile('src/app/api/auth/password-login/route.ts', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
      readFile('src/app/security/email-otp/EmailOtpForm.tsx', 'utf8'),
      readFile('supabase/migrations/20260723000100_remove_admin_access_code.sql', 'utf8'),
    ]);

    expect(migration).toContain('create table if not exists public.auth_login_attempts');
    expect(migration).toContain('on conflict (identity_hash) do update');
    expect(migration).toContain('least(10, attempts.failed_attempts + 1)');
    expect(emailOtp).toContain('create table if not exists public.admin_email_otp_challenges');
    expect(emailOtp).toContain('create table if not exists public.admin_trusted_sessions');
    expect(emailOtp).toContain("interval '10 minutes'");
    expect(emailOtp).toContain("interval '30 days'");
    expect(emailOtp).toContain("coalesce(jwt ->> 'aal', 'aal1') <> 'aal2'");
    expect(emailOtp).toContain("pgrst.db_pre_request = 'public.enforce_administrator_email_otp'");

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

    expect(otpForm).toContain("fetch('/api/auth/admin-email-otp/request'");
    expect(otpForm).toContain("fetch('/api/auth/admin-email-otp/verify'");
    expect(otpForm).toContain('この端末では、確認後30日間');
    await expect(access('src/app/security/mfa/MfaForm.tsx')).rejects.toThrow();
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

  test('trusted-device cookie is signed, user/session bound, and expiring', async () => {
    const secret = 'test-secret-with-at-least-32-random-characters';
    const payload = { userId: 'user-a', sessionId: 'session-a', token: 'device-token', expiresAt: Date.now() + 60_000 };
    const cookie = await createTrustedDeviceCookieValue(secret, payload);
    expect(await readTrustedDeviceCookieValue(secret, cookie, 'user-a', 'session-a')).toEqual(payload);
    expect(await readTrustedDeviceCookieValue(secret, cookie, 'user-b', 'session-a')).toBeNull();
    expect(await readTrustedDeviceCookieValue(secret, cookie, 'user-a', 'session-b')).toBeNull();
    expect(await readTrustedDeviceCookieValue(secret, `${cookie}x`, 'user-a', 'session-a')).toBeNull();
    const expired = await createTrustedDeviceCookieValue(secret, { ...payload, expiresAt: Date.now() - 1 });
    expect(await readTrustedDeviceCookieValue(secret, expired, 'user-a', 'session-a')).toBeNull();
    expect(await otpHash(secret, 'user-a', 'session-a', '123456')).not.toBe(
      await otpHash(secret, 'user-a', 'session-b', '123456'),
    );
  });

});
