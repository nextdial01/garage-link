import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe('UX acceptance regression contracts', () => {
  test('preview OTP accepts the canonical project alias without weakening preview guards', async () => {
    const [source, serverContext, migration] = await Promise.all([
      readFile('src/lib/security/previewOtpSink.ts', 'utf8'),
      readFile('src/lib/security/adminEmailOtpServer.ts', 'utf8'),
      readFile('supabase/migrations/20260803000100_ux_acceptance_admin_bootstrap.sql', 'utf8'),
    ]);
    expect(source).toContain('VERCEL_PROJECT_PRODUCTION_URL');
    expect(source).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(source).toContain("process.env.NODE_ENV === 'production'");
    expect(source).toContain('requestHost');
    expect(serverContext).toContain("'ux_acceptance_admin_bootstrap_context'");
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
});
