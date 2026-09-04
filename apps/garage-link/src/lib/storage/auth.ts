import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  resolveStoreTenantContext,
  type GarageTenantRole,
} from '@/lib/security/garageTenantContext';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';

type StoreMemberRow = {
  tenant_id: string;
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

export function canUploadFile(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'staff' || role === 'implementer';
}

export function canDeleteFile(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canReadFile(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'staff' || role === 'viewer' || role === 'implementer';
}

export function serviceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
}

export function userAgent(request: Request) {
  return request.headers.get('user-agent');
}

export async function getStorageAuthContext(request: Request) {
  if (/^Bearer\s+\S+/i.test(request.headers.get('authorization') ?? '')) {
    const mobile = await getGarageMobileBearerContext(request);
    if (!mobile.ok) return mobile;
    return {
      ...mobile,
      // Storage audit/security events must be durable even when the request is
      // bearer-authenticated, so use the already revalidated service client.
      supabase: mobile.service,
    };
  }
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: 'ログイン情報を取得できませんでした。', code: 'unauthorized' }, { status: 401 }),
    };
  }

  const { data: accessibleTenantIds, error: scopeError } = await supabase.rpc('current_user_tenant_ids', {});
  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('current_user_active_store_membership')
    .select('tenant_id, store_id, role, display_name, email')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .single();

  if (
    scopeError
    || memberError
    || !member?.store_id
    || !member.tenant_id
    || !Array.isArray(accessibleTenantIds)
    || !accessibleTenantIds.includes(member.tenant_id)
  ) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: '所属店舗またはtenant情報を取得できませんでした。', code: 'forbidden_no_membership' }, { status: 403 }),
    };
  }

  const service = serviceSupabase();
  if (!service) {
    console.error('[garage-link:error]', JSON.stringify({ service: 'garage-link', code: 'storage_config_missing', route: 'storage/auth' }));
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: 'サーバー側Storage設定が未設定です。', code: 'storage_config_missing' }, { status: 500 }),
    };
  }

  const role = member.role === 'owner' || member.role === 'admin' || member.role === 'implementer'
    || member.role === 'staff' || member.role === 'viewer' ? member.role : null;
  if (!role) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: '権限情報が不正です。', code: 'forbidden_role' }, { status: 403 }),
    };
  }
  let tenantContext;
  try {
    tenantContext = await resolveStoreTenantContext(service, {
      expectedTenantId: member.tenant_id,
      storeId: member.store_id,
      actorUserId: userData.user.id,
      actorRole: role as GarageTenantRole,
      source: 'api',
      correlationId: request.headers.get('x-correlation-id')?.slice(0, 80) || crypto.randomUUID(),
    });
  } catch {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: '店舗scopeを確認できませんでした。', code: 'forbidden_scope' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase,
    service,
    tenantContext,
    user: userData.user,
    member: {
      storeId: member.store_id,
      tenantId: member.tenant_id,
      role: member.role ?? 'viewer',
      displayName: member.display_name,
      email: member.email ?? userData.user.email ?? null,
    },
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  };
}
