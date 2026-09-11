import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe('staging indexing protection contract', () => {
  test('uses only the explicit staging marker for response headers', async () => {
    const source = await readFile('next.config.ts', 'utf8');
    expect(source).toContain('process.env.GARAGE_DEPLOYMENT_ENV === "staging"');
    expect(source).toContain('key: "X-Robots-Tag"');
    expect(source).toContain('value: "noindex, nofollow, noarchive"');
    expect(source).not.toContain('VERCEL_URL');
  });

  test('adds staging metadata robots without changing the production default', async () => {
    const source = await readFile('src/app/layout.tsx', 'utf8');
    expect(source).toContain('process.env.GARAGE_DEPLOYMENT_ENV === "staging"');
    expect(source).toContain('index: false');
    expect(source).toContain('follow: false');
    expect(source).toContain('noarchive: true');
    expect(source).toContain('nosnippet: true');
    expect(source).toContain(': { index: true, follow: true }');
  });

  test('serves a full crawl deny with no staging sitemap', async () => {
    const source = await readFile('src/app/robots.ts', 'utf8');
    expect(source).toContain('process.env.GARAGE_DEPLOYMENT_ENV === "staging"');
    expect(source).toContain('disallow: "/"');
    expect(source.indexOf('if (isStagingDeployment)')).toBeLessThan(source.indexOf('sitemap:'));
  });
});
