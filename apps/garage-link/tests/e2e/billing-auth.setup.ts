import { test as setup } from '@playwright/test';
import { login } from './helpers';

// Optional standalone login check. Session credentials remain in memory only.
setup('authenticate without persisting session', async ({ page }) => {
  await login(page);
});
