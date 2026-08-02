import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createSystemTenantContext,
  type GarageTenantContext,
} from '@/lib/security/garageTenantContext';
import { isAutomationDisabled } from '@/lib/security/runtimeSafety';

export const dynamic = 'force-dynamic';

function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

type ExpiredTenantRow = { tenant_id: string | null };

async function purgeExpiredStoreData(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: '管理クライアントを初期化できません。' }, { status: 503 });
  }

  const { data: rows, error: scopeError } = await admin
    .from('company_subscriptions')
    .select('tenant_id')
    .eq('status', 'cancelled')
    .is('data_deleted_at', null)
    .lte('data_delete_scheduled_at', new Date().toISOString())
    .not('tenant_id', 'is', null);
  if (scopeError) {
    return NextResponse.json({ ok: false, error: '削除対象の確認に失敗しました。' }, { status: 503 });
  }

  const tenantIds = [...new Set(((rows ?? []) as ExpiredTenantRow[]).map((row) => row.tenant_id).filter((value): value is string => Boolean(value)))];
  const results: unknown[] = [];
  for (const tenantId of tenantIds) {
    const context: GarageTenantContext = createSystemTenantContext({
      tenantId,
      source: 'cron',
      correlationId: request.headers.get('x-correlation-id')?.slice(0, 80) || crypto.randomUUID(),
    });
    const { data, error } = await admin.rpc('purge_expired_store_data_for_tenant', {
      p_tenant_id: context.tenantId,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: '期限切れデータの削除に失敗しました。' }, { status: 503 });
    }
    results.push(data);
  }

  return NextResponse.json({ ok: true, tenant_count: tenantIds.length, results });
}

/** Vercel Cron（1日1回・GET） */
export async function GET(request: Request) {
  if (isAutomationDisabled()) {
    return NextResponse.json({ ok: false, error: '自動処理は停止中です。' }, { status: 503 });
  }
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: '認可されていません。' }, { status: 401 });
  }

  return purgeExpiredStoreData(request);
}

/** 手動実行（POST） */
export async function POST(request: Request) {
  if (isAutomationDisabled()) {
    return NextResponse.json({ ok: false, error: '自動処理は停止中です。' }, { status: 503 });
  }
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: '認可されていません。' }, { status: 401 });
  }

  return purgeExpiredStoreData(request);
}
