import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe('UX acceptance regression contracts', () => {
  test('preview OTP accepts the canonical project alias without weakening preview guards', async () => {
    const source = await readFile('src/lib/security/previewOtpSink.ts', 'utf8');
    expect(source).toContain('VERCEL_PROJECT_PRODUCTION_URL');
    expect(source).toContain("process.env.VERCEL_ENV === 'preview'");
    expect(source).toContain("process.env.NODE_ENV === 'production'");
    expect(source).toContain('requestHost');
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
