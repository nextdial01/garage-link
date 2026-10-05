import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
const viewports = [
  { width: 390, height: 844, name: 'mobile-390' },
  { width: 430, height: 932, name: 'mobile-430' },
  { width: 768, height: 1024, name: 'tablet-768' },
  { width: 1024, height: 900, name: 'laptop-1024' },
  { width: 1440, height: 1000, name: 'desktop-1440' },
] as const;
const visualEvidenceDir = join(process.cwd(), 'test-results', 'visual-first');
// Measured on the current visual-first baseline after hydration, using the same exclusions below.
const baselineMarketingCharacters = 329;

async function visibleTextClipping(page: Page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(
      'h1,h2,h3,p,a,button,span,strong,small,li,summary,label',
    ));

    return nodes.flatMap((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        rect.width < 1 || rect.height < 1 || style.display === 'none' ||
        style.visibility === 'hidden' || element.closest('[aria-hidden="true"]') ||
        style.textOverflow === 'ellipsis' ||
        (rect.width <= 1 && rect.height <= 1 && style.clipPath === 'inset(50%)')
      ) return [];

      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      if (
        (clipsX && element.scrollWidth > element.clientWidth + 2) ||
        (clipsY && element.scrollHeight > element.clientHeight + 2)
      ) {
        return [{ tag: element.tagName, text: (element.textContent ?? '').trim().slice(0, 90) }];
      }
      return [];
    });
  });
}

test.beforeAll(() => mkdirSync(visualEvidenceDir, { recursive: true }));

