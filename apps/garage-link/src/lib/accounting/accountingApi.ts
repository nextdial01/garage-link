import { NextResponse } from 'next/server';

export type AccountingOutcome = { ok: boolean; code: string; invoiceId?: string; paymentId?: string; originalPaymentId?: string };

const statusByCode: Record<string, number> = {
  UNAUTHENTICATED: 401, ROLE_FORBIDDEN: 403, SCOPE_FORBIDDEN: 403,
  INVOICE_NOT_FOUND: 404, PAYMENT_NOT_FOUND: 404, REASON_REQUIRED: 400,
  IDEMPOTENCY_CONFLICT: 409, INVALID_STATUS: 409, INVALID_AMOUNT: 409,
  PAYMENT_EXISTS: 409, OVERPAYMENT: 409, REFUND_EXCEEDS_PAYMENT: 409,
  DELIVERED_CANNOT_CANCEL: 409, CONFLICT: 409, TEMPORARY_FAILURE: 503,
};
const messageByCode: Record<string, string> = {
  ROLE_FORBIDDEN: 'この会計操作を行う権限がありません。', SCOPE_FORBIDDEN: '対象の店舗では操作できません。',
  INVOICE_NOT_FOUND: '請求書が見つかりません。', PAYMENT_NOT_FOUND: '入金記録が見つかりません。',
  IDEMPOTENCY_CONFLICT: '同じ処理番号で異なる要求は実行できません。', INVALID_STATUS: '現在の状態では処理できません。',
  INVALID_AMOUNT: '金額を確認してください。', PAYMENT_EXISTS: '入金があるため通常の取消はできません。',
  OVERPAYMENT: '請求残額を超える入金は登録できません。', REFUND_EXCEEDS_PAYMENT: '元の入金額を超える取消・返金は登録できません。',
  DELIVERED_CANNOT_CANCEL: '納車済みの処理は通常取消できません。', REASON_REQUIRED: '取消・返金理由を3文字以上で入力してください。',
  CONFLICT: '同時更新を検出しました。最新状態を確認してください。',
};

export function accountingResponse(outcome: AccountingOutcome) {
  if (outcome.ok) return NextResponse.json(outcome);
  return NextResponse.json({ ok: false, code: outcome.code, error: messageByCode[outcome.code] ?? '処理を完了できませんでした。' }, { status: statusByCode[outcome.code] ?? 500 });
}
export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200;
}
