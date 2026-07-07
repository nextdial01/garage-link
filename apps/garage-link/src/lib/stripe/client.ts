import Stripe from 'stripe';
import { GARAGE_PLAN_ORDER, type GaragePlanCode } from '@/lib/billing/garagePlans';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripePriceId(planCode: GaragePlanCode): string | null {
  if (planCode === 'free') {
    return null;
  }

  const envName = `STRIPE_PRICE_${planCode.toUpperCase()}` as const;
  const value = process.env[envName]?.trim();
  return value || null;
}

export function getConfiguredStripePricePlans(): GaragePlanCode[] {
  return GARAGE_PLAN_ORDER.filter((code) => code !== 'free' && Boolean(getStripePriceId(code)));
}

export function assertStripePriceId(planCode: GaragePlanCode) {
  const priceId = getStripePriceId(planCode);

  if (!priceId) {
    throw new Error(`Stripe Price ID が未設定です（${planCode}）。pnpm stripe:setup-test を実行してください。`);
  }

  return priceId;
}
