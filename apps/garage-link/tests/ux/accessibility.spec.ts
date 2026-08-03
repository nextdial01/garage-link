import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { attachJson } from './audit-helpers';

const ownerState = process.env.UX_OWNER_STATE_PATH;
test.use({ storageState: ownerState });
test.skip(!ownerState, 'UX owner storageState is required');

for (const route of ['/dashboard', '/vehicles', '/customers', '/deals', '/maintenance', '/settings']) {
  test(`authenticated axe ${route}`, async ({ page }, testInfo) => {
    await page.goto(route);
    const result = await new AxeBuilder({ page }).analyze();
    const blocking = result.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
    await attachJson(testInfo, 'axe', { route, blocking, all: result.violations });
    expect(blocking, `${route} axe Critical/Serious`).toEqual([]);
  });
}
