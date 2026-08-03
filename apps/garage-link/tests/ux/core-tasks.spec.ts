import { expect, test } from '@playwright/test';
import { assertViewportIntegrity, collectBrowserIssues } from './audit-helpers';

const ownerState = process.env.UX_OWNER_STATE_PATH;
test.use({ storageState: ownerState });
test.skip(!ownerState, 'UX owner storageState is required');

const taskEntryRoutes = [
  ['/vehicles/new', /車両/],
  ['/customers/new', /顧客/],
  ['/deals/new', /商談/],
  ['/quotes/new', /見積/],
  ['/invoices/new', /請求/],
  ['/maintenance/new', /整備|車検/],
  ['/appointments', /予約/],
  ['/inventory-counts/new', /棚卸/],
] as const;

for (const [route, heading] of taskEntryRoutes) {
  test(`task entry ${route}`, async ({ page }) => {
    const issues = collectBrowserIssues(page);
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await assertViewportIntegrity(page);
    expect(issues, `${route} browser issues`).toEqual([]);
  });
}
