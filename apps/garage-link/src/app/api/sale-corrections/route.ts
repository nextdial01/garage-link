import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  saleCorrectionResponse,
  type SaleCorrectionOutcome,
  validCorrectionIdempotencyKey,
} from '@/lib/sale-corrections/correctionApi';

const caseTypes = new Set([
  'customer_return',
  'contract_correction',
  'delivery_cancellation',
  'vehicle_exchange',
  'administrative_correction',
]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  let body: {
    saleClaimId?: string;
    caseType?: string;
    reason?: string;
    requestedRefundAmount?: number;
    invoiceId?: string | null;
    idempotencyKey?: string;
    correlationId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 });
  }
  if (
    !body.saleClaimId || !body.caseType || !caseTypes.has(body.caseType)
    || typeof body.reason !== 'string' || body.reason.trim().length < 3
    || !Number.isInteger(body.requestedRefundAmount) || (body.requestedRefundAmount ?? -1) < 0
    || !validCorrectionIdempotencyKey(body.idempotencyKey)
  ) {
    return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('create_sale_correction_case', {
    p_sale_claim_id: body.saleClaimId,
    p_case_type: body.caseType,
    p_reason: body.reason.trim(),
    p_requested_refund_amount: body.requestedRefundAmount,
    p_invoice_id: body.invoiceId ?? null,
    p_idempotency_key: body.idempotencyKey,
    p_correlation_id: body.correlationId?.slice(0, 100) ?? null,
  });
  if (error || !data) {
    return NextResponse.json({ ok: false, error: '一時的に処理できません。時間をおいて再度お試しください。' }, { status: 503 });
  }
  return saleCorrectionResponse(data as SaleCorrectionOutcome);
}

