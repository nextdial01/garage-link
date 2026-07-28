import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SwitchResult = {
  ok?: boolean;
  tenant_id?: string;
  store_id?: string;
  role?: string;
  version?: number;
  changed?: boolean;
};

function errorResponse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user?.id) {
    return errorResponse(401, 'ログインが必要です。');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, '店舗の指定を確認してください。');
  }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const tenantId = typeof input.tenantId === 'string' ? input.tenantId : '';
  const storeId = typeof input.storeId === 'string' ? input.storeId : '';
  if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(storeId)) {
    return errorResponse(400, '店舗の指定を確認してください。');
  }

  const correlationId = crypto.randomUUID();
  const { data, error } = await supabase.rpc('switch_active_garage_store', {
    p_tenant_id: tenantId,
    p_store_id: storeId,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === '42501') {
      await logSecurityEvent({
        supabase,
        tenantId,
        userId: userData.user.id,
        eventType: 'tenant_access_denied',
        severity: 'medium',
        details: { operation: 'change_active_store', targetStoreId: storeId, correlationId, result: 'rejected' },
      });
      return errorResponse(403, 'この店舗へ切り替える権限がありません。');
    }
    if (error.code === '40001' || error.code === '40P01' || error.code === '23505') {
      return errorResponse(409, '店舗切替が競合しました。再度お試しください。');
    }
    if (error.code?.startsWith('08') || error.code?.startsWith('PGRST')) {
      return errorResponse(503, '現在店舗を切り替えられません。時間をおいて再度お試しください。');
    }
    return errorResponse(500, '店舗を切り替えられませんでした。');
  }

  const result = (data ?? {}) as SwitchResult;
  if (!result.ok || result.tenant_id !== tenantId || result.store_id !== storeId) {
    return errorResponse(500, '店舗を切り替えられませんでした。');
  }
  return NextResponse.json({
    ok: true,
    tenantId: result.tenant_id,
    storeId: result.store_id,
    role: result.role,
    version: result.version,
    changed: result.changed === true,
    correlationId,
  });
}
