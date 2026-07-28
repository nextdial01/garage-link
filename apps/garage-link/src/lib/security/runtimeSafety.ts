function enabled(name: string) {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

export function areExternalSendsDisabled() {
  return enabled('GARAGE_EXTERNAL_SENDS_DISABLED');
}

export function isAutomationDisabled() {
  return enabled('GARAGE_AUTOMATION_DISABLED');
}

export function isStripeTestModeRequired() {
  return enabled('GARAGE_STRIPE_TEST_MODE_REQUIRED');
}

export function isAllowedStripeSecretKey(secretKey: string | undefined) {
  if (!secretKey) return false;
  return !isStripeTestModeRequired() || secretKey.startsWith('sk_test_');
}
