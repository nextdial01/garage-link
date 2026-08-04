import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const route = 'src/app/staging-preview/route.ts';
const migration = 'supabase/qa/migrations/20260804120000_owner_preview_contract.sql';
const resetRoute = 'src/app/api/staging-preview/reset/route.ts';

test.describe('staging owner preview contract', () => {
  test('uses the staging-only guard and never returns a magic-link token', async () => {
    const source = await readFile(route, 'utf8');
    expect(source).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(source).toContain("STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3'");
    expect(source).toContain("STAGING_REF = 'gaytoojzwqkpuvfofeql'");
    expect(source).toContain("!supabaseUrl.includes('wmlpuzuskfiwdipluglz')");
    expect(source).toContain("host !== 'garage-link.tech'");
    expect(source).toContain("admin.auth.admin.generateLink");
    expect(source).toContain("supabase.auth.verifyOtp");
    expect(source).not.toContain('action_link');
    expect(source).not.toContain('access_token');
    expect(source).not.toContain('refresh_token');
    expect(source).toContain("NextResponse.json({ error: 'Not Found' }, { status: 404 })");
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
    expect(source).toContain("process.env.VERCEL_PROJECT_ID !== PROJECT_ID");
    expect(source).toContain("metadata?.purpose !== PURPOSE");
    expect(source).toContain("qa_owner_preview_reset_fixture");
    expect(source).toContain("admin.auth.admin.deleteUser(user.id, false)");
    expect(source).toContain("response.cookies.delete('garage_owner_preview')");
  });
});
