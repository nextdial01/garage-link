import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/security',
  testMatch: '**/*.test.ts',
  fullyParallel: true,
  reporter: 'list',
});
