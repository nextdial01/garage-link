import { expect, type Page, type TestInfo } from '@playwright/test';

export type BrowserIssue = {
  kind: 'console' | 'pageerror' | 'requestfailed' | 'response';
  detail: string;
};

function isVercelToolbarRequest(url: string, method = 'GET') {
  const { pathname } = new URL(url);
  return (method === 'OPTIONS' && pathname === '/')
    || /^\/[a-f0-9]{16}\/script\.js$/.test(pathname)
    || pathname === '/.well-known/vercel/jwe';
}

export function collectBrowserIssues(page: Page) {
  const issues: BrowserIssue[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource: the server responded with a status of \d+/.test(message.text())) {
      issues.push({ kind: 'console', detail: message.text() });
    }
  });
  page.on('pageerror', (error) => issues.push({ kind: 'pageerror', detail: error.stack || error.message || String(error) }));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('/_next/image') && !isVercelToolbarRequest(url, request.method())) {
      issues.push({ kind: 'requestfailed', detail: `${request.method()} ${url}: ${request.failure()?.errorText ?? 'failed'}` });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !isVercelToolbarRequest(response.url())) {
      issues.push({ kind: 'response', detail: response.status() + ' ' + response.request().method() + ' ' + response.url() });
    }
  });
  return issues;
}

export async function assertViewportIntegrity(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = window.innerWidth;
    const overflow = Math.max(root.scrollWidth, document.body.scrollWidth) - viewportWidth;
    const visiblePrimaryActions = Array.from(
      document.querySelectorAll<HTMLElement>('button, a[href], input[type="submit"]'),
    ).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const label = (element.innerText || element.getAttribute('aria-label') || '').trim();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0
        && /登録|作成|保存|ログイン|始める|次へ|確認/.test(label);
    });
    return {
      overflow,
      clippedPrimaryActions: visiblePrimaryActions
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < 0 || rect.right > viewportWidth;
        })
        .map((element) => (element.innerText || element.getAttribute('aria-label') || '').trim()),
    };
  });
  expect(result.overflow, `horizontal overflow: ${result.overflow}px`).toBeLessThanOrEqual(1);
  expect(result.clippedPrimaryActions, 'viewport外の主要操作').toEqual([]);
}

export async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: 'application/json',
  });
}
