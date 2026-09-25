import { expect, test } from '@playwright/test';
import { assertNoAppError, hasE2ECredentials, login } from './helpers';

test.describe('車両登録フロー', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL and E2E_PASSWORD are required.');
  test.beforeEach(async ({ page }) => { await login(page); });

  test('マスターメーカーと別々の満了日を保存し再開できる', async ({ page }) => {
    test.setTimeout(60000);
    const number = `E2E-VEHICLE-${Date.now()}`;
    await page.goto('/vehicles/new');
    await page.getByLabel('車両No', { exact: true }).fill(number);
    await page.getByLabel(/^車台No/).fill(`VIN-${number}`);
    const maker = page.getByLabel('車両メーカー', { exact: true });
    await expect(maker).toBeEnabled();
    const enabledOption = maker.locator('option:not([disabled])').filter({ hasNotText: /選択してください|読み込み中|無効/ }).first();
    await expect(enabledOption).toBeAttached();
    await expect(enabledOption).toBeEnabled();
    const makerValue = await enabledOption.getAttribute('value');
    expect(makerValue).toBeTruthy();
    await maker.selectOption(makerValue!);
    await page.getByLabel(/^車名/).fill(number);
    await page.getByLabel(/^仕入価格[（(]/).fill('100000');
    await page.getByLabel(/^車両価格[（(]/).fill('120000');
    await page.getByLabel('車検満了日', { exact: true }).fill('2028-01-31');
    await page.getByLabel('自賠責保険満了日', { exact: true }).fill('2028-02-28');
    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/rest/v1/vehicles');
    await page.getByRole('button', { name: '車両を登録する', exact: true }).click();
    expect((await saved).status()).toBe(201);
    await expect(page).toHaveURL(/\/vehicles$/, { timeout: 15000 });
    await assertNoAppError(page);
    await page.getByText(number, { exact: false }).first().click();
    await page.getByRole('link', { name: /車両詳細|詳細を開く/ }).click();
    await expect(page).toHaveURL(/\/vehicles\/[a-f0-9-]+$/);
    await page.reload();
    await expect(page.getByLabel('車両メーカー', { exact: true })).toHaveValue(makerValue!);
    await expect(page.getByLabel('車種名', { exact: true })).toHaveValue(number);
    await expect(page.getByLabel(/^仕入価格[（(]/)).toHaveValue('100000');
    await expect(page.getByLabel(/^車両本体価格[（(]/)).toHaveValue('120000');
    await expect(page.getByLabel('車検満了日', { exact: true })).toHaveValue('2028-01-31');
    await expect(page.getByLabel('自賠責保険満了日', { exact: true })).toHaveValue('2028-02-28');
  });
});
