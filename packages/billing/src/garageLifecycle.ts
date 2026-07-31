export const GARAGE_MAX_RETRY_ATTEMPTS = 5;

export function garageRetryDelayMs(attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error('retry attempt must be a positive integer');
  }
  return Math.min(60, 2 ** attempt) * 60_000;
}

export function garageNextRetryAt(attempt: number, now = new Date()) {
  return new Date(now.getTime() + garageRetryDelayMs(attempt)).toISOString();
}

export function isGarageRetryDeadLetter(attempt: number) {
  return attempt >= GARAGE_MAX_RETRY_ATTEMPTS;
}

export type GarageLease = {
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
};

export function isGarageLeaseClaimable(
  lease: GarageLease,
  workerId: string,
  now = new Date(),
) {
  if (!lease.leaseOwner || lease.leaseOwner === workerId) return true;
  const expiresAt = lease.leaseExpiresAt ? Date.parse(lease.leaseExpiresAt) : Number.NaN;
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

export type GarageStripeSnapshotIdentity = {
  subscriptionId: string;
  observedAt: string;
  sourceEventId: string;
};

/**
 * Arrival order never selects a winner. Supported events converge on a
 * freshly retrieved Stripe subscription snapshot. Event IDs are audit-only.
 */
export function garageSnapshotKey(identity: GarageStripeSnapshotIdentity) {
  if (!identity.subscriptionId || !identity.sourceEventId) {
    throw new Error('subscription snapshot identity is incomplete');
  }
  return `${identity.subscriptionId}:${identity.observedAt}`;
}
