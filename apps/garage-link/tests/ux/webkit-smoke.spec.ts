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
