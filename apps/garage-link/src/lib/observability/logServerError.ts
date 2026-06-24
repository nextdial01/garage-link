import 'server-only';
import { redactRecord } from '@/lib/security/redact';

// 障害調査用のサーバーログとAPIエラーレスポンスを安全に組み立てる共通ユーティリティです。
// 出力するのは「リクエスト種別・ルート・store_id/tenant_id・エラーコード」など追跡に必要な最小限のみ。
// 個人情報、LINE Secret/Access Token、Webhook本文、メッセージ本文、SQL、スタックトレースは出力しません。

export type ApiErrorContext = {
  route: string;
  method?: string | null;
  tenantId?: string | null;
  storeId?: string | null;
  // 追加メタはキー名ベースで redact されます（値そのものは入れないこと）。
  details?: Record<string, unknown>;
};

export function logServerError(code: string, context: ApiErrorContext, error?: unknown) {
  const base: Record<string, unknown> = {
    service: 'garage-link',
    code,
    route: context.route,
    method: context.method ?? null,
    tenant_id: context.tenantId ?? null,
    store_id: context.storeId ?? null,
  };

  if (context.details) {
    Object.assign(base, context.details);
  }

  // エラーの種別名のみ（"Error" 等）を残す。message/stackはユーザー入力やSQLを含み得るため出さない。
  if (error instanceof Error) {
    base.error_kind = error.name;
  }

  // stderr に1行JSONで出す。Vercel Functions Logs / supabaseログと突き合わせやすくする。
  console.error('[garage-link:error]', JSON.stringify(redactRecord(base)));
}

// ユーザーには汎用メッセージ＋安全なエラーコードのみ返す。既存の error メッセージ文言は変更しないこと。
export function apiError({
  code,
  message,
  status,
  context,
  error,
}: {
  code: string;
  message: string;
  status: number;
  context: ApiErrorContext;
  error?: unknown;
}) {
  logServerError(code, context, error);
  return Response.json({ ok: false, error: message, code }, { status });
}
