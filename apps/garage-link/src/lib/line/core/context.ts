import type { LineRole, LineTenantContext } from '@/lib/line/core/types';

export function createLineTenantContext({
  tenantId,
  storeId,
  lineAccountId,
  features = [],
  role,
}: {
  tenantId: string | null;
  storeId?: string | null;
  lineAccountId?: string | null;
  features?: string[];
  role: string | null | undefined;
}): LineTenantContext {
  const normalizedRole: LineRole =
    role === 'owner' || role === 'admin' || role === 'staff' || role === 'viewer'
      ? role
      : 'viewer';

  return {
    tenantId,
    storeId,
    lineAccountId,
    features,
    role: normalizedRole,
  };
}

export function hasLineFeature(context: LineTenantContext, feature: string) {
  return context.features.includes(feature);
}
