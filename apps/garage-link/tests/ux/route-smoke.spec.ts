import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { assertViewportIntegrity, attachJson, collectBrowserIssues } from './audit-helpers';

const publicRoutes = [
  '/',
  '/features',
  '/pricing',
  '/faq',
  '/industries/used-car',
  '/industries/motorcycle',
  '/industries/maintenance',
  '/login',
  '/signup',
  '/forgot-password',
  '/help',
  '/legal/terms',
  '/legal/privacy',
  '/legal/tokusho',
];

const protectedRepresentativeRoutes = [
  '/dashboard',
  '/vehicles',
  '/customers',
  '/deals',
  '/maintenance',
  '/appointments',
  '/parts',
  '/inventory-counts',
  '/settings',
];

for (const route of publicRoutes) {
  test(`public route ${route}`, async ({ page }, testInfo) => {
    const issues = collectBrowserIssues(page);
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} status`).toBeLessThan(400);
    await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error/i);
    await assertViewportIntegrity(page);

    const axe = await new AxeBuilder({ page }).analyze();
    const blocking = axe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
    await attachJson(testInfo, 'axe', { route, blocking, all: axe.violations });
    await attachJson(testInfo, 'browser-issues', issues);
    expect(blocking, `${route} axe Critical/Serious`).toEqual([]);
    expect(issues, `${route} browser issues`).toEqual([]);
  });
}

for (const route of protectedRepresentativeRoutes) {
  test(`unauthenticated access ${route}`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} status`).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
  });
}
