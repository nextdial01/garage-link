import {
  GARAGE_PLANS,
  type GaragePlanCode,
} from './garagePlans';

export const GARAGE_BILLING_CURRENCY = 'jpy' as const;
export const GARAGE_BILLING_INTERVAL = 'month' as const;

export const GARAGE_STRIPE_PRICE_ENV = {
  starter: 'STRIPE_PRICE_STARTER',
  standard: 'STRIPE_PRICE_STANDARD',
  pro: 'STRIPE_PRICE_PRO',
} as const satisfies Record<Exclude<GaragePlanCode, 'free'>, string>;

export const GARAGE_ADDON_PRICE_ENV = {
  extra_staff: 'STRIPE_PRICE_EXTRA_STAFF',
  extra_store: 'STRIPE_PRICE_EXTRA_STORE',
  extra_storage_10gb: 'STRIPE_PRICE_EXTRA_STORAGE_10GB',
} as const;

export type GarageStripeSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'paused'
  | 'canceled';

export type GarageBillingState =
  | 'checkout_pending'
  | 'initial_payment_pending'
  | 'active'
  | 'grace_period'
  | 'restricted'
  | 'unpaid'
  | 'cancellation_scheduled'
  | 'canceled'
  | 'reconciliation_required';

export type GarageBillingAccess = {
  state: GarageBillingState;
  paidEntitlementsEnabled: boolean;
  businessReadEnabled: boolean;
  businessWriteEnabled: boolean;
  billingRecoveryEnabled: boolean;
};

export function parseGarageGraceDays(value: string | null | undefined) {
  if (!value?.trim()) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 30) {
    throw new Error('GARAGE_BILLING_GRACE_DAYS must be an integer from 0 to 30');
  }
  return parsed;
}

export function resolveGarageBillingState(input: {
  stripeStatus: GarageStripeSubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  graceEndsAt?: string | null;
  now?: Date;
}): GarageBillingState {
  if (input.stripeStatus === 'canceled') return 'canceled';
  if (input.stripeStatus === 'incomplete') return 'initial_payment_pending';
  if (input.stripeStatus === 'incomplete_expired' || input.stripeStatus === 'unpaid') return 'unpaid';
  if (input.stripeStatus === 'paused') return 'restricted';
  if (input.stripeStatus === 'past_due') {
    const deadline = input.graceEndsAt ? Date.parse(input.graceEndsAt) : Number.NaN;
    return Number.isFinite(deadline) && deadline > (input.now ?? new Date()).getTime()
      ? 'grace_period'
      : 'restricted';
  }
  if (input.cancelAtPeriodEnd) return 'cancellation_scheduled';
  return 'active';
}

export function getGarageBillingAccess(state: GarageBillingState): GarageBillingAccess {
  if (state === 'active' || state === 'cancellation_scheduled') {
    return {
      state,
      paidEntitlementsEnabled: true,
      businessReadEnabled: true,
      businessWriteEnabled: true,
      billingRecoveryEnabled: true,
    };
  }
  if (state === 'grace_period') {
    return {
      state,
      paidEntitlementsEnabled: true,
      businessReadEnabled: true,
      businessWriteEnabled: true,
      billingRecoveryEnabled: true,
    };
  }
  return {
    state,
    paidEntitlementsEnabled: false,
    businessReadEnabled: false,
    businessWriteEnabled: false,
    billingRecoveryEnabled: true,
  };
}

export function expectedGarageStripeAmount(plan: Exclude<GaragePlanCode, 'free'>) {
  return GARAGE_PLANS[plan].monthlyPrice;
}

