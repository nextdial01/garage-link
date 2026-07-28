import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type SaleOutcome = { ok: boolean; code: string; vehicleId?: string; dealId?: string; claimId?: string };

const statusByCode: Record<string, number> = {
  UNAUTHENTICATED: 401, ROLE_FORBIDDEN: 403, SCOPE_FORBIDDEN: 403,
  DEAL_NOT_FOUND: 404, VEHICLE_NOT_FOUND: 404, SALE_NOT_FOUND: 404,
  ALREADY_RESERVED: 409, IDEMPOTENCY_CONFLICT: 409, INVALID_STATUS: 409,
  DELIVERED_CANNOT_CANCEL: 409, FINANCIAL_RECORD_EXISTS: 409, PAYMENT_EXISTS: 409, CONFLICT: 409,
  TEMPORARY_FAILURE: 503,
};
const messageByCode: Record<string, string> = {
  ROLE_FORBIDDEN: 'この操作を行う権限がありません。', SCOPE_FORBIDDEN: '対象の店舗では操作できません。',
  DEAL_NOT_FOUND: '商談が見つかりません。', VEHICLE_NOT_FOUND: '車両が見つかりません。',
  SALE_NOT_FOUND: '有効な売約が見つかりません。', ALREADY_RESERVED: 'この車両は別の商談で売約済みです。',
  IDEMPOTENCY_CONFLICT: '同じ処理番号で異なる要求は実行できません。', INVALID_STATUS: '現在の状態では処理できません。',
  DELIVERED_CANNOT_CANCEL: '納車済みの売約は取り消せません。', FINANCIAL_RECORD_EXISTS: '請求または入金があるため自動取消できません。',
  PAYMENT_EXISTS: '入金があるため通常の売約取消はできません。返金・取消の管理操作を行ってください。',
  CONFLICT: '同時更新を検出しました。最新状態を確認してください。',
};

function responseFor(outcome: SaleOutcome) {
  if (outcome.ok) return NextResponse.json(outcome);
  return NextResponse.json(
    { ok: false, code: outcome.code, error: messageByCode[outcome.code] ?? '処理を完了できませんでした。' },
    { status: statusByCode[outcome.code] ?? 500 }
  );
}

async function runSaleOperation(
  request: NextRequest,
  dealId: string,
  functionName: 'reserve_vehicle_sale' | 'cancel_vehicle_sale' | 'complete_vehicle_delivery'
) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }
  let body: { idempotencyKey?: string; correlationId?: string };
  try { body = (await request.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 }); }
  if (!body.idempotencyKey || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 200) {
    return NextResponse.json({ ok: false, error: '処理番号が不正です。' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc(functionName, {
    p_deal_id: dealId, p_idempotency_key: body.idempotencyKey,
    p_correlation_id: body.correlationId?.slice(0, 100) ?? null,
  });
  if (error || !data) {
    return NextResponse.json({ ok: false, error: '一時的に処理できません。時間をおいて再度お試しください。' }, { status: 503 });
  }
  return responseFor(data as SaleOutcome);
}

export async function POST(request: NextRequest, context: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await context.params;
  return runSaleOperation(request, dealId, 'reserve_vehicle_sale');
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await context.params;
  return runSaleOperation(request, dealId, 'cancel_vehicle_sale');
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await context.params;
  return runSaleOperation(request, dealId, 'complete_vehicle_delivery');
}
