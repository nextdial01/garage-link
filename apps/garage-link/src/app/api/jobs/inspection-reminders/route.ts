import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/observability/logServerError';

// 顧客フォローイベント生成ジョブ。
// - cron / バッチ実行: Authorization: Bearer ${CRON_SECRET} を付けると全店舗を処理。
// - 手動実行: ログイン中の owner/admin が自店舗のみ処理（他社データは跨がない）。
// 車検案内（generate_inspection_reminder_events）に加え、点検案内・納車後フォロー（30/90/180日）・
// 口コミ依頼・長期未接触の配信候補（generate_followup_candidate_events）も同じジョブで生成する。
// どちらも inspection_reminder_settings.enabled を店舗単位のマスタスイッチとして共有する。
// 生成は冪等（同一条件は二重作成されない）。LINE送信・外部連携は行わない。
//
// TODO(L-LINK連携): 将来 L-LINK へ配信候補/下書き作成要求を送る際は、送信直前に
// イベントの inspection_expiry_date と対象車両の現在の inspection_expiry_date を再照合し、
// 不一致（満了日が訂正された旧満了日向けの pending 等）は送信せず status='skipped' にする。
// 今回は実通信を実装せず、既存 pending の自動 skip も行わない（設計メモのみ）。
export const dynamic = 'force-dynamic';

type StoreMemberRow = { store_id: string; role: string | null };
type JobBreakdown = { inspection_reminder: number; followup_candidates: number };

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

// 両方の生成RPCを実行し、件数の内訳を返す。片方が失敗しても他方の結果は失わない
// （それぞれ独立したトランザクションのため、部分成功を握り潰さず呼び出し元へ伝える）。
async function runGenerationJobs(
  service: NonNullable<ReturnType<typeof serviceSupabase>>,
  storeId: string | null
): Promise<{ breakdown: JobBreakdown; errors: string[] }> {
  const errors: string[] = [];
  const breakdown: JobBreakdown = { inspection_reminder: 0, followup_candidates: 0 };

  const { data: inspectionData, error: inspectionError } = await service.rpc(
    'generate_inspection_reminder_events',
    { p_store_id: storeId }
  );
  if (inspectionError) {
    errors.push(inspectionError.message);
  } else {
    breakdown.inspection_reminder = inspectionData ?? 0;
  }

  const { data: followupData, error: followupError } = await service.rpc(
    'generate_followup_candidate_events',
    { p_store_id: storeId }
  );
  if (followupError) {
    errors.push(followupError.message);
  } else {
    breakdown.followup_candidates = followupData ?? 0;
  }

  return { breakdown, errors };
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
    const { breakdown, errors } = await runGenerationJobs(service, null);
    if (errors.length > 0) {
      // 一部のRPCが未適用（例: 040未適用でfunction不在）でも、成功した分の生成結果は握り潰さない。
      logServerError('inspection_job_partial_failure', { route: '/api/jobs/inspection-reminders', method: 'GET', details: { scope: 'all_stores', errors } }, new Error(errors.join(' / ')));
      if (breakdown.inspection_reminder === 0 && breakdown.followup_candidates === 0 && errors.length === 2) {
        return NextResponse.json({ ok: false, error: 'ジョブ実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
      }
    }
    const created = breakdown.inspection_reminder + breakdown.followup_candidates;
    return NextResponse.json({ ok: true, scope: 'all_stores', created, breakdown, partial_errors: errors.length > 0 });
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
    const { breakdown, errors } = await runGenerationJobs(service, member.store_id);
    if (errors.length > 0) {
      logServerError('inspection_job_partial_failure', { route: '/api/jobs/inspection-reminders', method: 'POST', storeId: member.store_id, details: { errors } }, new Error(errors.join(' / ')));
      if (breakdown.inspection_reminder === 0 && breakdown.followup_candidates === 0 && errors.length === 2) {
        return NextResponse.json({ ok: false, error: '実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
      }
    }
    const created = breakdown.inspection_reminder + breakdown.followup_candidates;
    return NextResponse.json({ ok: true, scope: 'own_store', created, breakdown, partial_errors: errors.length > 0 });
  } catch (error) {
    logServerError('inspection_job_failed', { route: '/api/jobs/inspection-reminders', method: 'POST', storeId: member.store_id }, error);
    return NextResponse.json({ ok: false, error: '実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
  }
}
