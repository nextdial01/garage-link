import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import attioContract from '../../docs/lp/attio-reference-20261005/ATTIO_VISUAL_CONTRACT.json';

const viewports = [
  { width: 390, height: 844, name: 'mobile-390' },
  { width: 430, height: 932, name: 'mobile-430' },
  { width: 768, height: 1024, name: 'tablet-768' },
  { width: 1024, height: 900, name: 'laptop-1024' },
  { width: 1440, height: 1000, name: 'desktop-1440' },
] as const;

const visualEvidenceDir = join(process.cwd(), 'test-results', 'attio-contract-visuals');
const tolerance = attioContract.implementation_rules.acceptance_tolerance.continuous_values_percent / 100;

function withinTolerance(actual: number, expected: number, fraction = tolerance) {
  expect(Math.abs(actual - expected) / expected, `${actual} should stay within ${fraction * 100}% of ${expected}`).toBeLessThanOrEqual(fraction);
}

function expectedDesktopH1Size(viewportHeight: number) {
  const expression = attioContract.items.hero_heading_desktop.value.font_size_css;
  const match = expression.match(/clamp\(([\d.]+)px, calc\(([\d.]+)px \+ ([\d.]+)svh\), ([\d.]+)px\)/);
  expect(match, 'desktop H1 formula must remain parseable from ATTIO_VISUAL_CONTRACT.json').not.toBeNull();
  if (!match) return 64;
  const [, min, base, perSvh, max] = match;
  return Math.max(Number(min), Math.min(Number(max), Number(base) + Number(perSvh) * viewportHeight / 100));
}

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
        style.textOverflow === 'ellipsis'
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

