import 'server-only';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// L-LINK → GARAGE LINK S2S リクエストの認証ユーティリティ。
// - HMAC-SHA256 署名を timing-safe に検証
// - timestamp ± 300 秒、nonce 10 分の再利用拒否
// - secret は環境変数からのみ読む。DB / クライアント / レスポンスに**一切渡さない**
// - LINE 送信 / Stripe / 既存 inspection_reminder_events スキーマには触れない

const TIMESTAMP_TOLERANCE_SEC = 300;
const NONCE_TTL_MIN = 10;

export type S2SAuthSuccess = {
  ok: true;
  keyId: string;
  storeId: string;
  timestamp: number;
  nonce: string;
};

export type S2SAuthFailure = {
  ok: false;
  status: 400 | 401 | 403 | 500;
  code:
    | 'missing_headers'
    | 'invalid_timestamp'
    | 'expired_timestamp'
    | 'invalid_store_id'
    | 'invalid_key_id'
    | 'server_misconfigured'
    | 'invalid_signature'
    | 'replayed_nonce'
    | 'internal_error';
  error: string;
};

export type S2SAuthResult = S2SAuthSuccess | S2SAuthFailure;

const errorMessages: Record<S2SAuthFailure['code'], string> = {
  missing_headers: 'S2S 認証ヘッダが不足しています。',
  invalid_timestamp: 'タイムスタンプの形式が不正です。',
  expired_timestamp: 'タイムスタンプの有効期限が切れています。',
  invalid_store_id: '店舗 ID の形式が不正です。',
  invalid_key_id: '指定された鍵 ID は許可されていません。',
  server_misconfigured: 'S2S 連携用の鍵が設定されていません。',
  invalid_signature: '署名検証に失敗しました。',
  replayed_nonce: 'このリクエストは既に処理されています（nonce 再利用）。',
  internal_error: 'S2S 認証処理で内部エラーが発生しました。',
};

function fail(code: S2SAuthFailure['code'], status: S2SAuthFailure['status'] = 401): S2SAuthFailure {
  return { ok: false, status, code, error: errorMessages[code] };
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function sha256Base64(input: Buffer | string): string {
  return crypto.createHash('sha256').update(input).digest('base64');
}

function timingSafeEqualBase64(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'base64');
    const bBuf = Buffer.from(b, 'base64');
    if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// 鍵 ID から secret を環境変数で解決する。
// 形式: LL_INBOUND_S2S_SECRET__<UPPER_KEY_ID>
// 例: key_id = "default" -> LL_INBOUND_S2S_SECRET__DEFAULT
function resolveSecret(keyId: string): string | null {
  if (!/^[a-z0-9_-]{1,32}$/i.test(keyId)) return null;
  const envName = `LL_INBOUND_S2S_SECRET__${keyId.toUpperCase().replace(/-/g, '_')}`;
  const value = process.env[envName];
  return value && value.length >= 32 ? value : null;
}

// nonce ストア用の service-role クライアント（RLS バイパスでこのテーブルのみ書く）。
function createNonceStore() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type VerifyOptions = {
  method: string;
  path: string;
  headers: Headers;
  body: Buffer | string;
};

export async function verifyLLinkS2SRequest(opts: VerifyOptions): Promise<S2SAuthResult> {
  const keyId = opts.headers.get('x-ll-key-id') ?? '';
  const timestampRaw = opts.headers.get('x-ll-timestamp') ?? '';
  const nonce = opts.headers.get('x-ll-nonce') ?? '';
  const storeId = opts.headers.get('x-ll-store-id') ?? '';
  const signature = opts.headers.get('x-ll-signature') ?? '';

  if (!keyId || !timestampRaw || !nonce || !storeId || !signature) return fail('missing_headers');

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) return fail('invalid_timestamp');

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SEC) return fail('expired_timestamp');

  if (!isValidUuid(storeId)) return fail('invalid_store_id');

  // nonce 形式: 16〜64 文字の英数+/=（base64 / hex / token）
  if (!/^[A-Za-z0-9+/=_-]{16,64}$/.test(nonce)) return fail('missing_headers');

  const secret = resolveSecret(keyId);
  if (!secret) {
    // 鍵 ID が不正か、env 未設定。どちらも外部から区別できない方が安全。
    const envName = `LL_INBOUND_S2S_SECRET__${keyId.toUpperCase().replace(/-/g, '_')}`;
    return process.env[envName] === undefined ? fail('invalid_key_id', 403) : fail('server_misconfigured', 500);
  }

  // 署名対象（payload）の組み立て:
  // METHOD\nPATH\nTIMESTAMP\nNONCE\nSTORE_ID\nSHA256(BODY)
  const bodyHash = sha256Base64(opts.body ?? '');
  const payload = [
    opts.method.toUpperCase(),
    opts.path,
    String(timestamp),
    nonce,
    storeId,
    bodyHash,
  ].join('\n');

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64');
  if (!timingSafeEqualBase64(expected, signature)) return fail('invalid_signature');

  // nonce 一意性チェック（service_role のみアクセス可能なテーブルへ INSERT）。
  // PRIMARY KEY 違反 = リプレイ。10 分超は cleanup function で別途削除。
  const store = createNonceStore();
  if (!store) return fail('server_misconfigured', 500);

  const { error: insertError } = await store
    .from('line_link_inbound_nonces')
    .insert({ nonce, store_id: storeId, key_id: keyId });

  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') return fail('replayed_nonce', 401);
    return fail('internal_error', 500);
  }

  // ベストエフォートで 10 分超の使用済み nonce を非同期削除（戻り値は無視）。
  void store
    .from('line_link_inbound_nonces')
    .delete()
    .lt('seen_at', new Date(Date.now() - NONCE_TTL_MIN * 60 * 1000).toISOString());

  return { ok: true, keyId, storeId, timestamp, nonce };
}

// テスト・運用診断用: 署名生成も export（外部 secret を渡される側のみ使用）。
export function buildS2SSignature(opts: {
  method: string;
  path: string;
  timestamp: number;
  nonce: string;
  storeId: string;
  body: Buffer | string;
  secret: string;
}): string {
  const bodyHash = sha256Base64(opts.body ?? '');
  const payload = [
    opts.method.toUpperCase(),
    opts.path,
    String(opts.timestamp),
    opts.nonce,
    opts.storeId,
    bodyHash,
  ].join('\n');
  return crypto.createHmac('sha256', opts.secret).update(payload).digest('base64');
}
