import 'server-only';
import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitAction = 'csv_export' | 'csv_import_preview' | 'csv_import_commit' | 'file_upload';

const buckets = new Map<string, RateLimitBucket>();

const limits: Record<RateLimitAction, { limit: number; windowMs: number; eventType: 'csv_export_rate_limited' | 'csv_import_rate_limited' | 'file_upload_rate_limited' }> = {
  csv_export: { limit: 10, windowMs: 60 * 60 * 1000, eventType: 'csv_export_rate_limited' },
  csv_import_preview: { limit: 20, windowMs: 60 * 60 * 1000, eventType: 'csv_import_rate_limited' },
  csv_import_commit: { limit: 5, windowMs: 60 * 60 * 1000, eventType: 'csv_import_rate_limited' },
  file_upload: { limit: 30, windowMs: 60 * 60 * 1000, eventType: 'file_upload_rate_limited' },
};

function keyFor({
  tenantId,
  userId,
  ipAddress,
  action,
}: {
  tenantId: string | null;
  userId: string;
  ipAddress: string | null;
  action: RateLimitAction;
}) {
  return [tenantId ?? 'store', userId, ipAddress ?? 'unknown-ip', action].join(':');
}

export async function enforceSecurityRateLimit({
  supabase,
  tenantId,
  userId,
  ipAddress,
  action,
}: {
  supabase: Parameters<typeof logSecurityEvent>[0]['supabase'];
  tenantId: string | null;
  userId: string;
  ipAddress: string | null;
  action: RateLimitAction;
}) {
  const config = limits[action];
  const key = keyFor({ tenantId, userId, ipAddress, action });
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return;
  }

  current.count += 1;

  if (current.count > config.limit) {
    await logSecurityEvent({
      supabase,
      tenantId,
      userId,
      eventType: config.eventType,
      severity: 'high',
      ipAddress,
      details: {
        action,
        limit: config.limit,
      },
    });

    throw new Error('CSV操作が短時間に集中しています。時間をおいて再実行してください。');
  }
}
