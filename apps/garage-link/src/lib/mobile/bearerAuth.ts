import 'server-only';

import type { User } from '@supabase/supabase-js';
import { resolveStoreTenantContext, type GarageTenantRole } from '@/lib/security/garageTenantContext';
import { createBearerAuthClient, createBearerClient } from '@/lib/supabase/admin';

type MembershipRow = {
  tenant_id: string;
  role: string | null;
  display_name: string | null;
};

type AccessibleStoreRow = { id: string; tenant_id: string; name: string | null; company_name: string | null };
type GarageUiContext = {
  state: string | null;
  tenant_id: string | null;
  store_id: string | null;
  role: string | null;
  display_name: string | null;
  stores: unknown;
};

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

function providerErrorClass(error: { message?: string | null } | null) {
  const message = error?.message?.toLowerCase() ?? '';
  if (message.includes('g1d_unauthenticated')) return 'jwt_context_missing';
  if (message.includes('g1d_active_store_required')) return 'active_store_missing';
  if (message.includes('g1d_store_forbidden')) return 'store_forbidden';
  if (message.includes('permission denied for function')) return 'function_execute_denied';
  if (message.includes('permission denied')) return 'permission_denied';
  if (message.includes('permission denied for relation') || message.includes('row-level security')) return 'relation_read_denied';
  return message ? 'other_provider_error' : null;
}

async function authenticatedMember(request: Request) {
  const token = bearerToken(request);
  if (!token) return denied(401, 'unauthorized', 'ログイン情報を取得できませんでした。');
  const service = createBearerClient(token);
  const auth = createBearerAuthClient();
  if (!service || !auth) return denied(500, 'mobile_config_missing', 'サーバー側の認証設定が不足しています。');

  const { data: userData, error: userError } = await auth.auth.getUser(token);
  if (userError || !userData.user?.id) return denied(401, 'unauthorized', 'ログイン情報を取得できませんでした。');

  // Direct memberships and the external accessible-stores RPC have a narrower
  // Production grant contract than their server-side implementations. Reuse
  // the existing Web application's authenticated UI-context contract, which
  // derives auth.uid(), membership, role, and stores on the server. Mobile is
  // deliberately fail-closed to the context's resolved tenant.
  const { data: rawContext, error: contextError } = await service.rpc('get_garage_ui_context_v2');
  const context = rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)
    ? rawContext as GarageUiContext
    : null;
  const role = roleFrom(context?.role ?? null);
  if (contextError || !context || context.state !== 'active' || !context.tenant_id || !context.store_id || !role || !Array.isArray(context.stores)) {
    console.warn('[garage-mobile-auth]', { stage: 'ui_context', providerCode: contextError?.code?.slice(0, 32) ?? null, providerClass: providerErrorClass(contextError) });
    return denied(403, 'forbidden_store_context', '所属情報を確認できませんでした。');
  }

  const activeStores: GarageMobileStore[] = (context.stores as AccessibleStoreRow[]).flatMap((store) => {
    if (!store?.id || store.tenant_id !== context.tenant_id) return [];
    return [{
      id: store.id,
      tenantId: store.tenant_id,
      name: store.name || store.company_name || '名称未設定の店舗',
      role,
    }];
  });
  if (!activeStores.length) return denied(403, 'forbidden_resolved_store', '所属情報を確認できませんでした。');

  const membership: MembershipRow = { tenant_id: context.tenant_id, role, display_name: context.display_name };

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
