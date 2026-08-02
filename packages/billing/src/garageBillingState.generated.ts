// GENERATED. Edit contract/garage-commercial-contract.json and run the generator.
export const GARAGE_BILLING_STATE_POLICY = {
  "recognizedStripeStatuses": [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "unpaid",
    "paused",
    "canceled"
  ],
  "restorationFailClosedStatuses": [
    "pending",
    "failed"
  ],
  "activeStripeStatuses": [
    "active",
    "trialing"
  ],
  "unpaidStripeStatuses": [
    "incomplete_expired",
    "unpaid"
  ],
  "unknownStripeStatus": "reconciliation_required",
  "graceBoundary": "exclusive"
} as const;

export function resolveGeneratedGarageBillingState(input: {
  stripeStatus: string;
  cancelAtPeriodEnd?: boolean;
  graceEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  canceledAt?: string | null;
  restorationState?: string;
  now?: Date;
}): string {
  const now = (input.now ?? new Date()).getTime();
  if (!(GARAGE_BILLING_STATE_POLICY.recognizedStripeStatuses as readonly string[]).includes(input.stripeStatus)) return GARAGE_BILLING_STATE_POLICY.unknownStripeStatus;
  if ((GARAGE_BILLING_STATE_POLICY.restorationFailClosedStatuses as readonly string[]).includes(input.restorationState ?? '')) return 'reconciliation_required';
  if (input.stripeStatus === 'canceled' || input.canceledAt) return 'canceled';
  if (input.stripeStatus === 'incomplete') return 'initial_payment_pending';
  if ((GARAGE_BILLING_STATE_POLICY.unpaidStripeStatuses as readonly string[]).includes(input.stripeStatus)) return 'unpaid';
  if (input.stripeStatus === 'paused') return 'restricted';
  if (input.stripeStatus === 'past_due') {
    const deadline = input.graceEndsAt ? Date.parse(input.graceEndsAt) : Number.NaN;
    return Number.isFinite(deadline) && deadline > now ? 'grace_period' : 'restricted';
  }
  if (input.cancelAtPeriodEnd) {
    const periodEnd = input.currentPeriodEnd ? Date.parse(input.currentPeriodEnd) : Number.NaN;
    if (!Number.isFinite(periodEnd)) return 'canceled';
    return periodEnd <= now ? 'canceled' : 'cancellation_scheduled';
  }
  return (GARAGE_BILLING_STATE_POLICY.activeStripeStatuses as readonly string[]).includes(input.stripeStatus) ? 'active' : GARAGE_BILLING_STATE_POLICY.unknownStripeStatus;
}
