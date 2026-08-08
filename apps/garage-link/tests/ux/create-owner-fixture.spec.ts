import { expect, test } from '@playwright/test';

const fixtureEmail = process.env.UX_FIXTURE_EMAIL;
const fixturePassword = process.env.UX_FIXTURE_PASSWORD;
const fixtureExists = process.env.UX_FIXTURE_EXISTS === '1';

test.describe('staging owner fixture', () => {
  test.skip(!fixtureEmail || !fixturePassword, 'UX fixture credentials are required');

  test('creates an owner through the public signup and onboarding UI', async ({ page }) => {
    if (fixtureExists) {
      await page.goto('/login?next=/onboarding');
      await page.locator('#email').fill(fixtureEmail!);
      await page.locator('#password').fill(fixturePassword!);
      await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    } else {
      await page.goto('/signup');
      await page.getByLabel('店舗名').fill('[UX QA 20260803] 受入監査店');
      await page.getByLabel('担当者名').fill('[UX QA 20260803] Owner');
      await page.getByLabel('メールアドレス').fill(fixtureEmail!);
      await page.locator('#password').fill(fixturePassword!);
      await page.locator('#passwordConfirmation').fill(fixturePassword!);
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: '無料でアカウントを作成する' }).click();
    }

    await expect(page).toHaveURL(/\/security\/email-otp/, { timeout: 30_000 });
    const otpMessage = await page.getByText(/Preview QA確認コード:/).textContent();
    const otp = otpMessage?.match(/\b(\d{6})\b/)?.[1];
    expect(otp, 'preview deployment must expose a one-time QA code').toBeTruthy();
    await page.getByLabel('メールに届いた6桁コード').fill(otp!);
    await page.getByRole('button', { name: 'この端末を承認する' }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'はじめての設定' })).toBeVisible();

    await page.getByLabel('法人名').fill('[UX QA 20260803] 株式会社受入監査');
    await page.getByLabel('店舗名').fill('[UX QA 20260803] 受入監査店');
    await page.getByLabel('代表者名').fill('[UX QA 20260803] Owner');
    await page.getByRole('button', { name: '保存して次へ' }).click();
    await page.getByRole('button', { name: '次へ' }).click();
    await page.getByRole('button', { name: '次へ' }).click();
    await page.getByRole('button', { name: '設定を完了してダッシュボードへ進む' }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /ダッシュボード/ })).toBeVisible();
    await page.context().storageState({ path: process.env.UX_OWNER_STATE_PATH ?? 'test-results/ux-owner-state.json' });
  });
});
