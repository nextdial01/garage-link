export type ContractAccessState =
  | 'active'
  | 'grace_period'
  | 'cancellation_scheduled'
  | 'checkout_pending'
  | 'initial_payment_pending'
  | 'restricted'
  | 'unpaid'
  | 'canceled'
  | 'cancelled_retention'
  | 'reconciliation_required'
  | 'no_store'
  | 'anonymous';

export type ContractAccess = {
  state: ContractAccessState;
  storeId?: string;
  plan?: string;
  stripeStatus?: string | null;
  graceEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  restorationState?: string | null;
  cancelledAt?: string | null;
  dataDeleteScheduledAt?: string | null;
};

const CANCELLED_ALLOWED_PATHS = [
  '/settings/billing',
  '/onboarding',
  '/logout',
  '/legal/terms',
  '/legal/privacy',
  '/legal/tokusho',
];

const BILLING_RECOVERY_ALLOWED_PATHS = [
  ...CANCELLED_ALLOWED_PATHS,
  '/api/billing/subscription',
  '/api/billing/checkout',
  '/api/billing/portal',
  '/api/billing/status',
  '/api/auth/logout',
];

export function isCancelledRetentionAllowedPath(pathname: string) {
  if (CANCELLED_ALLOWED_PATHS.includes(pathname)) {
    return true;
  }
  return pathname.startsWith('/legal/');
}

export function isBillingRecoveryAllowedPath(pathname: string) {
  if (BILLING_RECOVERY_ALLOWED_PATHS.includes(pathname)) return true;
  return pathname.startsWith('/legal/');
}

export function parseContractAccess(value: unknown): ContractAccess {
  if (!value || typeof value !== 'object') {
    return { state: 'reconciliation_required' };
  }

  const row = value as Record<string, unknown>;
  const state = row.state;

  if (
    state === 'cancelled_retention' ||
    state === 'active' ||
    state === 'grace_period' ||
    state === 'cancellation_scheduled' ||
    state === 'checkout_pending' ||
    state === 'initial_payment_pending' ||
    state === 'restricted' ||
    state === 'unpaid' ||
    state === 'canceled' ||
    state === 'reconciliation_required' ||
    state === 'no_store' ||
    state === 'anonymous'
  ) {
    return {
      state,
      storeId: typeof row.store_id === 'string' ? row.store_id : undefined,
      plan: typeof row.plan === 'string' ? row.plan : undefined,
      stripeStatus: typeof row.stripe_status === 'string' ? row.stripe_status : null,
      graceEndsAt: typeof row.grace_ends_at === 'string' ? row.grace_ends_at : null,
      currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
      restorationState: typeof row.restoration_state === 'string' ? row.restoration_state : null,
      cancelledAt: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
      dataDeleteScheduledAt:
        typeof row.data_delete_scheduled_at === 'string' ? row.data_delete_scheduled_at : null,
    };
  }

  return { state: 'reconciliation_required' };
}

export function resolveEffectiveContractAccess(
  access: ContractAccess,
  now = new Date(),
): ContractAccess {
  if (access.state === 'grace_period') {
    const deadline = access.graceEndsAt ? Date.parse(access.graceEndsAt) : Number.NaN;
    if (!Number.isFinite(deadline) || deadline <= now.getTime()) {
      return { ...access, state: 'restricted' };
    }
  }
  if (access.state === 'cancellation_scheduled') {
    const periodEnd = access.currentPeriodEnd ? Date.parse(access.currentPeriodEnd) : Number.NaN;
    if (!Number.isFinite(periodEnd) || periodEnd <= now.getTime()) {
      return { ...access, state: 'canceled' };
    }
  }
  if (access.restorationState === 'pending') {
    return { ...access, state: 'reconciliation_required' };
  }
  if (access.cancelledAt) {
    return { ...access, state: 'canceled' };
  }
  return access;
}

export function formatRetentionDeadline(isoDate: string | null | undefined) {
  if (!isoDate) {
    return '—';
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'long',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}
