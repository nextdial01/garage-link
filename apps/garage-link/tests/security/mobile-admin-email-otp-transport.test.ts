import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extractAdminEmailOtpBearer } from '../../src/lib/security/adminEmailOtpTransport';

test.describe('native administrator email OTP transport', () => {
  test('accepts one syntactically valid bearer only when the route opts in', () => {
    expect(extractAdminEmailOtpBearer('Bearer native-session-token', true)).toBe('native-session-token');
    expect(extractAdminEmailOtpBearer('bearer native-session-token', true)).toBe('native-session-token');
    expect(extractAdminEmailOtpBearer('Bearer token with spaces', true)).toBeUndefined();
    expect(extractAdminEmailOtpBearer('Basic credentials', true)).toBeUndefined();
    expect(extractAdminEmailOtpBearer(null, true)).toBeUndefined();
    expect(extractAdminEmailOtpBearer('Bearer native-session-token', false)).toBeUndefined();
  });

  test('both OTP routes opt in, and the server fails closed before the service RPC', async () => {
    const [context, requestRoute, verifyRoute] = await Promise.all([
      readFile('src/lib/security/adminEmailOtpServer.ts', 'utf8'),
      readFile('src/app/api/auth/admin-email-otp/request/route.ts', 'utf8'),
      readFile('src/app/api/auth/admin-email-otp/verify/route.ts', 'utf8'),
    ]);

    expect(requestRoute).toContain('allowBearer: true');
    expect(verifyRoute).toContain('allowBearer: true');
    expect(context).toContain('supabase.auth.getUser(bearer)');
    expect(context).toContain('supabase.auth.getClaims(bearer)');
    expect(context).toContain("service.rpc('admin_email_otp_bootstrap_context'");
    expect(context).toContain("!['owner', 'admin', 'implementer'].includes(String(context.role))");
    expect(context).toContain('context.user_id !== user.id');
    expect(context).toContain('context.email !== user.email.toLowerCase()');
  });
});
