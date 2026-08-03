import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { assertViewportIntegrity, collectBrowserIssues } from './audit-helpers';

const ownerState = process.env.UX_OWNER_STATE_PATH;
test.use({ storageState: ownerState });
test.skip(!ownerState, 'UX owner storageState is required');

const publicRoutes = new Set([
  '/', '/features', '/pricing', '/faq', '/forgot-password', '/help', '/login', '/signup',
  '/legal/privacy', '/legal/terms', '/legal/tokusho',
  '/industries/used-car', '/industries/motorcycle', '/industries/maintenance',
  '/auth/callback', '/auth/reset-password', '/membership/accept',
  '/security/email-otp', '/security/mfa', '/logout', '/onboarding',
]);

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pageFiles(path) : entry.name === 'page.tsx' ? [path] : [];
  });
}
const routes = pageFiles(join(process.cwd(), 'src/app'))
  .map((path) => {
    const directory = relative(join(process.cwd(), 'src/app'), path.slice(0, -'/page.tsx'.length));
    return directory ? '/' + directory.split(sep).join('/') : '/';
  })
  .filter((route) => !publicRoutes.has(route) && !route.includes('['))
  .sort();

for (const route of routes) {
  test('authenticated route ' + route, async ({ page }) => {
    const issues = collectBrowserIssues(page);
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), route + ' status').toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/(?:login|onboarding|security\/email-otp)(?:\?|$)/);
    await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error/i);
    await assertViewportIntegrity(page);
    await page.waitForTimeout(150);
    expect(issues, route + ' browser issues').toEqual([]);
  });
}
