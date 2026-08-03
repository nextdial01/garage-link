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
