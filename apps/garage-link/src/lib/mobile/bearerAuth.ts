import 'server-only';

import type { User } from '@supabase/supabase-js';
import { resolveStoreTenantContext, type GarageTenantRole } from '@/lib/security/garageTenantContext';
import { createBearerAuthClient, createBearerClient } from '@/lib/supabase/admin';

type MembershipRow = {
  tenant_id: string;
  role: string | null;
  display_name: string | null;
  joined_at: string | null;
  invite_accepted_at: string | null;
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

type GarageUiContextProviderError = {
  code: string | null;
  message: string | null;
  details: string | null;
  hint: string | null;
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

function providerErrorClass(error: GarageUiContextProviderError | null) {
  const message = [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (message.includes('g1d_unauthenticated')) return 'jwt_context_missing';
  if (message.includes('g1d_active_store_required')) return 'active_store_missing';
  if (message.includes('g1d_store_forbidden')) return 'store_forbidden';
  if (message.includes('email otp verification is required for administrator access')) return 'admin_security_required';
  if (message.includes('permission denied for function')) return 'function_execute_denied';
  if (message.includes('permission denied for relation') || message.includes('row-level security')) return 'relation_read_denied';
  if (message.includes('permission denied')) return 'permission_denied';
  return message ? 'other_provider_error' : null;
}

/**
 * The existing web session calls this SECURITY DEFINER context RPC through
 * PostgREST with the caller's JWT. Keep mobile on the identical authenticated
 * transport: a server SDK client without a persisted session can otherwise
 * fall back to anon before PostgreSQL evaluates auth.uid().
 */
const MOBILE_TRUST_HEADER = 'x-garage-trusted-device-token';

function trustedDeviceToken(request: Request) {
  const token = request.headers.get(MOBILE_TRUST_HEADER)?.trim() ?? '';
  return /^[0-9a-f]{64}$/i.test(token) ? token : '';
}

async function callGarageRpc(token: string, trustedToken: string, name: 'get_garage_ui_context_v2' | 'switch_active_garage_store', input: Record<string, string> = {}): Promise<{
  data: Record<string, unknown> | null;
  error: GarageUiContextProviderError | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) {
    return { data: null, error: { code: 'mobile_config_missing', message: null, details: null, hint: null } };
  }
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      ...(trustedToken ? { [MOBILE_TRUST_HEADER]: trustedToken } : {}),
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    return {
      data: null,
      error: {
        code: typeof body?.code === 'string' ? body.code.slice(0, 32) : `http_${response.status}`,
        message: typeof body?.message === 'string' ? body.message.slice(0, 160) : null,
        details: typeof body?.details === 'string' ? body.details.slice(0, 160) : null,
        hint: typeof body?.hint === 'string' ? body.hint.slice(0, 160) : null,
      },
    };
  }
  const raw = await response.json().catch(() => null);
  return {
    data: raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null,
    error: null,
  };
}

async function authenticatedMember(request: Request) {
  const token = bearerToken(request);
  if (!token) return denied(401, 'unauthorized', 'ログイン情報を取得できませんでした。');
  const trustedToken = trustedDeviceToken(request);
  const service = createBearerClient(token, trustedToken ? { [MOBILE_TRUST_HEADER]: trustedToken } : {});
  const auth = createBearerAuthClient();
  if (!service || !auth) return denied(500, 'mobile_config_missing', 'サーバー側の認証設定が不足しています。');

  const { data: userData, error: userError } = await auth.auth.getUser(token);
  if (userError || !userData.user?.id) return denied(401, 'unauthorized', 'ログイン情報を取得できませんでした。');

  // Reuse the existing Web application's authenticated UI-context contract,
  // which derives auth.uid(), membership, role, and stores on the server.
  // Mobile remains deliberately fail-closed to the resolved tenant.
  const contextResult = await callGarageRpc(token, trustedToken, 'get_garage_ui_context_v2');
  const context = contextResult.data as GarageUiContext | null;
  const contextError = contextResult.error;
  if (contextError || !context || !['active', 'selection_required'].includes(context.state ?? '') || !Array.isArray(context.stores)) {
    console.warn('[garage-mobile-auth]', { stage: 'ui_context', providerCode: contextError?.code ?? null, providerClass: providerErrorClass(contextError) });
    if (providerErrorClass(contextError) === 'admin_security_required') {
      return denied(403, 'admin_security_required', 'このアカウントには追加の本人確認が必要です。');
    }
    return denied(403, 'forbidden_store_context', '所属情報を確認できませんでした。');
  }

  // The selection_required RPC role belongs to one membership, not every
  // tenant in stores. Read only this authenticated user's current memberships.
  // The RPC list remains the authority for assignments and store eligibility.
  const { data: membershipData, error: membershipError } = await service.from('memberships')
    .select('tenant_id, role, display_name, joined_at, invite_accepted_at')
    .eq('user_id', userData.user.id).eq('status', 'active')
    .is('disabled_at', null).is('deleted_at', null);
  if (membershipError || !Array.isArray(membershipData)) return denied(403, 'forbidden_membership', '所属情報を確認できませんでした。');
  const memberships = membershipData as MembershipRow[];
  const activeStores: GarageMobileStore[] = (context.stores as AccessibleStoreRow[]).flatMap((store) => {
    if (!store?.id || !store.tenant_id) return [];
    const matches = memberships.filter((membership) => membership.tenant_id === store.tenant_id
      && Boolean(membership.invite_accepted_at || membership.joined_at));
    const role = matches.length === 1 ? roleFrom(matches[0].role) : null;
    if (!role) return [];
    return [{
      id: store.id,
      tenantId: store.tenant_id,
      name: store.name || store.company_name || '名称未設定の店舗',
      role,
    }];
  });
  if (!activeStores.length) return denied(403, 'forbidden_resolved_store', '所属情報を確認できませんでした。');

  return { ok: true as const, service, user: userData.user, stores: activeStores, memberships, context, token, trustedToken };
}

/** Validates the bearer identity and selected store on every mobile request. */
export async function getGarageMobileBearerContext(request: Request) {
  const identity = await authenticatedMember(request);
  if (!identity.ok) return identity;
  const storeId = request.headers.get('x-garage-store-id')?.trim() || '';
  if (!storeId) return denied(400, 'store_required', '店舗を選択してください。');
  const store = identity.stores.find((candidate) => candidate.id === storeId);
  if (!store) return denied(403, 'forbidden_store', 'この店舗へアクセスする権限がありません。');
  if (identity.context.state !== 'active' || identity.context.store_id !== store.id
    || identity.context.tenant_id !== store.tenantId || identity.context.role !== store.role) {
    return denied(409, 'store_selection_required', '店舗を選び直してください。');
  }
  const membership = identity.memberships.find((member) => member.tenant_id === store.tenantId);
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
      member: { storeId: store.id, tenantId: store.tenantId, role: store.role, displayName: membership?.display_name ?? null, email: identity.user.email ?? null },
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

/** Explicit native selection uses the same authenticated RPC as the web. */
export async function selectGarageMobileStore(request: Request, tenantId: string, storeId: string) {
  const identity = await authenticatedMember(request);
  if (!identity.ok) return identity;
  const store = identity.stores.find((candidate) => candidate.id === storeId && candidate.tenantId === tenantId);
  if (!store) return denied(403, 'forbidden_store', 'この店舗へアクセスする権限がありません。');
  const result = await callGarageRpc(identity.token, identity.trustedToken, 'switch_active_garage_store', {
    p_tenant_id: tenantId, p_store_id: storeId, p_correlation_id: crypto.randomUUID(),
  });
  if (result.error) {
    if (providerErrorClass(result.error) === 'admin_security_required') return denied(403, 'admin_security_required', 'このアカウントには追加の本人確認が必要です。');
    return denied(result.error.code === '42501' ? 403 : 409, 'store_selection_failed', '店舗を切り替えられませんでした。再度選択してください。');
  }
  if (result.data?.ok !== true || result.data.tenant_id !== tenantId || result.data.store_id !== storeId || result.data.role !== store.role) {
    return denied(409, 'store_selection_failed', '店舗の切り替え結果を確認できませんでした。');
  }
  // Membership and the server-side preference may change concurrently. Read
  // both again; never authorize business access from the switch response alone.
  const headers = new Headers(request.headers);
  headers.set('x-garage-store-id', storeId);
  const verified = await getGarageMobileBearerContext(new Request(request.url, { headers }));
  if (!verified.ok) return verified;
  return { ok: true as const, store };
}
