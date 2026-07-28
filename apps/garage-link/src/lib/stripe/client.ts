import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { GARAGE_PLAN_ORDER, type GaragePlanCode } from '@/lib/billing/garagePlans';
import { isAllowedStripeSecretKey, isPreviewStripeMockEnabled } from '@/lib/security/runtimeSafety';

let stripeClient: Stripe | null = null;
let previewStripeMock: Stripe | null = null;
const previewCheckoutSessions = new Map<string, Record<string, unknown>>();

function getPreviewStripeMock() {
  if (previewStripeMock) return previewStripeMock;
  const verifier = new Stripe('sk_test_garage_preview_fixture', { apiVersion: '2026-06-24.dahlia' });
  const mock = {
    billingPortal: {
      sessions: {
        create: async () => ({
          id: `bps_test_garage_preview_${randomUUID().replaceAll('-', '')}`,
          url: 'https://example.invalid/garage-link/stripe-test/portal',
        }),
      },
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          const id = `cs_test_garage_preview_${randomUUID().replaceAll('-', '')}`;
          const session = {
            id,
            url: `https://example.invalid/garage-link/stripe-test/${id}`,
            metadata: params.metadata ?? {},
            client_reference_id: params.client_reference_id ?? null,
            customer: 'cus_test_garage_preview',
            subscription: 'sub_test_garage_preview',
            payment_status: 'paid',
          };
          previewCheckoutSessions.set(id, session);
          return session;
        },
        retrieve: async (id: string) => previewCheckoutSessions.get(id) ?? {
          id,
          metadata: {},
          client_reference_id: null,
          customer: 'cus_test_garage_preview',
          subscription: 'sub_test_garage_preview',
          payment_status: 'unpaid',
        },
      },
    },
    subscriptions: {
      retrieve: async (id: string) => ({
        id,
        metadata: {},
        items: { data: [{ id: 'si_test_garage_preview', current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30 }] },
      }),
      update: async (id: string, params: Record<string, unknown>) => ({ id, ...params }),
    },
    invoices: {
      list: async () => ({ data: [], has_more: false }),
      retrieve: async (id: string) => ({ id, customer: 'cus_test_garage_preview', hosted_invoice_url: null, invoice_pdf: null }),
    },
    webhooks: verifier.webhooks,
  };
  previewStripeMock = mock as unknown as Stripe;
  return previewStripeMock;
}

export function getStripeClient() {
  if (isPreviewStripeMockEnabled()) return getPreviewStripeMock();
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey || !isAllowedStripeSecretKey(secretKey)) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
    });
  }

  return stripeClient;
}

export function isStripeConfigured() {
  return isPreviewStripeMockEnabled() || isAllowedStripeSecretKey(process.env.STRIPE_SECRET_KEY);
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
