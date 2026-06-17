import { createClient } from '@/lib/supabase/server';
import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';

export type TenantRole = 'owner' | 'admin' | 'staff' | 'viewer';

type AuthUser = {
  id: string;
  email?: string;
};

type MembershipRow = {
  tenant_id: string;
  store_id: string | null;
  role: string | null;
  status: string | null;
  display_name: string | null;
  email: string | null;
};

type TenantFeatureRow = {
  tenant_id: string;
  feature_code: string;
  enabled: boolean | null;
};

type StoreMemberFallbackRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
  stores: {
    tenant_id: string | null;
  } | null;
};

export class TenantAuthError extends Error {
  status: number;
  eventType:
    | 'tenant_access_denied'
    | 'role_access_denied'
    | 'feature_access_denied'
    | 'suspicious_request';

  constructor(
    message: string,
    status: number,
    eventType: TenantAuthError['eventType']
  ) {
    super(message);
    this.status = status;
    this.eventType = eventType;
  }
}

function normalizeRole(role: string | null | undefined): TenantRole {
  if (role === 'owner' || role === 'admin' || role === 'staff' || role === 'viewer') {
    return role;
  }

  if (role === 'implementer') {
    return 'admin';
  }

  return 'viewer';
}

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.id) {
    throw new TenantAuthError('ログイン情報を取得できませんでした。', 401, 'suspicious_request');
  }

  return {
    supabase,
    user: data.user as AuthUser,
  };
}

export async function requireTenantMembership(tenantId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: membership } = await supabase
    .from<MembershipRow>('memberships')
    .select('tenant_id, store_id, role, status, display_name, email')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (membership?.tenant_id) {
    return {
      supabase,
      user,
      membership: {
        tenant_id: membership.tenant_id,
        store_id: membership.store_id,
        role: normalizeRole(membership.role),
        display_name: membership.display_name,
        email: membership.email ?? user.email ?? null,
      },
    };
  }

  const { data: fallbackMember } = await supabase
    .from<StoreMemberFallbackRow>('store_members')
    .select('store_id, role, display_name, email, stores(tenant_id)')
    .eq('user_id', user.id)
    .single();

  if (fallbackMember?.stores?.tenant_id === tenantId) {
    return {
      supabase,
      user,
      membership: {
        tenant_id: tenantId,
        store_id: fallbackMember.store_id,
        role: normalizeRole(fallbackMember.role),
        display_name: fallbackMember.display_name,
        email: fallbackMember.email ?? user.email ?? null,
      },
    };
  }

  throw new TenantAuthError('tenantへのアクセス権限がありません。', 403, 'tenant_access_denied');
}

export async function requireTenantRole(tenantId: string, roles: TenantRole[]) {
  const context = await requireTenantMembership(tenantId);

  if (!roles.includes(context.membership.role)) {
    throw new TenantAuthError('権限がありません。', 403, 'role_access_denied');
  }

  return context;
}

export async function requireFeature(tenantId: string, featureCode: string) {
  const context = await requireTenantMembership(tenantId);
  const { data: feature } = await context.supabase
    .from<TenantFeatureRow>('tenant_features')
    .select('tenant_id, feature_code, enabled')
    .eq('tenant_id', tenantId)
    .eq('feature_code', featureCode)
    .eq('enabled', true)
    .single();

  if (!feature?.enabled) {
    throw new TenantAuthError('この機能は有効化されていません。', 403, 'feature_access_denied');
  }

  return context;
}

export function assertSameTenant(resourceTenantId: string | null | undefined, currentTenantId: string) {
  if (!resourceTenantId || resourceTenantId !== currentTenantId) {
    throw new TenantAuthError('他tenantのデータにはアクセスできません。', 403, 'tenant_access_denied');
  }
}

export async function denyAndLogSecurityEvent({
  tenantId = null,
  userId = null,
  eventType,
  severity = 'medium',
  ipAddress = null,
  userAgent = null,
  details,
  message = '権限がありません。',
  status = 403,
}: {
  tenantId?: string | null;
  userId?: string | null;
  eventType: 'tenant_access_denied' | 'role_access_denied' | 'feature_access_denied' | 'suspicious_request';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  message?: string;
  status?: number;
}) {
  const supabase = await createClient();

  await logSecurityEvent({
    supabase,
    tenantId,
    userId,
    eventType,
    severity,
    ipAddress,
    userAgent,
    details,
  });

  return Response.json({ ok: false, error: message }, { status });
}