test.describe('GARAGE LINK visual-first product experience', () => {
  for (const viewport of viewports) {
    test(`layout, type, conversion content, and product platform at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);

      const documentWidth = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(documentWidth.document, 'page must not horizontally overflow').toBeLessThanOrEqual(documentWidth.viewport + 1);

      const hero = page.locator('#garage-hero');
      const heading = hero.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      await expect(page.getByTestId('garage-scroll-story-demo')).toBeVisible();
      await expect(page.getByTestId('garage-live-demo')).toHaveCount(0);
      const heroType = await heading.evaluate((element) => {
        const style = getComputedStyle(element);
        return { size: parseFloat(style.fontSize), weight: style.fontWeight,
          lines: element.getBoundingClientRect().height / parseFloat(style.lineHeight), family: style.fontFamily };
      });
      expect(heroType.size).toBeGreaterThanOrEqual(viewport.width < 768 ? 34 : 48);
      expect(heroType.size).toBeLessThanOrEqual(64);
      expect(heroType.weight).toBe('600');
      expect(heroType.lines).toBeLessThanOrEqual(2.1);
      expect(heroType.family).toMatch(/Hiragino|Noto Sans JP|Yu Gothic|sans-serif/i);
      await expect(hero.getByRole('link', { name: '無料で始める' })).toHaveAttribute('href', '/signup?placement=hero');
      const platform = page.locator('#product-story');
      const stage = page.getByTestId('garage-scroll-story-stage');
      const stageBox = await stage.boundingBox();
      expect(stageBox).not.toBeNull();
      if (stageBox) {
        expect(stageBox.width / viewport.width).toBeGreaterThanOrEqual(0.70);
        expect(stageBox.width / viewport.width).toBeLessThanOrEqual(0.90 + 0.002);
        expect(stageBox.y, 'actual product enters directly after compact Hero').toBeLessThanOrEqual(470);
      }
      expect(await stage.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
      const marketingCharacters = await page.evaluate(() => {
        const clone = document.querySelector('main')!.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script,header,footer,[data-testid="garage-live-demo"],[data-testid="garage-scroll-story-demo"]')
          .forEach((element) => element.remove());
        return (clone.textContent ?? '').replace(/\s/g, '').length;
      });
      expect(marketingCharacters, 'marketing text must not exceed current visual-first baseline').toBeLessThanOrEqual(baselineMarketingCharacters);
      // Lower content must not restore the repeated explanatory left/right columns.
      for (const selector of ['#pricing', '#migration', '#faq']) {
        const layout = await page.locator(selector).evaluate((section) => {
          const root = section.firstElementChild;
          return root ? getComputedStyle(root).gridTemplateColumns.split(' ').filter(Boolean).length : 1;
        });
        expect(layout).toBeLessThanOrEqual(1);
      }
      await expect(platform.getByRole('tab')).toHaveCount(5);
      await expect(page.getByTestId('garage-scroll-story-demo')).toBeVisible();
      await expect(page.getByTestId('garage-live-demo')).toHaveCount(0);
      await expect(page.locator('img[src*="/product-screens/"]')).toHaveCount(0);

      const pricing = page.locator('#pricing');
      await expect(pricing.getByText('0', { exact: true })).toBeVisible();
      await expect(pricing).toContainText('在庫 5台');
      await expect(pricing).toContainText('カード不要');
      await expect(pricing.getByRole('link', { name: /全プランを見る/ })).toHaveAttribute('href', '/pricing');
      await expect(page.locator('#faq')).toBeVisible();
      await expect(page.locator('#final-cta')).toBeVisible();
      await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/legal/privacy');
      await expect(page.getByRole('link', { name: '利用規約' }).last()).toHaveAttribute('href', '/legal/terms');
      await expect(page.getByRole('link', { name: '特定商取引法に基づく表記' })).toHaveAttribute('href', '/legal/tokusho');

      const sectionOrder = await page.evaluate(() =>
        ['#garage-hero', '#product-story', '#live-demo', '#pricing', '#migration', '#faq', '#final-cta']
          .map((selector) => Array.from(document.querySelectorAll('main > section')).findIndex((section) => section.matches(selector))),
      );
      expect(sectionOrder).toEqual([...sectionOrder].sort((a, b) => a - b));
      expect(sectionOrder.every((index) => index >= 0), 'all main sections must have a stable position').toBe(true);

      const clipping = await visibleTextClipping(page);
      expect(clipping, 'visible text must not be clipped').toEqual([]);

      if (viewport.width < 768) {
        await page.getByRole('button', { name: 'メニューを開く' }).click();
        const mobileNav = page.getByRole('navigation', { name: 'スマホメニュー' });
        await expect(mobileNav).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(mobileNav).toBeHidden();
      }
      if (viewport.width < 768) {
        for (const tab of await platform.getByRole('tab').all()) {
          await tab.click();
          const metrics = await stage.evaluate((element) => ({
            height: element.getBoundingClientRect().height,
            nested: [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))].filter((node) => {
              const style = getComputedStyle(node);
              return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
            }).length,
          }));
          expect(metrics.nested).toBe(0);
          expect(metrics.height).toBeLessThan(520);
        }
        await platform.getByRole('tab').first().click();
      }
      const headerOverlaps = await page.locator('main > header').evaluate((element) => {
        const controls = Array.from(element.querySelectorAll<HTMLElement>('a,button')).filter((control) => {
          const style = getComputedStyle(control);
          const rect = control.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.02 &&
            rect.width > 1 && rect.height > 1 && !control.closest('[aria-hidden="true"]');
        });
        const overlaps: string[] = [];
        for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
            const left = controls[leftIndex].getBoundingClientRect();
            const right = controls[rightIndex].getBoundingClientRect();
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
            if (width * height > 4) overlaps.push(`${controls[leftIndex].textContent} <> ${controls[rightIndex].textContent}`);
          }
        }
        return overlaps;
      });
      expect(headerOverlaps, 'visible header controls must not overlap').toEqual([]);

      await expect(heading).toBeInViewport();
      await page.screenshot({ path: join(visualEvidenceDir, `full-${viewport.name}.png`), fullPage: true, animations: 'disabled' });

      if (viewport.width === 1440 || viewport.width === 390) {
        for (const [selector, name] of [
          ['#garage-hero', 'hero'],
          ['#product-story', 'platform'],
          ['#live-demo', 'interactive-demo'],
          ['#migration', 'migration'],
          ['#pricing', 'pricing'],
          ['#faq', 'faq'],
          ['#final-cta', 'final-cta'],
        ] as const) {
          const section = page.locator(selector);
          await section.scrollIntoViewIfNeeded();
          await section.screenshot({
            path: join(visualEvidenceDir, `${name}-${viewport.name}.png`),
            animations: 'disabled',
          });
        }
      }
    });
  }

  test('five platform tabs change the actual product view without sticky-stage behavior', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    const platform = page.locator('#product-story');
    const demo = page.getByTestId('garage-scroll-story-demo');
    const tabNames = ['車両', '顧客', '商談', '見積', '整備'];
    const views = ['vehicles', 'customers', 'deals', 'quote', 'maintenance'];
    for (const [index, name] of tabNames.entries()) {
      const tab = platform.getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(platform.getByRole('tabpanel')).toHaveAttribute('data-active-view', views[index]);
      await expect(demo.getByRole('heading', { name, exact: true })).toBeVisible();
    }

    const position = await page.getByTestId('garage-scroll-story-stage').evaluate((element) => getComputedStyle(element).position);
    expect(position).not.toMatch(/sticky|fixed/);
    await page.getByRole('tab', { name: '商談' }).click();
    await page.getByRole('tabpanel').screenshot({ path: join(visualEvidenceDir, 'platform-deals-desktop-1440.png'), animations: 'disabled' });
  });

  test('platform switching respects reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const stageTransition = await page.getByRole('tabpanel').evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(stageTransition).toMatch(/^(0s|0ms)(,\s*(0s|0ms))*$/);
    await page.getByRole('tab', { name: '整備' }).click();
    await expect(page.getByTestId('garage-scroll-story-demo').getByRole('heading', { name: '整備', exact: true })).toBeVisible();
  });
});
