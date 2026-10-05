import { expect, test } from '@playwright/test';
const routes = ['/', '/features', '/pricing', '/faq', '/demo', '/industries/used-car', '/industries/motorcycle', '/industries/maintenance', '/login', '/signup', '/legal/terms', '/legal/privacy', '/legal/tokusho', '/forgot-password', '/help', '/solutions/used-car-inventory-management', '/solutions/maintenance-customer-management'];
const jargon = /\b(E2E|S2S|Production|staging|QA|webhook|internal|test gate|release gate)\b/i;
for (const width of [1440, 390]) {
  test(`all reachable public pages use one beginner-safe conversion shell at ${width}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const found = new Set<string>();
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(route);
      await expect(page.locator('[data-public-header]')).toHaveCount(1);
      await expect(page.locator('[data-public-footer]')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveCount(1);
      const canonical = new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!);
      expect(canonical.origin).toBe('https://garage-link.tech');
      expect(canonical.pathname).toBe(route);
      const text = await page.locator('main').evaluate(e => {
        const clone = e.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script').forEach(script => script.remove());
        return clone.textContent;
      });
      expect(text).not.toMatch(jargon);
      await expect(page.locator('[data-public-header]').getByRole('link', { name: '無料で始める', exact: true }).first()).toBeVisible();
      await expect(page.locator('[data-public-footer]').getByRole('link', { name: 'デモ', exact: true })).toHaveAttribute('href', '/demo');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      const links = await page.locator('a[href]').evaluateAll(elements => elements.map(e => e.getAttribute('href')!));
      for (const href of links) {
        if (href.startsWith('/')) found.add(new URL(href, page.url()).pathname);
        if (href.startsWith('https://')) {
          // Official contact/merchant disclosure links may leave the site; no unrelated product promotion.
          expect(href).not.toMatch(/aftercare-link|turnkey-link|l-touring/);
          if (href.includes('llink.tech')) expect(href).toBe('https://llink.tech/r/fc9c4a7cd45041588d9b5bf344971709');
        }
        if (href.startsWith('#')) expect(await page.locator(`[id="${href.slice(1)}"]`).count()).toBeGreaterThan(0);
      }
    }
    expect([...found].filter(route => !routes.includes(route))).toEqual([]);
  });
  test(`pricing FAQ demo home and industry signup/demo journeys at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto('/');
    for (const [label, route] of [['料金', '/pricing'], ['FAQ', '/faq'], ['デモ', '/demo']]) {
      if (width < 768) await page.getByTestId('mobile-menu-trigger').click();
      const nav = page.getByRole('navigation', { name: width < 768 ? 'スマホメニュー' : 'メインナビゲーション' });
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    }
    await page.locator('[data-public-header]').getByRole('link', { name: 'GARAGE LINK トップページ' }).click();
    await expect(page).toHaveURL(/\/$/);
    for (const route of routes.filter(route => route.startsWith('/industries/'))) {
      await page.goto(route);
      await page.locator('main').getByRole('link', { name: '無料で始める' }).click();
      await expect(page.getByRole('heading', { name: 'アカウント作成' })).toBeVisible();
      await page.goto(route);
      await page.locator('main').getByRole('link', { name: '触って確かめる' }).click();
      await expect(page.getByTestId('garage-live-demo')).toBeVisible();
    }
  });
}
test('features is a distinct canonical feature page, and FAQ describes availability without developer jargon', async ({ page }) => {
  const response = await page.goto('/features');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/features$/);
  await expect(page).toHaveTitle(/製品・機能/);
  await expect(page.getByRole('heading', { name: '車両から、仕事がつながる。' })).toBeVisible();
  for (const name of ['車両', '顧客', '商談', '見積・請求', '整備']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.goto('/faq');
  await page.getByText('L-LINKとの連携は使えますか？', { exact: true }).click();
  await expect(page.locator('details[open]')).toContainText('現在提供準備中');
  expect(await page.locator('details[open]').innerText()).not.toMatch(jargon);
  expect(await page.locator('script[type="application/ld+json"]').textContent()).not.toMatch(jargon);
});
