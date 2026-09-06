import 'server-only';

import type { User } from '@supabase/supabase-js';
import { resolveStoreTenantContext, type GarageTenantRole } from '@/lib/security/garageTenantContext';
import { createBearerClient } from '@/lib/supabase/admin';

type MembershipRow = {
  tenant_id: string;
  role: string | null;
  display_name: string | null;
};

type AccessibleStoreRow = { id: string; tenant_id: string; name: string | null; company_name: string | null };

export type GarageMobileStore = Readonly<{ id: string; tenantId: string; name: string; role: GarageTenantRole }>;

function roleFrom(value: string | null): GarageTenantRole | null {
  return value === 'owner' || value === 'admin' || value === 'implementer' || value === 'staff' || value === 'viewer'
    ? value
    : null;
}

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  return header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

function denied(status: number, code: string, error: string) {
  return { ok: false as const, response: Response.json({ ok: false, code, error }, { status }) };
}

async function authenticatedMember(request: Request) {
  const token = bearerToken(request);
  if (!token) return denied(401, 'unauthorized', 'ログイン情報を取得できませんでした。');
  const service = createBearerClient(token);
  if (!service) return denied(500, 'mobile_config_missing', 'サーバー側の認証設定が不足しています。');

  const { data: userData, error: userError } = await service.auth.getUser(token);
  if (userError || !userData.user?.id) return denied(401, 'unauthorized', 'ログイン情報を取得できませんでした。');

  // `memberships` is intentionally not the mobile authorization read model:
  // direct relation access has a narrower RLS contract than the existing
  // web application. Resolve the caller's permitted stores through the
  // established authenticated, security-definer RPC, then resolve the
  // role for each returned tenant. Both functions derive auth.uid() on the
  // server; neither accepts client-supplied user, tenant, or store scope.
  const { data: accessible, error: accessibleError } = await service.rpc('list_accessible_garage_stores');
  if (accessibleError || !Array.isArray(accessible)) {
    console.warn('[garage-mobile-auth]', { stage: 'accessible_stores', providerCode: accessibleError?.code?.slice(0, 32) ?? null });
    return denied(403, 'forbidden_store_context', '所属情報を確認できませんでした。');
  }

  const stores = (accessible as AccessibleStoreRow[]).filter((store) =>
    Boolean(store?.id && store?.tenant_id)
  );
  if (!stores.length) return denied(403, 'forbidden_no_membership', '所属情報を確認できませんでした。');

  const roles = new Map<string, GarageTenantRole>();
  for (const tenantId of [...new Set(stores.map((store) => store.tenant_id))]) {
    const { data: role, error: roleError } = await service.rpc('current_user_role_for_tenant', { target_tenant_id: tenantId });
    const resolved = typeof role === 'string' ? roleFrom(role) : null;
    if (roleError || !resolved) {
      console.warn('[garage-mobile-auth]', { stage: 'tenant_role', providerCode: roleError?.code?.slice(0, 32) ?? null });
      return denied(403, 'forbidden_tenant_role', '所属情報を確認できませんでした。');
    }
    roles.set(tenantId, resolved);
  }

  const activeStores: GarageMobileStore[] = stores.flatMap((store) => {
    const role = roles.get(store.tenant_id);
    if (!role) return [];
    return [{
      id: store.id,
      tenantId: store.tenant_id,
      name: store.name || store.company_name || '名称未設定の店舗',
      role,
    }];
  });
  if (!activeStores.length) return denied(403, 'forbidden_resolved_store', '所属情報を確認できませんでした。');

  const { data: activeMembership } = await service
    .from('current_user_active_store_membership')
    .select('tenant_id, role, display_name')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .maybeSingle();
  const membership: MembershipRow | null = activeMembership && typeof activeMembership.tenant_id === 'string'
    ? { tenant_id: activeMembership.tenant_id, role: activeMembership.role, display_name: activeMembership.display_name }
    : null;

  return { ok: true as const, service, user: userData.user, stores: activeStores, membership };
}

/** Validates the bearer identity and selected store on every mobile request. */
export async function getGarageMobileBearerContext(request: Request) {
  const identity = await authenticatedMember(request);
  if (!identity.ok) return identity;
  const storeId = request.headers.get('x-garage-store-id')?.trim() || '';
  if (!storeId) return denied(400, 'store_required', '店舗を選択してください。');
  const store = identity.stores.find((candidate) => candidate.id === storeId);
  if (!store) return denied(403, 'forbidden_store', 'この店舗へアクセスする権限がありません。');
  try {
    const tenantContext = await resolveStoreTenantContext(identity.service, {
      expectedTenantId: store.tenantId,
      storeId: store.id,
      actorUserId: identity.user.id,
      actorRole: store.role,
      source: 'api',
      correlationId: request.headers.get('x-correlation-id')?.slice(0, 80) || crypto.randomUUID(),
    });
    return {
      ok: true as const,
      service: identity.service,
      user: identity.user as User,
      tenantContext,
      member: { storeId: store.id, tenantId: store.tenantId, role: store.role, displayName: identity.membership?.tenant_id === store.tenantId ? identity.membership.display_name : null, email: identity.user.email ?? null },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent'),
    };
  } catch {
    return denied(403, 'forbidden_scope', '店舗scopeを確認できませんでした。');
  }
}

export async function listGarageMobileStores(request: Request) {
  const identity = await authenticatedMember(request);
  if (!identity.ok) return identity;
  return { ok: true as const, user: identity.user as User, stores: identity.stores };
}
