import { defineConfig } from '@playwright/test';

// Vercel Preview deployments (needed for the release-QA previewOtp sink) sit behind
// SSO Deployment Protection. VERCEL_AUTOMATION_BYPASS_SECRET is Vercel's own
// convention for this: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    ...(bypassSecret
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret } }
      : {}),
  },
});
