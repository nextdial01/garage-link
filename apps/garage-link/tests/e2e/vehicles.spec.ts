import { expect, test } from '@playwright/test';
import { assertNoAppError, clickButtonByCandidates, fillField, hasE2ECredentials, login } from './helpers';

test.describe('車両登録フロー', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('車両を登録して一覧で確認できる', async ({ page }) => {
    const timestamp = Date.now();
    const managementNo = `E2E-VEHICLE-${timestamp}`;

    await page.goto('/vehicles/new');
    await assertNoAppError(page);

    await fillField(page, { labels: ['車両No'], placeholders: ['例：GL-0001'], names: ['車両情報-車両No'] }, managementNo);
    await fillField(page, { labels: ['車台No'], placeholders: ['例：NCP160-1234567'] }, `VIN-${timestamp}`);
    await fillField(page, { labels: ['メーカー名'], placeholders: ['例：トヨタ'] }, 'Honda');
    await fillField(page, { labels: ['車名'], placeholders: ['例：プロボックス'] }, 'CB400SF E2E');
    await fillField(page, { labels: ['仕入価格'], placeholders: ['例：1200000'] }, '100000');
    await fillField(page, { labels: ['車両価格'], placeholders: ['例：1680000'] }, '120000');

    await clickButtonByCandidates(page, [/車両を登録/, /登録する/, /保存/]);
    await page.waitForLoadState('networkidle');

    if (new URL(page.url()).pathname !== '/vehicles') {
      await expect(page.getByText(/保存しました|登録しました|完了しました/)).toBeVisible();
      await page.goto('/vehicles');
    }

    await assertNoAppError(page);
    await expect(page.getByText(managementNo)).toBeVisible();
  });
});
