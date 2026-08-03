import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe('UX acceptance regression contracts', () => {
  test('preview OTP accepts the canonical project alias without weakening preview guards', async () => {
    const [sink, route, context] = await Promise.all([
      readFile('src/lib/security/previewOtpSink.ts', 'utf8'),
      readFile('src/app/api/auth/admin-email-otp/request/route.ts', 'utf8'),
      readFile('src/lib/security/adminEmailOtpServer.ts', 'utf8'),
    ]);
    expect(sink).toContain('VERCEL_PROJECT_PRODUCTION_URL');
    expect(sink).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(sink).toContain("process.env.NODE_ENV === 'production'");
    expect(sink).toContain('requestHost');
    expect(route).toContain('getPreviewUxAcceptanceAdminContext(request)');
    expect(context).toContain("'[UX QA 20260803]'");
    expect(context).toContain("endsWith('.invalid')");
    expect(context).toContain(".from('memberships')");
    expect(context).toContain('memberships.length !== 1');
    expect(context).toContain('startsWith(UX_ACCEPTANCE_FIXTURE_PREFIX)');
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
});
