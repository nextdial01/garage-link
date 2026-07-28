import { NextRequest, NextResponse } from 'next/server';
import { accountingResponse, AccountingOutcome, validIdempotencyKey } from '@/lib/accounting/accountingApi';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  const { invoiceId } = await context.params;
  let body: { amount?: number; paymentMethod?: string; idempotencyKey?: string };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 }); }
  if (!validIdempotencyKey(body.idempotencyKey) || !Number.isSafeInteger(body.amount) || (body.amount ?? 0) <= 0) return NextResponse.json({ ok: false, error: '金額と処理番号を確認してください。' }, { status: 400 });
  const { data, error } = await supabase.rpc('record_garage_payment', { p_invoice_id: invoiceId, p_amount: body.amount, p_payment_method: body.paymentMethod?.slice(0, 100) ?? '', p_idempotency_key: body.idempotencyKey, p_correlation_id: crypto.randomUUID() });
  if (error || !data) return NextResponse.json({ ok: false, error: '一時的に処理できません。' }, { status: 503 });
  return accountingResponse(data as AccountingOutcome);
}
