import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';

export const LINE_IMMEDIATE_DELIVERY_LIMIT = 500;
export const DELIVERY_TARGET_MISMATCH_MIN_DELTA = 10;
export const DELIVERY_TARGET_MISMATCH_RATIO = 0.2;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitKey = {
  tenantId: string | null;
  userId: string;
  ipAddress: string | null;
  action: 'test' | 'confirm' | 'send';
};

const buckets = new Map<string, RateLimitBucket>();

function bucketKey({ tenantId, userId, ipAddress, action }: RateLimitKey) {
  return [tenantId ?? 'store', userId, ipAddress ?? 'unknown-ip', action].join(':');
}

export function canExecuteLineDelivery(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canTestLineDelivery(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'staff' || role === 'implementer';
}

export function assertTargetCountIsSafe(targetCount: number) {
  if (targetCount < 1) {
    throw new Error('配信対象がありません。');
  }

  if (targetCount > LINE_IMMEDIATE_DELIVERY_LIMIT) {
    throw new Error(`即時配信の上限は${LINE_IMMEDIATE_DELIVERY_LIMIT}件です。予約配信または分割配信で実行してください。`);
  }
}

export function needsTargetReconfirmation(snapshotCount: number | null | undefined, currentCount: number) {
  if (!snapshotCount || snapshotCount < 1) {
    return true;
  }

  const delta = Math.abs(currentCount - snapshotCount);
  return delta >= DELIVERY_TARGET_MISMATCH_MIN_DELTA && delta / snapshotCount >= DELIVERY_TARGET_MISMATCH_RATIO;
}

export async function enforceLineDeliveryRateLimit({
  supabase,
  tenantId,
  userId,
  ipAddress,
  action,
}: RateLimitKey & {
  supabase: Parameters<typeof logSecurityEvent>[0]['supabase'];
}) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = action === 'send' ? 5 : 20;
  const key = bucketKey({ tenantId, userId, ipAddress, action });
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;

  if (current.count > limit) {
    await logSecurityEvent({
      supabase,
      tenantId,
      userId,
      eventType: 'delivery_rate_limited',
      severity: 'high',
      ipAddress,
      details: {
        action,
        limit,
      },
    });

    throw new Error('短時間に配信操作が集中しています。少し時間をおいて再実行してください。');
  }
}
