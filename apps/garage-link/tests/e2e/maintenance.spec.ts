import { expect, test } from '@playwright/test';
import { assertNoAppError, hasE2ECredentials, login } from './helpers';

test.describe('整備・車検ページ', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('一覧と登録画面が開ける', async ({ page }) => {
    await page.goto('/maintenance');
    await assertNoAppError(page);
    await expect(page.getByRole('link', { name: /整備・車検を登録/ })).toBeVisible();

    await page.goto('/maintenance/new');
    await assertNoAppError(page);
    await expect(page.getByRole('heading', { name: /整備・車検登録/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /整備・車検を登録|保存/ })).toBeVisible();
  });
});
