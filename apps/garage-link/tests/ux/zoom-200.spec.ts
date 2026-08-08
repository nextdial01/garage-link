import { expect, test } from '@playwright/test';
import { assertViewportIntegrity } from './audit-helpers';

const ownerState = process.env.UX_OWNER_STATE_PATH;
test.use({ storageState: ownerState });
test.skip(!ownerState, 'UX owner storageState is required');

const routes = [
  '/dashboard',
  '/vehicles/new',
  '/customers/new',
  '/deals/new',
  '/quotes/new',
  '/invoices/new',
  '/maintenance/new',
  '/appointments',
  '/inventory-counts/new',
  '/settings',
];

for (const route of routes) {
  test('200 percent zoom ' + route, async ({ page }) => {
    // Browser zoom halves the CSS viewport. Emulate the resulting 720×450 CSS
    // viewport so responsive media queries reflow exactly as they do at 200%.
    await page.setViewportSize({ width: 720, height: 450 });
    await page.goto(route);
    await assertViewportIntegrity(page);
    await expect(page.locator('main')).toBeVisible();
    const clippedText = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('button, a[href]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0
          && (rect.left < 0 || rect.right > window.innerWidth);
      })
      .map((element) => (element.innerText || element.getAttribute('aria-label') || '').trim())
      .filter(Boolean));
    expect(clippedText, route + ' clipped controls at 200%').toEqual([]);
  });
}
