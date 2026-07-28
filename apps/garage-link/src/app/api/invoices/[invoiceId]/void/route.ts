import { NextRequest, NextResponse } from 'next/server';
import { accountingResponse, AccountingOutcome, validIdempotencyKey } from '@/lib/accounting/accountingApi';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  const { invoiceId } = await context.params;
  let body: { reason?: string; idempotencyKey?: string };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 }); }
  if (!validIdempotencyKey(body.idempotencyKey) || typeof body.reason !== 'string') return NextResponse.json({ ok: false, error: '入力内容を確認してください。' }, { status: 400 });
  const { data, error } = await supabase.rpc('void_garage_invoice', { p_invoice_id: invoiceId, p_reason: body.reason, p_idempotency_key: body.idempotencyKey, p_correlation_id: crypto.randomUUID() });
  if (error || !data) return NextResponse.json({ ok: false, error: '一時的に処理できません。' }, { status: 503 });
  return accountingResponse(data as AccountingOutcome);
}
