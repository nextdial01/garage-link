import { expect, test } from '@playwright/test';
import { assertNoAppError, hasE2ECredentials, login } from './helpers';

test.describe('顧客登録フロー', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');
  test.beforeEach(async ({ page }) => { await login(page); });

  test('必須生年月日を登録し一覧から再開して確認できる', async ({ page }) => {
    test.setTimeout(60000);
    const stamp = Date.now();
    const name = `E2E CUSTOMER ${stamp}`;
    const email = `e2e-${stamp}@example.invalid`;
    await page.goto('/customers/new');
    await page.getByLabel('顧客/会社名', { exact: true }).fill(name);
    await page.getByLabel('TEL', { exact: true }).fill('09000000000');
    await page.getByLabel('Eメール', { exact: true }).fill(email);
    const birth = page.getByLabel('生年月日（必須）', { exact: true });
    await expect(birth).toHaveAttribute('required', '');
    await expect(page.getByLabel(/^年齢/)).toHaveCount(0);
    await page.getByRole('button', { name: '顧客を登録する', exact: true }).click();
    await expect(page).toHaveURL(/\/customers\/new$/);
    await birth.fill('1990-01-02');
    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/rest/v1/customers');
    await page.getByRole('button', { name: '顧客を登録する', exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect(page).toHaveURL(/\/customers$/, { timeout: 15000 });
    await assertNoAppError(page);
    await page.getByText(name, { exact: true }).click();
    await page.getByRole('link', { name: '詳細を開く', exact: true }).click();
    await expect(page).toHaveURL(/\/customers\/[a-f0-9-]+$/);
    await page.reload();
    await expect(page.getByLabel(/生年月日/)).toHaveValue('1990-01-02');
    await expect(page.getByLabel('氏名 / 会社名', { exact: true })).toHaveValue(name);
    await expect(page.getByLabel('電話番号', { exact: true })).toHaveValue('09000000000');
    await expect(page.getByLabel('メール', { exact: true })).toHaveValue(email);
  });
});
