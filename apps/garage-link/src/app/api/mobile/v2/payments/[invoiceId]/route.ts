import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { money } from '@/lib/mobile/purchase';
import { uuid } from '@/lib/mobile/v2Resources';

export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner','admin','staff'].includes(context.member.role)) return Response.json({ ok: false, code: 'forbidden_role' }, { status: 403 });
  const { invoiceId } = await params;
  if (!uuid(invoiceId)) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
  const { data: invoice } = await context.service.from('invoices').select('id').eq('id', invoiceId).eq('store_id', context.member.storeId).maybeSingle();
  if (!invoice) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const amount = money(body?.amount);
  const key = body?.idempotencyKey;
  if (amount === null || amount === 0 || typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/.test(key) || typeof body?.paymentMethod !== 'string') return Response.json({ ok: false, code: 'invalid_payment' }, { status: 400 });
  const { data, error } = await context.service.rpc('record_garage_payment', { p_invoice_id: invoiceId, p_amount: amount, p_payment_method: body.paymentMethod.slice(0, 100), p_idempotency_key: key, p_correlation_id: crypto.randomUUID() });
  if (error || !data || typeof data !== 'object') return Response.json({ ok: false, code: 'payment_rpc_failed' }, { status: 503 });
  const result = data as { ok?: boolean; code?: string };
  if (!result.ok) return Response.json({ ...result, error: '入金を登録できませんでした。' }, { status: result.code === 'ROLE_FORBIDDEN' || result.code === 'SCOPE_FORBIDDEN' ? 403 : 409 });
  const { data: readback, error: readError } = await context.service.from('invoices').select('id,total_amount,paid_amount,unpaid_amount').eq('id', invoiceId).eq('store_id', context.member.storeId).maybeSingle();
  if (readError || !readback) return Response.json({ ok: false, code: 'payment_readback_failed' }, { status: 500 });
  return Response.json({ ok: true, result, invoice: readback });
}
