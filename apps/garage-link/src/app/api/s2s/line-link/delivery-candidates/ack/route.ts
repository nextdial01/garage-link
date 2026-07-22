import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyLLinkS2SRequest } from '@/lib/line-link/s2sAuth';
import { logServerError } from '@/lib/observability/logServerError';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';

// L-LINK → GARAGE LINK S2S 確認応答（ACK）API（HMAC 署名認証）。
// - 既存の候補取得ルート（../route.ts、SELECTのみ）とは独立。既存ルートの動作には一切触れない。
// - 認証: 既存と同じ HMAC-SHA256（verifyLLinkS2SRequest）。Supabase auth セッションは要求しない。
// - スコープ: X-LL-Store-Id（HMAC 署名対象、auth.storeId）のみで inspection_reminder_events を
//   限定する。リクエスト body の store_id は一切信用しない（存在しても無視）。
// - 書き込みは acknowledge_inspection_reminder_events(uuid, jsonb) 経由のみ。
//   inspection_reminder_events への直接 UPDATE は行わない（テーブル権限も SELECT のみのまま）。
// - 実 LINE 送信・Stripe・外部送信は呼ばない。

export const dynamic = 'force-dynamic';
const MAX_BATCH = 200;

const safeMessages = {
  internal_error: '確認応答の処理に失敗しました。',
  server_misconfigured: 'S2S 連携用の鍵が設定されていません。',
  invalid_body: 'リクエスト内容が不正です。',
} as const;

type AckOutcome = 'acknowledged' | 'already_acknowledged' | 'rejected';
type AckResult = { event_id: string; outcome: AckOutcome };
type AcknowledgementInput = { event_id: string; external_reference_id: string };

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// body は { acknowledgements: [{ event_id, external_reference_id }, ...] } の形のみ許可する。
// store_id はここでは一切読まない（読んでも使わない）。
function parseAcknowledgements(bodyText: string): AcknowledgementInput[] | null {
  if (!bodyText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const raw = (parsed as { acknowledgements?: unknown }).acknowledgements;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH) return null;

  const acknowledgements: AcknowledgementInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const eventId = (entry as { event_id?: unknown }).event_id;
    const externalReferenceId = (entry as { external_reference_id?: unknown }).external_reference_id;
    if (typeof eventId !== 'string' || eventId.trim().length === 0) return null;
    if (typeof externalReferenceId !== 'string' || externalReferenceId.trim().length === 0) return null;
    acknowledgements.push({ event_id: eventId, external_reference_id: externalReferenceId });
  }
  return acknowledgements;
}

export async function POST(request: Request) {
  // body は HMAC 検証対象なので必ず先に読み切る。
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

  const acknowledgements = parseAcknowledgements(bodyText);
  if (!acknowledgements) {
    return NextResponse.json(
      { ok: false, error: safeMessages.invalid_body, code: 'invalid_body' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: safeMessages.server_misconfigured, code: 'server_misconfigured' },
      { status: 500 }
    );
  }

  try {
    // p_store_id は HMAC 検証済みの auth.storeId のみ。body の store_id は渡さない/使わない。
    const { data, error } = await supabase.rpc('acknowledge_inspection_reminder_events', {
      p_store_id: auth.storeId,
      p_acknowledgements: acknowledgements,
    });

    if (error) {
      logServerError('line_link_s2s_ack_failed', {
        route: 's2s/line-link/delivery-candidates/ack',
        storeId: auth.storeId,
      }, error);
      return NextResponse.json(
        { ok: false, error: safeMessages.internal_error, code: 'internal_error' },
        { status: 500 }
      );
    }

    const results = ((data as { results?: AckResult[] } | null)?.results ?? []) as AckResult[];

    return NextResponse.json({
      ok: true,
      store_id: auth.storeId,
      results,
    });
  } catch (err) {
    logServerError('line_link_s2s_ack_failed', {
      route: 's2s/line-link/delivery-candidates/ack',
      storeId: auth.storeId,
    }, err);
    return NextResponse.json(
      { ok: false, error: safeMessages.internal_error, code: 'internal_error' },
      { status: 500 }
    );
  }
}
