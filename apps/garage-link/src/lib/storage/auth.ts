import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
  stores: { tenant_id: string | null } | null;
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
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return {
      ok: false as const,
      response: Response.json({ ok: false, error: 'ログイン情報を取得できませんでした。', code: 'unauthorized' }, { status: 401 }),
    };
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role, display_name, email, stores(tenant_id)')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id || !member.stores?.tenant_id) {
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

  return {
    ok: true as const,
    supabase,
    service,
    user: userData.user,
    member: {
      storeId: member.store_id,
      tenantId: member.stores.tenant_id,
      role: member.role ?? 'viewer',
      displayName: member.display_name,
      email: member.email ?? userData.user.email ?? null,
    },
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
  };
}
