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
    // Playwright trace/HAR capture records full request headers, and CI uploads
    // test-results/playwright-report as a 30-day artifact - both would leak
    // VERCEL_AUTOMATION_BYPASS_SECRET (sent on every request below) to anyone
    // with repo Actions-read access. Never trace while the bypass header is set.
    trace: bypassSecret ? 'off' : 'on-first-retry',
    ...(bypassSecret
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret } }
      : {}),
  },
});
