import { expect, test } from '@playwright/test';

const viewports = [
  { width: 390, height: 844, name: 'mobile-390' },
  { width: 430, height: 932, name: 'mobile-430' },
  { width: 768, height: 1024, name: 'tablet-768' },
  { width: 1024, height: 900, name: 'laptop-1024' },
  { width: 1440, height: 1000, name: 'desktop-1440' },
] as const;

test.describe('GARAGE LINK rendered LP quality', () => {
  for (const viewport of viewports) {
    test(`Attio-inspired live LP stays readable at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(120);

      const pageWidth = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(pageWidth.scrollWidth, 'document must not horizontally overflow').toBeLessThanOrEqual(pageWidth.innerWidth + 1);

      if (viewport.width <= 1040) {
        await expect(
          page.getByRole('navigation', { name: 'スマホメニュー' }),
          'collapsed mobile navigation must stay visually hidden',
        ).toBeHidden();
      }

      const heroMetrics = await page.locator('h1').first().evaluate((element) => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        const fontWeight = Number.parseInt(style.fontWeight, 10);
        return {
          lineCount: Number.isFinite(lineHeight) && lineHeight > 0
            ? element.getBoundingClientRect().height / lineHeight
            : 0,
          fontWeight,
          fontFamily: style.fontFamily,
        };
      });
      expect(heroMetrics.lineCount, 'hero must stay scannable').toBeLessThanOrEqual(3.2);
      expect(heroMetrics.fontWeight, 'hero must avoid heavy AI-template typography').toBeLessThanOrEqual(550);
      expect(heroMetrics.fontFamily).toMatch(/apple-system|Helvetica Neue|Hiragino|Noto Sans JP|Yu Gothic/i);
      await expect(page.locator('h1 br')).toHaveCount(0);

      const storyDemo = page.getByTestId('garage-scroll-story-demo');
      const demo = page.getByTestId('garage-live-demo');
      await expect(storyDemo, 'scroll-controlled product story must be embedded').toBeVisible();
      await expect(demo, 'free live product demo must remain embedded').toBeVisible();
      await expect(page.locator('img[src*="/product-screens/"]'), 'homepage must not use product screenshots').toHaveCount(0);

      if (viewport.width > 1040) {
        const stickyStage = page.getByTestId('garage-scroll-story-stage');
        const stickyPosition = await stickyStage.evaluate((element) => getComputedStyle(element).position);
        expect(stickyPosition, 'desktop product story must pin the UI while copy scrolls').toBe('sticky');
      }

      const demoBox = await demo.boundingBox();
      expect(demoBox).not.toBeNull();
      if (demoBox) {
        expect(demoBox.width).toBeGreaterThanOrEqual(Math.min(viewport.width - 24, 350));
      }

      const clippedText = await page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>('h1,h2,h3,p,a,button,span,strong,small,li,summary,label'),
        );

        return nodes.flatMap((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (
            rect.width < 1 ||
            rect.height < 1 ||
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            element.closest('[aria-hidden="true"]')
          ) {
            return [];
          }

          if (style.textOverflow === 'ellipsis') return [];

          const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
          const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
          const clipped =
            (clipsX && element.scrollWidth > element.clientWidth + 2) ||
            (clipsY && element.scrollHeight > element.clientHeight + 2);

          if (!clipped) return [];
          return [{
            tag: element.tagName,
            text: (element.textContent ?? '').trim().slice(0, 90),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }];
        });
      });
      expect(clippedText, 'visible text must not be clipped').toEqual([]);

      const overlappingHeaderControls = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return [];
        const controls = Array.from(header.querySelectorAll<HTMLElement>('a,button')).filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
        });

        const overlaps: string[] = [];
        for (let i = 0; i < controls.length; i += 1) {
          for (let j = i + 1; j < controls.length; j += 1) {
            const a = controls[i].getBoundingClientRect();
            const b = controls[j].getBoundingClientRect();
            const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (width * height > 4) {
              overlaps.push(`${(controls[i].textContent ?? '').trim()} <> ${(controls[j].textContent ?? '').trim()}`);
            }
          }
        }
        return overlaps;
      });
      expect(overlappingHeaderControls, 'header controls must not overlap').toEqual([]);

      if (viewport.width <= 680) {
        const stickyHidden = page.locator('a[href="#live-demo"][aria-hidden="true"]');
        const stickyVisible = page.locator('a[href="#live-demo"][aria-hidden="false"]');

        await expect(stickyHidden, 'sticky CTA stays hidden while hero is visible').toHaveCount(1);

        await page.locator('#product-story').scrollIntoViewIfNeeded();
        await page.waitForTimeout(120);
        await expect(stickyHidden, 'sticky CTA must not cover the scroll product story').toHaveCount(1);

        await page.locator('#live-demo').scrollIntoViewIfNeeded();
        await page.waitForTimeout(120);
        await expect(stickyHidden, 'sticky CTA must not cover the free live demo').toHaveCount(1);

        await page.locator('#migration').scrollIntoViewIfNeeded();
        await page.waitForTimeout(120);
        await expect(stickyVisible, 'sticky CTA appears only in explanatory sections').toHaveCount(1);

        await page.locator('#final-cta').scrollIntoViewIfNeeded();
        await page.waitForTimeout(120);
        await expect(stickyHidden, 'sticky CTA must not cover the final conversion block').toHaveCount(1);

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
      }

      await page.screenshot({
        path: `test-results/top-lp-${viewport.name}.png`,
        fullPage: false,
        animations: 'disabled',
      });

      const story = page.locator('#product-story');
      const storySteps = story.locator('button[data-story-index]');

      if (viewport.width > 1040) {
        await storySteps.nth(2).scrollIntoViewIfNeeded();
        await page.waitForTimeout(260);
        await page.screenshot({
          path: `test-results/story-deal-${viewport.name}.png`,
          fullPage: false,
          animations: 'disabled',
        });

        await storySteps.nth(3).scrollIntoViewIfNeeded();
        await page.waitForTimeout(260);
        await page.screenshot({
          path: `test-results/story-quote-${viewport.name}.png`,
          fullPage: false,
          animations: 'disabled',
        });
      } else {
        await storySteps.nth(4).click();
        await page.getByTestId('garage-scroll-story-stage').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `test-results/story-compact-${viewport.name}.png`,
          fullPage: false,
          animations: 'disabled',
        });
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(80);

      await page.screenshot({
        path: `test-results/lp-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});
