import { chromium } from '@playwright/test';

const origin = 'http://127.0.0.1:3012';

function sessionValue(token, userId) {
  const session = {
    access_token: token,
    refresh_token: `${token}-refresh`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated' },
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: sessionValue('viewer-token', '50000000-0000-0000-0000-000000000005'),
    domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const response = await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' });
  assert(response?.ok(), 'dashboard did not load');
  const selector = page.locator('select').filter({ has: page.locator('option', { hasText: 'G0 Store A1' }) });
  await selector.waitFor();
  assert(await selector.inputValue() === '51100000-0000-4000-8000-000000000001', 'initial store is not A1');
  assert((await selector.locator('option').allTextContents()).join('|').includes('G0 Store A2'), 'A2 is not selectable');
  assert((await page.getByText('権限: 閲覧のみ').count()) > 0, 'viewer role is not shown');

  await page.route('**/api/stores/active', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  }, { times: 1 });
  const switchResponsePromise = page.waitForResponse((candidate) => candidate.url().endsWith('/api/stores/active'));
  await selector.selectOption('51100000-0000-4000-8000-000000000002');
  await page.getByText('店舗を切り替えています...').waitFor();
  const switchResponse = await switchResponsePromise;
  if (!switchResponse.ok()) {
    throw new Error(`A2 switch failed: ${switchResponse.status()}`);
  }
  await page.waitForFunction(() => document.querySelector('select')?.value === '51100000-0000-4000-8000-000000000002');
  assert(await selector.inputValue() === '51100000-0000-4000-8000-000000000002', 'switch to A2 was not retained');
  await page.reload({ waitUntil: 'networkidle' });
  assert(await selector.inputValue() === '51100000-0000-4000-8000-000000000002', 'reload lost A2 preference');

  const secondTab = await context.newPage();
  await secondTab.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' });
  const secondSelector = secondTab.locator('select').filter({ has: secondTab.locator('option', { hasText: 'G0 Store A1' }) });
  await secondSelector.waitFor();
  assert(await secondSelector.inputValue() === '51100000-0000-4000-8000-000000000002', 'second tab did not resolve A2');
  await selector.selectOption('51100000-0000-4000-8000-000000000001');
  await secondTab.waitForFunction(() => document.querySelector('select')?.value === '51100000-0000-4000-8000-000000000001');
  assert(await secondSelector.inputValue() === '51100000-0000-4000-8000-000000000001', 'cross-tab invalidation did not reload A1');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  assert(await selector.isVisible(), 'store selector is not visible at mobile width');
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!overflows, 'mobile viewport has horizontal page overflow');
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);
  await context.close();

  const inactiveContext = await browser.newContext();
  await inactiveContext.addCookies([{
    name: 'sb-127-auth-token',
    value: sessionValue('inactive-token', '50000000-0000-0000-0000-000000000006'),
    domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
  }]);
  const inactivePage = await inactiveContext.newPage();
  await inactivePage.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' });
  assert(new URL(inactivePage.url()).pathname === '/signup', 'inactive user was not denied');
  await inactiveContext.close();

  console.log('G1D_BROWSER_SMOKE_PASS pc=PASS mobile=PASS tabs=PASS viewer=PASS inactive=PASS console=PASS');
} finally {
  await browser.close();
}
