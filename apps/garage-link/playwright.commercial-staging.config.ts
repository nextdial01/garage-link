import { defineConfig, devices } from '@playwright/test';

// Billing sessions stay in each browser context; no reusable credential file is written.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Traces can capture bearer tokens and Checkout session URLs.
    trace: 'off',
    ...(bypassSecret
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret } }
      : {}),
  },
  projects: [
    {
      name: 'billing',
      testMatch: /billing-stripe-lifecycle\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
