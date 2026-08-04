import { expect, test } from '@playwright/test';

const ownerState = process.env.UX_OWNER_STATE_PATH;

test.describe('owner sidebar pointer navigation', () => {
  test.use({ storageState: ownerState, viewport: { width: 1440, height: 1000 } });
  test.skip(!ownerState, 'UX owner storageState is required');

  test('clicks the visible card and count targets, then survives modal and reload', async ({ page }, testInfo) => {
    const matrix: Array<Record<string, string>> = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()}`));

    await page.goto('/dashboard');
    const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(navigation).toBeVisible();

    const help = navigation.getByRole('button', { name: /の説明を見る$/ }).first();
    await help.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '閉じる' }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => ({ overflow: document.body.style.overflow, inert: Array.from(document.body.children).some((element) => (element as HTMLElement).inert) }))).toEqual({ overflow: '', inert: false });

    const links = await navigation.locator('a[href]').evaluateAll((elements) => elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({ href: element.getAttribute('href')!, label: (element.textContent ?? '').trim() })));

    for (const item of links) {
      await page.goto('/dashboard');
      const link = navigation.locator(`a[href="${item.href}"]`).first();
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box, `${item.label} must have a pointer target`).not.toBeNull();
      const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
      const target = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return { tag: element?.tagName ?? '', href: element?.closest('a')?.getAttribute('href') ?? '' };
      }, point);
      expect(target.href, `${item.label} center must resolve to its link`).toBe(item.href);
      await page.mouse.click(point.x, point.y);
      await expect(page).toHaveURL(new RegExp(`${item.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[/?#]|$)`));
      matrix.push({ label: item.label, href: item.href, target: target.tag, result: 'PASS' });
    }

    const count = navigation.locator('a[href] span.rounded-full').first();
    if (await count.count()) {
      await page.goto('/dashboard');
      await count.click();
      await expect(page).not.toHaveURL(/\/dashboard$/);
      matrix.push({ label: (await count.textContent())?.trim() ?? 'count', result: 'PASS' });
    }

    await page.goto('/dashboard');
    await page.reload();
    await expect(navigation).toBeVisible();
    expect(errors, 'sidebar navigation must not emit runtime or failed-request errors').toEqual([]);
    await testInfo.attach('sidebar-click-matrix.json', { body: JSON.stringify(matrix, null, 2), contentType: 'application/json' });
  });
});