test.describe('GARAGE LINK LP against the frozen Attio public CSS contract', () => {
  for (const viewport of viewports) {
    test(`layout, type, conversion content, and product platform at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);

      const documentWidth = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(documentWidth.document, 'page must not horizontally overflow').toBeLessThanOrEqual(documentWidth.viewport + 1);

      const hero = page.locator('#garage-hero');
      const headerHeight = await page.locator('main > header').evaluate((element) => element.getBoundingClientRect().height);
      withinTolerance(headerHeight, attioContract.items.header.value.height_px);
      const heading = hero.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      await expect(heading.locator('span')).toHaveCount(2);

      const heroPaddingTop = await hero.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
      const expectedHeroPaddingTop = viewport.width < 768
        ? attioContract.items.hero_spacing.value.mobile_alternate_top_padding_px
        : Math.max(96, viewport.height * 0.1);
      withinTolerance(heroPaddingTop, expectedHeroPaddingTop);

      const heroType = await heading.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10),
          lineHeight: Number.parseFloat(style.lineHeight),
          lineCount: element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight),
          fontFamily: style.fontFamily,
        };
      });
      const heroHeadingContract = attioContract.items.hero_heading_desktop.value;
      const heroMobileContract = attioContract.items.hero_heading_mobile.value;
      const expectedH1 = viewport.width >= attioContract.items.responsive_structure.value.alternate_mobile_hero_until_px
        ? expectedDesktopH1Size(viewport.height)
        : heroMobileContract.base_font_size_px;
      withinTolerance(heroType.fontSize, expectedH1);
      expect(heroType.fontWeight).toBe(heroHeadingContract.font_weight);
      expect(heroType.lineCount, 'Japanese headline should stay compact').toBeLessThanOrEqual(2.1);
      expect(heroType.fontFamily).toMatch(/Hiragino|Noto Sans JP|Yu Gothic|sans-serif/i);
      withinTolerance(heroType.lineHeight, viewport.width >= 768 ? heroType.fontSize * heroHeadingContract.line_height : 44);

      const bodyType = await hero.locator('h1 + p').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10),
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      const bodyContract = attioContract.items.body_typography.value;
      withinTolerance(bodyType.fontSize, bodyContract.font_size_px);
      expect(bodyType.fontWeight).toBe(bodyContract.font_weight);
      withinTolerance(bodyType.lineHeight, bodyContract.line_height_px, 0.12);

      const primaryCta = hero.getByRole('link', { name: '無料で始める' });
      await expect(primaryCta).toHaveAttribute('href', '/signup?placement=hero');
      const ctaStyle = await primaryCta.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          radius: Number.parseFloat(style.borderTopLeftRadius),
          background: style.backgroundColor,
        };
      });
      withinTolerance(ctaStyle.height, attioContract.items.cta_geometry.value.hero_primary_button.height_px);
      withinTolerance(ctaStyle.radius, attioContract.items.cta_geometry.value.hero_primary_button.border_radius_px);
      expect(ctaStyle.background).toBe('rgb(28, 29, 31)');

      await expect(page.getByRole('heading', { name: '車両から整備まで、店の仕事をひと続きに。' })).toBeVisible();
      const platform = page.locator('#product-story');
      const stage = page.getByTestId('garage-scroll-story-stage');
      const platformMetrics = await platform.getByRole('heading', { level: 2 }).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10),
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      const expectedSectionHeading = viewport.width >= 992 ? 40 : 32;
      withinTolerance(platformMetrics.fontSize, expectedSectionHeading);
      expect(platformMetrics.fontWeight).toBe(attioContract.items.section_heading.value.font_weight);
      withinTolerance(platformMetrics.lineHeight, viewport.width >= 992 ? 44 : 36);

      const platformPaddingTop = await platform.locator(':scope > div').evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
      const platformSpacing = attioContract.items.platform_grid.value.section_intro_top_padding_px;
      const expectedPlatformPaddingTop = viewport.width >= 1200
        ? platformSpacing.from_1200px
        : viewport.width >= 992
          ? platformSpacing['992_to_1199px']
          : platformSpacing.below_992px;
      withinTolerance(platformPaddingTop, expectedPlatformPaddingTop);

      const stageMetrics = await stage.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          width: element.getBoundingClientRect().width,
          shellWidth: element.parentElement?.getBoundingClientRect().width ?? 0,
          position: style.position,
          shadow: style.boxShadow,
        };
      });
      const attioContentWidthFraction = attioContract.items.platform_grid.value.desktop_content_columns /
        attioContract.items.platform_grid.value.columns;
      expect(stageMetrics.width / viewport.width).toBeGreaterThanOrEqual(attioContentWidthFraction * (1 - tolerance));
      withinTolerance(stageMetrics.width, stageMetrics.shellWidth);
      expect(stageMetrics.position, 'the product stage stays in normal document flow').not.toMatch(/sticky|fixed/);
      expect(stageMetrics.shadow, 'marketing shell does not add a broad product-card shadow').toBe('none');
      const stageBox = await stage.boundingBox();
      expect(stageBox).not.toBeNull();
      if (stageBox) expect(stageBox.y, 'the real product UI should begin in the first viewport').toBeLessThan(viewport.height * 1.05);
      await expect(platform.getByRole('tab')).toHaveCount(5);
      await expect(page.getByTestId('garage-scroll-story-demo')).toBeVisible();
      await expect(page.getByTestId('garage-live-demo')).toBeVisible();
      await expect(page.locator('img[src*="/product-screens/"]')).toHaveCount(0);

      const pricing = page.locator('#pricing');
      await expect(pricing.getByText('0', { exact: true })).toBeVisible();
      await expect(pricing).toContainText('在庫 5台');
      await expect(pricing).toContainText('カード情報は不要');
      await expect(pricing.getByRole('link', { name: /全プランを見る/ })).toHaveAttribute('href', '/pricing');
      await expect(page.locator('#faq')).toBeVisible();
      await expect(page.locator('#final-cta')).toBeVisible();
      await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toHaveAttribute('href', '/legal/privacy');
      await expect(page.getByRole('link', { name: '利用規約' }).last()).toHaveAttribute('href', '/legal/terms');
      await expect(page.getByRole('link', { name: '特定商取引法に基づく表記' })).toHaveAttribute('href', '/legal/tokusho');

      const sectionOrder = await page.evaluate(() =>
        ['#garage-hero', '#product-story', '#live-demo', '#migration', '#pricing', '#faq', '#final-cta']
          .map((selector) => Array.from(document.querySelectorAll('main > section')).findIndex((section) => section.matches(selector))),
      );
      expect(sectionOrder).toEqual([...sectionOrder].sort((a, b) => a - b));
      expect(sectionOrder.every((index) => index >= 0), 'all main sections must have a stable position').toBe(true);

      const clipping = await visibleTextClipping(page);
      expect(clipping, 'visible text must not be clipped').toEqual([]);

      const stickyCta = page.locator('a[href="#live-demo"]').filter({ hasText: 'デモを触る' });
      if (viewport.width < 768) {
        await expect(page.getByRole('button', { name: 'メニューを開く' })).toBeVisible();
        const mobileNav = page.getByRole('navigation', { name: 'スマホメニュー' });
        await expect(mobileNav).toBeHidden();
        await page.getByRole('button', { name: 'メニューを開く' }).click();
        await expect(mobileNav).toBeVisible();
        await expect(mobileNav.getByRole('link', { name: '料金' })).toHaveAttribute('href', '/pricing');
        await page.keyboard.press('Escape');
        await expect(mobileNav).toBeHidden();

        await expect(stickyCta).toHaveAttribute('aria-hidden', 'true');
        await page.locator('#migration').scrollIntoViewIfNeeded();
        await expect(stickyCta).toHaveAttribute('aria-hidden', 'false');
        await page.locator('#final-cta').scrollIntoViewIfNeeded();
        await expect(stickyCta).toHaveAttribute('aria-hidden', 'true');
        await expect(stickyCta).toHaveCSS('opacity', '0');
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(stickyCta).toHaveAttribute('aria-hidden', 'true');
        await expect(stickyCta).toHaveCSS('opacity', '0');
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
          if (selector === '#final-cta' && viewport.width === 390) {
            await expect(stickyCta).toHaveAttribute('aria-hidden', 'true');
            await expect(stickyCta).toHaveCSS('opacity', '0');
          }
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
