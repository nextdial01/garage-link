import { expect, test } from '@playwright/test';
import { assertViewportIntegrity, collectBrowserIssues } from './audit-helpers';

for (const route of ['/', '/login', '/signup']) {
  test(`webkit ${route}`, async ({ page }) => {
    const issues = collectBrowserIssues(page);
    await page.goto(route);
    await assertViewportIntegrity(page);
    await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error/i);
    expect(issues).toEqual([]);
  });
}

const ownerState = process.env.UX_OWNER_STATE_PATH;
const ownerPreviewUrl = process.env.STAGING_OWNER_PREVIEW_URL;
test.describe('authenticated WebKit', () => {
  test.use({ storageState: ownerState });
  test.skip(!ownerState, 'UX owner storageState is required');
  for (const route of ['/dashboard', '/vehicles', '/customers', '/deals', '/maintenance', '/settings']) {
    test('webkit owner ' + route, async ({ page }) => {
      const issues = collectBrowserIssues(page);
      await page.goto(route);
      await assertViewportIntegrity(page);
      await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error/i);
      expect(issues).toEqual([]);
    });
  }
});

test.describe('owner preview WebKit sidebar pointer click', () => {
  test.use({ storageState: ownerState });
  test.skip(!ownerState && !ownerPreviewUrl, 'UX_OWNER_STATE_PATH or STAGING_OWNER_PREVIEW_URL is required');

  test('clicks a primary card and confirms the destination', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(request.url()));
    await page.goto(ownerState ? '/dashboard' : ownerPreviewUrl!);
    const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(navigation).toBeVisible();
    const link = navigation.locator('a[href]').first();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    await expect.poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? '', point)).toBe(await link.getAttribute('href'));
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('main')).toBeVisible();
    expect(await page.evaluate(() => ({ inert: Array.from(document.body.children).some((element) => (element as HTMLElement).inert), hidden: Array.from(document.body.children).some((element) => element.getAttribute('aria-hidden') === 'true'), modal: document.querySelectorAll('[data-modal-layer="true"]').length }))).toEqual({ inert: false, hidden: false, modal: 0 });
    expect(errors).toEqual([]);
  });
});
