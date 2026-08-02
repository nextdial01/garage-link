#!/usr/bin/env node

import { access } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3014';
const candidates = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
let executablePath = null;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* try next approved local browser */ }
}
if (!executablePath) throw new Error('LOCAL_CHROME_NOT_AVAILABLE');

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const routes = ['/', '/pricing', '/login', '/membership/accept', '/dashboard', '/vehicles', '/customers', '/deals', '/inventory-counts', '/maintenance'];
const results = [];
try {
  for (const route of routes) {
    const errors = [];
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' });
    const content = (await page.locator('body').innerText()).trim().length > 0;
    const text = await page.locator('body').innerText();
    const overlays = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
    const pricingContract = route === '/pricing'
      ? ['7,480', '16,280', '32,780'].every((value) => text.includes(value))
        && (!text.includes('L-LINK連携') || text.includes('提供準備中'))
      : true;
    results.push({ viewport: 'pc', route, status: response?.status() ?? 0, content, pricingContract, overlays, consoleErrors: errors });
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(message.text()); });
  mobile.on('pageerror', (error) => mobileErrors.push(error.message));
  const mobileResponse = await mobile.goto(`${baseURL}/pricing`, { waitUntil: 'networkidle' });
  const mobileText = await mobile.locator('body').innerText();
  results.push({
    viewport: 'mobile',
    route: '/pricing',
    status: mobileResponse?.status() ?? 0,
    content: mobileText.trim().length > 0,
    pricingContract: ['7,480', '16,280', '32,780'].every((value) => mobileText.includes(value))
      && (!mobileText.includes('L-LINK連携') || mobileText.includes('提供準備中')),
    horizontalOverflow: await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    overlays: await mobile.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count(),
    consoleErrors: mobileErrors,
  });
  await mobile.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
if (results.some((row) => row.status >= 500 || !row.content || !row.pricingContract || row.horizontalOverflow || row.overlays > 0 || row.consoleErrors.length > 0)) {
  throw new Error('LOCAL_BROWSER_SMOKE_FAILED');
}
console.log('LOCAL_BROWSER_SMOKE_PASS');
