import { expect, test } from '@playwright/test';

const ownerState = process.env.UX_OWNER_STATE_PATH;
test.use({ storageState: ownerState });
test.skip(!ownerState, 'UX owner storageState is required');

test('dashboard help dialog stays inside the viewport and owns focus', async ({ page }, testInfo) => {
  await page.goto('/dashboard');
  const trigger = page.getByRole('button', { name: '今日やることの説明を見る' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: '今日やること' });
  await expect(dialog).toBeVisible();
  const rect = await dialog.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y).toBeGreaterThanOrEqual(16);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) - 16);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  await expect(dialog.getByRole('button', { name: '閉じる', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await testInfo.attach('dashboard-context-help', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
