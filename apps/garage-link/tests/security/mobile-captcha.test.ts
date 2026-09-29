import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/auth/mobile-captcha/route';

const originalEnabled = process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION;
const originalKey = process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY;
test.afterEach(() => {
  if (originalEnabled === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION;
  else process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION = originalEnabled;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY;
  else process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY = originalKey;
});
test('disabled config is explicit and not cached', async () => {
  process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION = 'false';
  const response = GET(new NextRequest('https://app.example.invalid/api/auth/mobile-captcha?format=config'));
  expect(await response.json()).toEqual({ enabled: false, siteKey: null });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
test('enabled CAPTCHA without a configured valid key fails closed', async () => {
  process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION = 'true';
  for (const key of ['', '</script><script>alert(1)</script>']) {
    process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY = key;
    expect(GET(new NextRequest('https://app.example.invalid/api/auth/mobile-captcha')).status).toBe(503);
  }
});
test('challenge bridge exposes only CAPTCHA and has a restricted CSP', async () => {
  process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION = 'true';
  process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY = 'synthetic-public-site-key';
  const response = GET(new NextRequest('https://app.example.invalid/api/auth/mobile-captcha'));
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain('captcha-token');
  expect(html).toContain('captcha-expired');
  expect(html).toContain('captcha-error');
  expect(html).not.toMatch(/access_token|refresh_token|password|signIn|supabase/i);
  expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  expect(response.headers.get('Content-Security-Policy')).not.toContain("script-src 'unsafe-inline'");
});
