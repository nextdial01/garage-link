import { expect, test } from '@playwright/test';

const routes = ['/login', '/dashboard', '/vehicles', '/customers', '/deals', '/line'];
const errorText = /Application error|Module not found|500 Internal Server Error/i;

test.describe('GARAGE LINK smoke test', () => {
  for (const route of routes) {
    test(`${route} opens without application errors`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.status() ?? 0).toBeLessThan(500);
      await expect(page.locator('body')).not.toContainText(errorText);
    });
  }
});
