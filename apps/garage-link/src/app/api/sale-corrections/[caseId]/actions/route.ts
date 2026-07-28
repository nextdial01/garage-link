import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  saleCorrectionResponse,
  type SaleCorrectionOutcome,
  validCorrectionIdempotencyKey,
} from '@/lib/sale-corrections/correctionApi';

type ActionBody = {
  action?: string;
  reason?: string;
  approvedRefundAmount?: number;
  restockDecision?: string;
  paymentId?: string;
  amount?: number;
  note?: string;
  ownershipStatus?: string;
  externalStatus?: string;
  idempotencyKey?: string;
  correlationId?: string;
};

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }
  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 });
  }
  if (!body.action || !validCorrectionIdempotencyKey(body.idempotencyKey)) {
    return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 });
  }
  const common = { p_case_id: caseId, p_idempotency_key: body.idempotencyKey, p_correlation_id: body.correlationId?.slice(0, 100) ?? null };
  let rpcResult: { data: unknown; error: unknown };

  if (['begin_review', 'approve', 'reject', 'start_processing', 'cancel', 'complete'].includes(body.action)) {
    rpcResult = await supabase.rpc('transition_sale_correction_case', {
      ...common,
      p_action: body.action,
      p_reason: body.reason?.trim() ?? null,
      p_approved_refund_amount: Number.isInteger(body.approvedRefundAmount) ? body.approvedRefundAmount : null,
      p_restock_decision: body.restockDecision ?? null,
    });
  } else if (body.action === 'refund') {
    if (!body.paymentId || !Number.isInteger(body.amount) || (body.amount ?? 0) <= 0 || (body.reason?.trim().length ?? 0) < 3) {
      return NextResponse.json({ ok: false, error: '返金内容を確認してください。' }, { status: 400 });
    }
    rpcResult = await supabase.rpc('record_sale_correction_refund', {
      ...common, p_payment_id: body.paymentId, p_amount: body.amount, p_reason: body.reason!.trim(),
    });
  } else if (body.action === 'inspection_complete') {
    rpcResult = await supabase.rpc('complete_sale_correction_inspection', { ...common, p_note: body.note?.slice(0, 2000) ?? null });
  } else if (body.action === 'resolve_ownership') {
    rpcResult = await supabase.rpc('resolve_sale_correction_ownership', {
      ...common, p_ownership_status: body.ownershipStatus, p_reason: body.reason?.trim() ?? null,
    });
  } else if (body.action === 'restock') {
    rpcResult = await supabase.rpc('confirm_sale_correction_restock', common);
  } else if (body.action === 'external_procedure') {
    rpcResult = await supabase.rpc('resolve_sale_correction_external_procedure', {
      ...common, p_external_status: body.externalStatus, p_reason: body.reason?.trim() ?? null,
    });
  } else {
    return NextResponse.json({ ok: false, error: '操作内容を確認してください。' }, { status: 400 });
  }

  if (rpcResult.error || !rpcResult.data) {
    return NextResponse.json({ ok: false, error: '一時的に処理できません。時間をおいて再度お試しください。' }, { status: 503 });
  }
  return saleCorrectionResponse(rpcResult.data as SaleCorrectionOutcome);
}
