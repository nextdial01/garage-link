import { expect, test } from '@playwright/test';
import { assertNoAppError, hasE2ECredentials, login } from './helpers';

const lineRoutes = ['/line', '/line/tags', '/line/templates', '/line/friends', '/line/settings'];

test.describe('LINE管理ページ', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const route of lineRoutes) {
    test(`${route} が開ける`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status() ?? 0).toBeLessThan(500);
      await assertNoAppError(page);
    });
  }
});
