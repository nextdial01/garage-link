import 'server-only';

import type { User } from '@supabase/supabase-js';
import { resolveStoreTenantContext, type GarageTenantRole } from '@/lib/security/garageTenantContext';
import { createBearerClient } from '@/lib/supabase/admin';

type MembershipRow = {
  id: string;
  tenant_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
  status: string | null;
  disabled_at: string | null;
  deleted_at: string | null;
  invite_accepted_at: string | null;
  joined_at: string | null;
};

type StoreRow = { id: string; tenant_id: string; name: string | null; company_name: string | null; status: string | null };

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

  const { data: memberships, error: membershipError } = await service
    .from('memberships')
    .select('id, tenant_id, role, display_name, email, status, disabled_at, deleted_at, invite_accepted_at, joined_at')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .is('disabled_at', null)
    .is('deleted_at', null);
  if (membershipError || !Array.isArray(memberships)) return denied(403, 'forbidden_no_membership', '所属情報を確認できませんでした。');

  const active = (memberships as MembershipRow[]).filter((membership) =>
    Boolean(roleFrom(membership.role) && (membership.invite_accepted_at || membership.joined_at))
  );
  if (!active.length) return denied(403, 'forbidden_no_membership', '所属情報を確認できませんでした。');

  return { ok: true as const, service, user: userData.user, memberships: active };
}

async function accessibleStores(service: NonNullable<ReturnType<typeof createBearerClient>>, userId: string, memberships: MembershipRow[]) {
  const tenantIds = [...new Set(memberships.map((membership) => membership.tenant_id))];
  const membershipIds = memberships.map((membership) => membership.id);
  const [{ data: stores, error: storesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    service.from('stores').select('id, tenant_id, name, company_name, status').in('tenant_id', tenantIds).in('status', ['active', 'trial']),
    service.from('membership_store_assignments').select('membership_id, tenant_id, store_id, deleted_at').in('membership_id', membershipIds).is('deleted_at', null),
  ]);
  if (storesError || assignmentsError || !Array.isArray(stores) || !Array.isArray(assignments)) return [];
  const assigned = new Set((assignments as Array<{ membership_id: string; store_id: string }>).map((row) => `${row.membership_id}:${row.store_id}`));
  return (stores as StoreRow[]).flatMap((store) => {
    const membership = memberships.find((candidate) => candidate.tenant_id === store.tenant_id);
    const role = membership ? roleFrom(membership.role) : null;
    if (!membership || !role || (role !== 'owner' && role !== 'admin' && !assigned.has(`${membership.id}:${store.id}`))) return [];
    return [{ id: store.id, tenantId: store.tenant_id, name: store.name || store.company_name || '名称未設定の店舗', role }];
  });
}

/** Validates the bearer identity and selected store on every mobile request. */
export async function getGarageMobileBearerContext(request: Request) {
  const identity = await authenticatedMember(request);
  if (!identity.ok) return identity;
  const storeId = request.headers.get('x-garage-store-id')?.trim() || '';
  if (!storeId) return denied(400, 'store_required', '店舗を選択してください。');
  const stores = await accessibleStores(identity.service, identity.user.id, identity.memberships);
  const store = stores.find((candidate) => candidate.id === storeId);
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
      member: { storeId: store.id, tenantId: store.tenantId, role: store.role, displayName: identity.memberships.find((item) => item.tenant_id === store.tenantId)?.display_name ?? null, email: identity.user.email ?? null },
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
  return { ok: true as const, user: identity.user as User, stores: await accessibleStores(identity.service, identity.user.id, identity.memberships) };
}
