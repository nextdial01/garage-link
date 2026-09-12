import type Stripe from 'stripe';

type InvoiceWithSubscriptionMetadata = Stripe.Invoice & {
  parent?: {
    subscription_details?: {
      metadata?: Record<string, string> | null;
    } | null;
  } | null;
};

export type GarageWebhookOwnership = 'garage' | 'foreign' | 'needs_subscription_lookup';

export function hasGarageSubscriptionMetadata(
  metadata: Record<string, string> | null | undefined,
) {
  return Boolean(metadata?.company_id?.trim() && metadata?.plan_code?.trim());
}

export function classifyGarageWebhookEvent(event: Stripe.Event): GarageWebhookOwnership {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      return hasGarageSubscriptionMetadata(session.metadata) ? 'garage' : 'foreign';
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      return hasGarageSubscriptionMetadata(subscription.metadata) ? 'garage' : 'foreign';
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as InvoiceWithSubscriptionMetadata;
      const metadata = invoice.parent?.subscription_details?.metadata;
      return metadata ? (hasGarageSubscriptionMetadata(metadata) ? 'garage' : 'foreign') : 'needs_subscription_lookup';
    }
    default:
      return 'foreign';
  }
}
