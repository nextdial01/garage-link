import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const route = 'src/app/staging-preview/route.ts';
const migration = 'supabase/qa/migrations/20260804130008_owner_preview_contract.sql';
const resetRoute = 'src/app/api/staging-preview/reset/route.ts';

test.describe('staging owner preview contract', () => {
  test('uses the staging-only guard and never returns a magic-link token', async () => {
    const source = await readFile(route, 'utf8');
    expect(source).toContain('isStagingOwnerPreviewRequest');
    const guard = await readFile('src/lib/security/stagingOwnerPreview.ts', 'utf8');
    expect(guard).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(guard).toContain("STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3'");
    expect(guard).toContain("STAGING_REF = 'gaytoojzwqkpuvfofeql'");
    expect(guard).toContain("!url.includes(PRODUCTION_REF)");
    expect(guard).toContain("host !== 'garage-link.tech'");
    expect(source).toContain("admin.auth.admin.generateLink");
    expect(source).toContain("supabase.auth.verifyOtp");
    expect(source).toContain('readSessionClaims(verified.data.session)');
    expect(source).toContain("admin.from('admin_trusted_sessions').upsert");
    expect(source).toContain('deviceTokenHash');
    expect(source).toContain('createTrustedDeviceCookieValue');
    expect(source).toContain('ADMIN_EMAIL_OTP_COOKIE');
    expect(source).toContain('trustedDeviceCookieOptions');
    expect(source).toContain('OWNER_PREVIEW_TRUSTED_SESSION_FAILED');
    expect(source).not.toContain('action_link');
    expect(source).not.toContain('NextResponse.json({ access_token');
    expect(source).not.toContain('NextResponse.json({ refresh_token');
    expect(source).toContain("NextResponse.json({ error: 'Not Found' }, { status: 404 })");
    expect(source).toContain("const temporaryPassword = `${crypto.randomUUID()}Aa1!`");
    expect(source).not.toContain('randomUUID()}-${crypto.randomUUID()');
    expect(source).toContain('OWNER_PREVIEW_LIST_USERS_FAILED');
    expect(source).toContain('OWNER_PREVIEW_CREATE_USER_FAILED');
    expect(source).toContain('OWNER_PREVIEW_FIXTURE_FAILED');
    expect(source).toContain('OWNER_PREVIEW_GENERATE_LINK_FAILED');
    expect(source).toContain('OWNER_PREVIEW_VERIFY_OTP_FAILED');
    expect(source).toContain("console.error(`[${code}]`)");
    expect(source).not.toContain("console.error(error");
    const passwordExpression = source.match(/const temporaryPassword = `\$\{crypto\.randomUUID\(\)\}([^`]*)`/);
    expect(passwordExpression?.[1]).toBe('Aa1!');
    expect(36 + Buffer.byteLength(passwordExpression?.[1] ?? '')).toBeLessThan(72);
    expect(passwordExpression?.[1]).toMatch(/[A-Z]/);
    expect(passwordExpression?.[1]).toMatch(/[a-z]/);
    expect(passwordExpression?.[1]).toMatch(/[0-9]/);
    expect(passwordExpression?.[1]).toMatch(/[^A-Za-z0-9]/);
  });

  test('keeps owner fixture operations service-role-only and environment-bound', async () => {
    const source = await readFile(migration, 'utf8');
    expect(source).toContain("purpose = 'owner-preview'");
    expect(source).toContain("project_ref = 'gaytoojzwqkpuvfofeql'");
    expect(source).toContain("environment = 'preview'");
    expect(source).toContain('qa_owner_preview_ensure_fixture');
    expect(source).toContain('qa_owner_preview_reset_fixture');
    expect(source).toContain('qa_owner_preview_status');
    expect(source.match(/grant execute on function public\.qa_owner_preview_/g)?.length).toBe(3);
    expect(source).toContain("from public,anon,authenticated");
    expect(source).toContain("raise exception 'OWNER_PREVIEW_FIXTURE_MISMATCH'");
  });

  test('reset route is staging-only and identifies the synthetic owner exactly', async () => {
    const source = await readFile(resetRoute, 'utf8');
    expect(source).toContain('isStagingOwnerPreviewRequest');
    expect(source).toContain('metadata?.purpose !== OWNER_PREVIEW_PURPOSE');
    expect(source).toContain('metadata?.marker !== OWNER_PREVIEW_MARKER');
    expect(source).toContain("qa_owner_preview_reset_fixture");
    expect(source).toContain("admin.auth.admin.deleteUser(user.id, false)");
    expect(source).toContain("response.cookies.delete('garage_owner_preview')");
    expect(source).toContain("response.cookies.delete('garage_admin_email_verified')");
  });
});
