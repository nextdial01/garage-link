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
    test(`no clipping, distortion, or horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);

      const pageWidth = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(pageWidth.scrollWidth, 'document must not horizontally overflow').toBeLessThanOrEqual(pageWidth.innerWidth + 1);

      const clippedText = await page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>('h1,h2,h3,p,a,button,span,strong,small,li,summary'),
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

      const distortedProductImages = await page.evaluate(() => {
        const images = Array.from(
          document.querySelectorAll<HTMLImageElement>('img[alt^="GARAGE LINKの"]'),
        );

        return images.flatMap((image) => {
          const rect = image.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1 || image.naturalWidth < 1 || image.naturalHeight < 1) return [];
          const naturalRatio = image.naturalWidth / image.naturalHeight;
          const renderedRatio = rect.width / rect.height;
          const delta = Math.abs(renderedRatio - naturalRatio) / naturalRatio;
          return delta > 0.025
            ? [{ alt: image.alt, naturalRatio, renderedRatio, delta }]
            : [];
        });
      });
      expect(distortedProductImages, 'real UI screenshots must preserve aspect ratio').toEqual([]);

      const heroLineCount = await page.locator('h1').first().evaluate((element) => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        return Number.isFinite(lineHeight) && lineHeight > 0
          ? element.getBoundingClientRect().height / lineHeight
          : 0;
      });
      expect(heroLineCount, 'hero headline should remain scannable').toBeLessThanOrEqual(4.2);

      await expect(page.locator('h1 br')).toHaveCount(0);

      // Full-page evidence should show every section even though production
      // reveals them only when they enter the viewport.
      await page.evaluate(() => {
        document.querySelectorAll<HTMLElement>('[data-lp-reveal]').forEach((element) => {
          element.dataset.revealed = 'true';
        });
      });

      await page.screenshot({
        path: `test-results/lp-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
});
