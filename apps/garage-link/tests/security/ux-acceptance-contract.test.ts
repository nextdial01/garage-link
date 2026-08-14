import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { hasValidStagingReleaseQaRunBinding, isControlledStagingReleaseQaRuntime } from '../../src/lib/security/stagingReleaseQaHost';

test.describe('UX acceptance regression contracts', () => {
  test('preview OTP accepts only the controlled Staging hosts and a valid release-QA binding', async () => {
    const [source, serverContext, sharedContract, migration] = await Promise.all([
      readFile('src/lib/security/previewOtpSink.ts', 'utf8'),
      readFile('src/lib/security/adminEmailOtpServer.ts', 'utf8'),
      readFile('src/lib/security/stagingReleaseQaHost.ts', 'utf8'),
      readFile('supabase/qa/migrations/20260803000100_ux_acceptance_admin_bootstrap.sql', 'utf8'),
    ]);
    expect(source).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(source).toContain('requestHostname');
    expect(source).toContain('isControlledStagingReleaseQaRuntime');
    expect(serverContext).toContain('isControlledStagingReleaseQaRuntime');
    expect(serverContext).toContain('hasValidStagingReleaseQaRunBinding');
    expect(sharedContract).toContain("STAGING_RELEASE_QA_CONTROLLED_HOST = 'staging.garage-link.tech'");
    expect(sharedContract).toContain('STAGING_RELEASE_QA_VERCEL_HOST');
    expect(sharedContract).toContain("runtime.nodeEnv === 'production'");
    expect(serverContext).toContain("'ux_acceptance_admin_bootstrap_context'");
    expect(serverContext).toContain("'admin_email_otp_bootstrap_context'");
    expect(serverContext).toContain('const releaseQaRequest = options.requireReleaseQa && isStagingReleaseQaRequest(request);');
    expect(serverContext).toContain('bearer ? supabase.auth.getUser(bearer) : supabase.auth.getUser()');
    expect(serverContext).toContain('bearer ? supabase.auth.getClaims(bearer) : supabase.auth.getClaims()');
    expect(serverContext).toContain('releaseQaRequest && !hasValidStagingReleaseQaRunBinding(user.app_metadata?.release_qa_run_id)');
    expect(migration).toContain('ux_acceptance_admin_bootstrap_context');
    expect(migration).toContain("p_environment <> 'preview'");
    expect(migration).toContain("raw_app_meta_data ->> 'purpose'");
    expect(migration).not.toContain("coalesce(u.raw_user_meta_data ->> 'purpose'");
    expect(migration).toContain("ux-acceptance-20260803");
    expect(migration).toContain("t.name like '[UX QA 20260803]%'");
    expect(migration).toContain("s.name = '[UX QA 20260803] 受入監査店'");
    expect(migration).toContain("lower(coalesce(u.email, '')) ~ '@[^@]+\\.invalid$'");
    expect(migration).not.toContain("@[^@]+\\\\.invalid$");
    expect(migration).toContain('revoke all on function public.ux_acceptance_admin_bootstrap_context');
    expect(migration).toContain('grant execute on function public.ux_acceptance_admin_bootstrap_context');
    expect(migration).toContain('ux_acceptance_prepare_store');
    expect(migration).toContain('set onboarding_completed_at = coalesce');

    const validRuntime = {
      projectId: 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3',
      vercelEnv: 'preview',
      nodeEnv: 'production',
      previewOtpSecret: 'x'.repeat(32),
    };
    const validRunId = '550e8400-e29b-41d4-a716-446655440000';
    expect(isControlledStagingReleaseQaRuntime({ ...validRuntime, hostname: 'garage-link-staging-abc.vercel.app' })).toBe(true);
    expect(isControlledStagingReleaseQaRuntime({ ...validRuntime, hostname: 'staging.garage-link.tech' })).toBe(true);
    expect(hasValidStagingReleaseQaRunBinding(validRunId)).toBe(true);
    for (const hostname of ['garage-link.tech', 'www.garage-link.tech', 'qa.staging.garage-link.tech', 'localhost', 'unrelated.vercel.app']) {
      expect(isControlledStagingReleaseQaRuntime({ ...validRuntime, hostname })).toBe(false);
    }
    expect(isControlledStagingReleaseQaRuntime({ ...validRuntime, hostname: 'staging.garage-link.tech', vercelEnv: 'production' })).toBe(false);
    expect(hasValidStagingReleaseQaRunBinding(undefined)).toBe(false);
  });

  test('shared modal owns the complete portal and focus-management contract', async () => {
    const source = await readFile('src/components/ui/Modal.tsx', 'utf8');
    expect(source).toContain('createPortal');
    expect(source).toContain('document.body');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain('previouslyFocusedElement');
    expect(source).toContain('document.body.style.overflow');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('max-h-[calc(100dvh-32px)]');
    expect(source).toContain('env(safe-area-inset-bottom)');
  });

  test('destructive workflows use the accessible action dialog instead of native browser prompts', async () => {
    const paths = [
      'src/components/ui/actionDialog.tsx',
      'src/app/settings/trash/page.tsx',
      'src/app/invoices/[id]/page.tsx',
      'src/app/deals/[id]/page.tsx',
      'src/app/maintenance/[id]/page.tsx',
      'src/app/line/_components/LineRecordDetailPage.tsx',
      'src/app/line/_components/LineCrudPage.tsx',
    ];
    const sources = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
    expect(sources[0]).toContain("import Modal from './Modal'");
    expect(sources[0]).toContain('minLength');
    expect(sources.join('\n')).not.toMatch(/window\.(?:confirm|prompt)\s*\(|(?<![\w.])confirm\s*\(/);
  });

  test('Vercel toolbar asset is public only on an exact Preview path', async () => {
    const source = await readFile('src/middleware.ts', 'utf8');
    expect(source).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(source).toContain("/^\\/[a-f0-9]{16}\\/script\\.js$/");
    expect(source).not.toContain("pathname.endsWith('/script.js')");
  });
});
