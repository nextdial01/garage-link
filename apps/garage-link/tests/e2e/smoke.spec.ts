import { expect, test } from '@playwright/test';

const routes = ['/login', '/dashboard', '/vehicles', '/customers', '/deals', '/line'];
const errorText = /Application error|Module not found|500 Internal Server Error/i;

test.describe('GARAGE LINK smoke test', () => {
  test('未認証の保護APIはログインHTMLではなく401 JSONを返す', async ({ request }) => {
    const response = await request.get('/api/customers/export', { maxRedirects: 0 });

    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  test('公開画面で実行時JavaScriptエラーが発生しない', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(pageErrors).toEqual([]);
  });

  for (const route of routes) {
    test(`${route} opens without application errors`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.status() ?? 0).toBeLessThan(500);
      await expect(page.locator('body')).not.toContainText(errorText);
    });
  }
});
