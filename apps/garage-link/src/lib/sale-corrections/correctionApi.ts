import { NextResponse } from 'next/server';

export type SaleCorrectionOutcome = {
  ok: boolean;
  code: string;
  caseId?: string;
  status?: string;
  refundId?: string;
  vehicleId?: string;
};

const statusByCode: Record<string, number> = {
  UNAUTHENTICATED: 401,
  ROLE_FORBIDDEN: 403,
  SCOPE_FORBIDDEN: 403,
  CASE_NOT_FOUND: 404,
  SALE_NOT_FOUND: 404,
  INVOICE_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  NOT_DELIVERED: 409,
  ACTIVE_CASE_EXISTS: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATUS: 409,
  INVALID_APPROVAL: 409,
  REFUND_EXCEEDS_PAYMENT: 409,
  SUBPROCESS_INCOMPLETE: 409,
  CONFLICT: 409,
  TEMPORARY_FAILURE: 503,
};

const messageByCode: Record<string, string> = {
  ROLE_FORBIDDEN: 'この返品・訂正操作を行う権限がありません。',
  SCOPE_FORBIDDEN: '対象の店舗では操作できません。',
  CASE_NOT_FOUND: '返品・訂正caseが見つかりません。',
  SALE_NOT_FOUND: '元の売約が見つかりません。',
  INVOICE_NOT_FOUND: '元の請求書が見つかりません。',
  PAYMENT_NOT_FOUND: '元の入金記録が見つかりません。',
  NOT_DELIVERED: '納車済みの売約だけを対象にできます。',
  ACTIVE_CASE_EXISTS: 'この売約には処理中の返品・訂正caseがあります。',
  IDEMPOTENCY_CONFLICT: '同じ処理番号で異なる要求は実行できません。',
  INVALID_STATUS: '現在の状態では処理できません。',
  INVALID_APPROVAL: '承認内容を確認してください。',
  REFUND_EXCEEDS_PAYMENT: '返金額が承認額または元の入金額を超えています。',
  SUBPROCESS_INCOMPLETE: '必要な検品・返金・所有関係・外部手続きの確認が完了していません。',
  CONFLICT: '同時更新を検出しました。最新状態を確認してください。',
};

export function saleCorrectionResponse(outcome: SaleCorrectionOutcome) {
  if (outcome.ok) return NextResponse.json(outcome);
  return NextResponse.json(
    { ok: false, code: outcome.code, error: messageByCode[outcome.code] ?? '処理を完了できませんでした。' },
    { status: statusByCode[outcome.code] ?? 500 },
  );
}

export function validCorrectionIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200;
}

