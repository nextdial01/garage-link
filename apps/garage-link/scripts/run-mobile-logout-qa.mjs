import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

function parseEnvFile(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    values[key] = rawValue.startsWith('"') && rawValue.endsWith('"')
      ? JSON.parse(rawValue)
      : rawValue.replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function required(values, key) {
  const value = values[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const qaEnvPath = process.argv[2];
const baseUrl = process.argv[3];
if (!qaEnvPath || !baseUrl) {
  throw new Error('Usage: node scripts/run-mobile-logout-qa.mjs <qa-env-file> <base-url>');
}

const qaEnv = parseEnvFile(await readFile(qaEnvPath, 'utf8'));
const email = required(qaEnv, 'GARAGE_QA_EMAIL');
const password = required(qaEnv, 'GARAGE_QA_PASSWORD');
const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
const result = { ok: false, checks: {} };
let browser = null;
let page = null;

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto(`${normalizedBaseUrl}/login?next=%2Fmenu`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  const loginButton = page.getByRole('button', { name: 'ログイン', exact: true });
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 5 });
  await passwordInput.click();
  await passwordInput.pressSequentially(password, { delay: 5 });
  result.checks.credentialsEntered =
    (await emailInput.inputValue()).length > 0 && (await passwordInput.inputValue()).length > 0;
  await loginButton.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const button = document.querySelector('button[type="submit"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await loginButton.click();
  await page.waitForURL(/\/menu(?:\?.*)?$/, { timeout: 20_000 });

  const logoutLink = page.getByRole('link', { name: 'ログアウト', exact: true });
  await logoutLink.waitFor({ state: 'visible' });
  result.checks.mobileLogoutVisible = await logoutLink.isVisible();

  await logoutLink.click();
  await page.waitForURL(/\/login(?:\?.*)?$/, { timeout: 20_000 });
  result.checks.logoutReturnsToLogin = true;

  await page.goto(`${normalizedBaseUrl}/dashboard`, { waitUntil: 'networkidle' });
  result.checks.protectedPageRejected = /\/login(?:\?|$)/.test(page.url());
  result.checks.browserErrors = browserErrors;
  result.ok =
    result.checks.mobileLogoutVisible === true &&
    result.checks.logoutReturnsToLogin === true &&
    result.checks.protectedPageRejected === true &&
    browserErrors.length === 0;
} catch (error) {
  result.failure = {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message.split('\n')[0] : 'QA test failed',
    url: page ? page.url() : null,
  };
} finally {
  if (browser) await browser.close();
}

console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;
