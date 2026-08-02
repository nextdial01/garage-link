import { defineConfig, devices } from '@playwright/test';

// Dedicated config for the commercial staging billing lifecycle - kept separate from
// playwright.config.ts (used by `pnpm test:e2e` for every other spec file) so the
// auth-bootstrap-once + storageState-reuse project pair here can never affect ordinary
// developer test runs.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

// Never committed, never logged, never used against Production - auth.setup.ts chmods
// it 600 right after writing, and the CI workflow deletes it in an always-run final step.
export const STORAGE_STATE_PATH = process.env.E2E_STORAGE_STATE_PATH?.trim()
  || `${process.env.RUNNER_TEMP ?? '/tmp'}/garage-link-e2e-storage-state.json`;

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: bypassSecret ? 'off' : 'on-first-retry',
    ...(bypassSecret
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret } }
      : {}),
  },
  projects: [
    {
      name: 'billing-auth-setup',
      testMatch: /billing-auth\.setup\.ts/,
    },
    {
      name: 'billing',
      testMatch: /billing-stripe-lifecycle\.spec\.ts/,
      dependencies: ['billing-auth-setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_PATH },
    },
  ],
});
