import { expect, test } from '@playwright/test';
import { assertNoAppError, clickButtonByCandidates, fillField, hasE2ECredentials, login } from './helpers';

test.describe('顧客登録フロー', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('顧客を登録して一覧で確認できる', async ({ page }) => {
    const timestamp = Date.now();
    const customerName = `E2E 顧客 ${timestamp}`;
    const email = `e2e-${timestamp}@example.com`;

    await page.goto('/customers/new');
    await assertNoAppError(page);

    await fillField(page, { labels: ['顧客/会社名'], placeholders: ['例：山田 太郎'], names: ['name'] }, customerName);
    await fillField(page, { labels: ['TEL', '電話番号'], placeholders: ['例：06-0000-0000'], names: ['phone'] }, '09000000000');
    await fillField(page, { labels: ['Eメール', 'メールアドレス'], names: ['email'] }, email);

    await clickButtonByCandidates(page, [/顧客を登録/, /登録する/, /保存/]);
    await page.waitForLoadState('networkidle');

    if (new URL(page.url()).pathname !== '/customers') {
      await expect(page.getByText(/保存しました|登録しました|完了しました/)).toBeVisible();
      await page.goto('/customers');
    }

    await assertNoAppError(page);
    await expect(page.getByText(customerName)).toBeVisible();
  });
});
