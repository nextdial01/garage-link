import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  controlledEmailCallbackUrl,
  controlledEmailConfirmationRedirect,
  parseControlledEmailConfirmation,
} from '../../src/lib/auth/controlledEmailConfirmation';

const runId = '550e8400-e29b-41d4-a716-446655440000';
const callback = `/auth/callback?next=${encodeURIComponent(`/signup?resume=1&qa_run=${runId}`)}&qa_run=${runId}`;

test.describe('controlled Auth email contract', () => {
  test('uses a GARAGE LINK confirmation entry and preserves the callback continuation', () => {
    const callbackUrl = controlledEmailCallbackUrl(
      'https://staging.garage-link.tech',
      `/signup?resume=1&qa_run=${runId}`,
      runId,
    );
    const redirect = controlledEmailConfirmationRedirect(
      'https://staging.garage-link.tech',
      `${callbackUrl.pathname}${callbackUrl.search}`,
    );
    const parsed = new URL(redirect);
    expect(parsed.origin).toBe('https://staging.garage-link.tech');
    expect(parsed.pathname).toBe('/auth/confirm');
    expect(parsed.searchParams.get('next')).toBe(`${callbackUrl.pathname}${callbackUrl.search}`);
    expect(callbackUrl.origin).toBe('https://staging.garage-link.tech');
    expect(() => controlledEmailConfirmationRedirect('https://preview.vercel.app', callback)).toThrow('CONTROLLED_EMAIL_CONFIRM_ORIGIN_INVALID');
    expect(() => controlledEmailConfirmationRedirect('http://staging.garage-link.tech', callback)).toThrow('CONTROLLED_EMAIL_CONFIRM_ORIGIN_INVALID');
  });

  test('accepts only a TokenHash confirmation with a matching safe continuation', () => {
    const parsed = parseControlledEmailConfirmation({
      tokenHash: 'A'.repeat(48),
      type: 'email',
      next: callback,
    });
    expect(parsed).toEqual({ tokenHash: 'A'.repeat(48), type: 'email', next: callback });
    expect(parseControlledEmailConfirmation({ tokenHash: 'A'.repeat(48), type: 'email', next: '/auth/callback?next=%2Fdashboard' })).toBeNull();
    expect(parseControlledEmailConfirmation({ tokenHash: 'A'.repeat(48), type: 'recovery', next: callback })).toBeNull();
    expect(parseControlledEmailConfirmation({ tokenHash: 'not-a-valid-token', type: 'email', next: callback })).toBeNull();
  });

  test('keeps GET scanner-safe and performs server-side verifyOtp only after explicit POST', async () => {
    const [page, route, middleware, confirmation, recovery, config] = await Promise.all([
      readFile('src/app/auth/confirm/page.tsx', 'utf8'),
      readFile('src/app/api/auth/confirm/route.ts', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
      readFile('supabase/templates/confirmation.html', 'utf8'),
      readFile('supabase/templates/recovery.html', 'utf8'),
      readFile('supabase/config.toml', 'utf8'),
    ]);
    expect(page).toContain('action="/api/auth/confirm" method="post"');
    expect(page).toContain('GET never consumes the token');
    expect(page).toContain('robots: { index: false, follow: false }');
    expect(route).toContain('supabase.auth.verifyOtp');
    expect(route).toContain('NextResponse.redirect(new URL(confirmation.next, request.url), 303)');
    expect(route).not.toContain('console.log');
    expect(middleware).toContain("'/auth/confirm'");
    expect(middleware).toContain("'/api/auth/confirm'");
    for (const template of [confirmation, recovery]) {
      expect(template).toContain('{{ .RedirectTo }}');
      expect(template).toContain('{{ .TokenHash }}');
      expect(template).not.toContain('{{ .ConfirmationURL }}');
    }
    expect(config).toContain('[auth.email.template.confirmation]');
    expect(config).toContain('[auth.email.template.recovery]');
  });
});
