import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/observability/logServerError';

// 車検案内イベント生成ジョブ。
// - cron / バッチ実行: Authorization: Bearer ${CRON_SECRET} を付けると全店舗を処理。
// - 手動実行: ログイン中の owner/admin が自店舗のみ処理（他社データは跨がない）。
// 生成は冪等（同一条件は二重作成されない）。LINE送信・外部連携は行わない。
export const dynamic = 'force-dynamic';

type StoreMemberRow = { store_id: string; role: string | null };

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を付与できる。
  return header === `Bearer ${secret}`;
}

// Vercel Cron は GET で叩く（CRON_SECRET設定時は Authorization: Bearer を自動付与）。全店舗を処理。
export async function GET(request: Request) {
  const service = serviceSupabase();
  if (!service) {
    return NextResponse.json({ ok: false, error: 'サーバー設定が未設定です。', code: 'config_missing' }, { status: 500 });
  }
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: '認証が必要です。', code: 'unauthorized' }, { status: 401 });
  }
  try {
    const { data, error } = await service.rpc('generate_inspection_reminder_events', { p_store_id: null });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, scope: 'all_stores', created: data ?? 0 });
  } catch (error) {
    logServerError('inspection_job_failed', { route: '/api/jobs/inspection-reminders', method: 'GET', details: { scope: 'all_stores' } }, error);
    return NextResponse.json({ ok: false, error: 'ジョブ実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
  }
}

// 手動実行: ログイン中の owner/admin が自店舗のみ処理。
export async function POST(request: Request) {
  void request;
  const service = serviceSupabase();
  if (!service) {
    return NextResponse.json({ ok: false, error: 'サーバー設定が未設定です。', code: 'config_missing' }, { status: 500 });
  }

  // ログイン中の owner/admin が自店舗のみ
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。', code: 'unauthorized' }, { status: 401 });
  }
  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();
  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。', code: 'forbidden_no_membership' }, { status: 403 });
  }
  if (member.role !== 'owner' && member.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '権限がありません。', code: 'forbidden_role' }, { status: 403 });
  }

  try {
    // 自分の store_id のみを渡す（クライアント指定の店舗は受け付けない）。
    const { data, error } = await service.rpc('generate_inspection_reminder_events', { p_store_id: member.store_id });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, scope: 'own_store', created: data ?? 0 });
  } catch (error) {
    logServerError('inspection_job_failed', { route: '/api/jobs/inspection-reminders', method: 'POST', storeId: member.store_id }, error);
    return NextResponse.json({ ok: false, error: 'ジョブ実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
  }
}
