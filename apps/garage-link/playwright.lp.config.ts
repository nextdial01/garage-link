import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/lp',
  testMatch: '**/*.test.ts',
  fullyParallel: false,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3011',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm start:lp-qa',
    url: 'http://127.0.0.1:3011',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
