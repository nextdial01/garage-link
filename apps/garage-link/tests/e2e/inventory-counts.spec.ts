import { expect, test } from '@playwright/test';
import { assertNoAppError, hasE2ECredentials, login } from './helpers';

test.describe('棚卸しページ', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('一覧と登録画面が開ける', async ({ page }) => {
    await page.goto('/inventory-counts');
    await assertNoAppError(page);
    await expect(page.getByRole('link', { name: /棚卸しを開始/ })).toBeVisible();

    await page.goto('/inventory-counts/new');
    await assertNoAppError(page);
    await expect(page.getByRole('heading', { name: /棚卸し登録/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /棚卸しを保存|保存/ })).toBeVisible();
  });
});
