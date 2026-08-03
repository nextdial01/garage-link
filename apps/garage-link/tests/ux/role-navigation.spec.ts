import { expect, test } from '@playwright/test';

const roleStates = {
  owner: process.env.UX_OWNER_STATE_PATH,
  admin: process.env.UX_ADMIN_STATE_PATH,
  staff: process.env.UX_STAFF_STATE_PATH,
  viewer: process.env.UX_VIEWER_STATE_PATH,
};

for (const [role, storageState] of Object.entries(roleStates)) {
  test.describe(`${role} navigation`, () => {
    test.use({ storageState });
    test.skip(!storageState, `${role} storageState is required`);
    test('opens dashboard and exposes an explicit primary navigation', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: /ダッシュボード/ })).toBeVisible();
      await expect(page.getByRole('navigation').first()).toBeVisible();
    });
  });
}
