import { expect, test } from '@playwright/test';

test('signup prevents incomplete and mismatched submissions', async ({ page }) => {
  await page.goto('/signup');
  const submit = page.getByRole('button', { name: '無料でアカウントを作成する' });
  await expect(submit).toBeDisabled();
  await page.locator('#password').fill('123456');
  await page.locator('#passwordConfirmation').fill('654321');
  await expect(page.getByText('パスワードが一致しません')).toBeVisible();
  await expect(submit).toBeDisabled();
});

test('forgot-password exposes a clear recovery action', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading')).toBeVisible();
  await expect(page.getByRole('button')).toBeVisible();
  await expect(page.getByRole('link', { name: /ログイン/ })).toBeVisible();
});
