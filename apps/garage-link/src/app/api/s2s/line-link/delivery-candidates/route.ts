import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyLLinkS2SRequest } from '@/lib/line-link/s2sAuth';
import { CANDIDATE_EVENT_TYPES, type CandidateEventType } from '@/lib/line-link/deliveryCandidates';
import { logServerError } from '@/lib/observability/logServerError';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';

// GARAGE LINK → L-LINK S2S 配信候補 API（HMAC 署名認証）。
// - 既存セッション認証ルート /api/line-link/delivery-candidates とは独立。既存ルートの動作には触れない。
// - 認証: HMAC-SHA256（X-LL-Signature 等）。Supabase auth セッションは要求しない。
// - スコープ: X-LL-Store-Id（HMAC 署名対象）で inspection_reminder_events.store_id を限定。
// - 候補本体は service_role で SELECT のみ。生成・更新・完了・削除は一切しない。
// - PII 最小化: line_user_id / phone / email / vehicle_id / vin / 内部 PK は返さない。
// - 実 LINE 送信・Stripe・外部送信は呼ばない。

export const dynamic = 'force-dynamic';
const MAX_LIMIT = 200;

const safeMessages = {
  internal_error: '配信候補の取得に失敗しました。',
  server_misconfigured: 'S2S 連携用の鍵が設定されていません。',
  no_candidates: '対象店舗の配信候補が取得できませんでした。',
} as const;

type EventRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  event_type: CandidateEventType;
  reminder_offset_days: number | null;
  inspection_expiry_date: string | null;
  customer_name: string | null;
  vehicle_name: string | null;
  created_at: string;
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  // body は HMAC 検証対象なので必ず先に読み切る。空 body 想定だが、将来の filter 追加に備えて保持。
  const bodyText = await request.text();
  const headers = request.headers;
  const url = new URL(request.url);

  const auth = await verifyLLinkS2SRequest({
    method: 'POST',
    path: url.pathname,
    headers,
    body: bodyText,
  });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  }
  if (!(await canStoreUseLLink(auth.storeId))) {
    return NextResponse.json({ ok: false, error: 'L-LINK連携はStandard以上の契約が必要です。', code: 'plan_required' }, { status: 403 });
  }

  // 任意フィルタは body JSON から（type, limit）。未指定でも OK。
  let parsedBody: { type?: unknown; limit?: unknown } = {};
  if (bodyText) {
    try {
      parsedBody = JSON.parse(bodyText) as typeof parsedBody;
    } catch {
      // body は空または無効。フィルタ無しで進む。
    }
  }
  const type =
    typeof parsedBody.type === 'string' && (CANDIDATE_EVENT_TYPES as readonly string[]).includes(parsedBody.type)
      ? parsedBody.type
      : null;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(parsedBody.limit ?? 50) || 50)
  );

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: safeMessages.server_misconfigured, code: 'server_misconfigured' },
      { status: 500 }
    );
  }

  try {
    let query = supabase
      .from('inspection_reminder_events')
      .select(
        'id, store_id, customer_id, event_type, reminder_offset_days, inspection_expiry_date, customer_name, vehicle_name, created_at'
      )
      .eq('store_id', auth.storeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(0, limit - 1);

    if (type) {
      query = query.eq('event_type', type);
    }

    const { data, error } = await query;
    if (error) {
      logServerError('line_link_s2s_candidates_read_failed', {
        route: 's2s/line-link/delivery-candidates',
        storeId: auth.storeId,
      }, error);
      return NextResponse.json(
        { ok: false, error: safeMessages.internal_error, code: 'internal_error' },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as EventRow[];
    const candidates = rows
      .filter((row) => (CANDIDATE_EVENT_TYPES as readonly string[]).includes(row.event_type))
      .map((row) => ({
        event_id: row.id,
        store_id: row.store_id,
        customer_id: row.customer_id,
        event_type: row.event_type,
        reference_date: row.inspection_expiry_date,
        reminder_offset_days: row.reminder_offset_days,
        customer_name: row.customer_name,
        vehicle_name: row.vehicle_name,
        created_at: row.created_at,
      }));

    return NextResponse.json({
      ok: true,
      store_id: auth.storeId,
      total: candidates.length,
      candidates,
    });
  } catch (err) {
    logServerError('line_link_s2s_candidates_exception', {
      route: 's2s/line-link/delivery-candidates',
      storeId: auth.storeId,
    }, err);
    return NextResponse.json(
      { ok: false, error: safeMessages.internal_error, code: 'internal_error' },
      { status: 500 }
    );
  }
}
