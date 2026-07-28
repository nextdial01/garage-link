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
const page = await browser.newPage();
const routes = ['/', '/login', '/membership/accept', '/dashboard', '/vehicles', '/customers', '/deals', '/inventory-counts', '/maintenance'];
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
    const overlays = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
    results.push({ route, status: response?.status() ?? 0, content, overlays, consoleErrors: errors.length });
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
if (results.some((row) => row.status >= 500 || !row.content || row.overlays > 0 || row.consoleErrors > 0)) {
  throw new Error('LOCAL_BROWSER_SMOKE_FAILED');
}
console.log('LOCAL_BROWSER_SMOKE_PASS');
