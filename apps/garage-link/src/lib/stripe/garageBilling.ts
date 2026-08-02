import { GARAGE_PLANS, normalizeGaragePlanCode, type GaragePlanCode } from '@/lib/billing/garagePlans';

export type ApplyGaragePlanOptions = {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'suspended';
};

export function buildGaragePlanSubscriptionUpdate(
  planCode: GaragePlanCode,
  options: ApplyGaragePlanOptions = {},
) {
  const plan = GARAGE_PLANS[planCode];

  return {
    plan: planCode,
    status: options.status ?? 'active',
    included_staff_count: plan.includedStaffCount,
    included_store_count: plan.includedStoreCount,
    storage_limit_mb: plan.storageLimitMb,
    current_inventory_limit: plan.inventoryLimit,
    l_link_integration_enabled: plan.lLinkIntegrationEnabled,
    ...(options.stripeCustomerId ? { stripe_customer_id: options.stripeCustomerId } : {}),
    ...(options.stripeSubscriptionId ? { stripe_subscription_id: options.stripeSubscriptionId } : {}),
  };
}

export function parseGaragePlanCodeFromStripeMetadata(value: string | null | undefined): GaragePlanCode | null {
  const normalized = normalizeGaragePlanCode(value);
  if (normalized === 'free') {
    return null;
  }
  return normalized;
}

export function getAppBaseUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (process.env.VERCEL_ENV === 'preview' && vercelUrl) return `https://${vercelUrl}`;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // Fail closed to the local default below.
    }
  }
  return 'http://localhost:3001';
}
