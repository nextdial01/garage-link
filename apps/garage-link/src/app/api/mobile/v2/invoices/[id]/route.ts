import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { uuid } from '@/lib/mobile/v2Resources';

type HandlerContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;
  if (!uuid(id)) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
  const [header, lines] = await Promise.all([
    context.service.from('invoices').select('id,invoice_no,quote_id,deal_id,maintenance_job_id,customer_id,vehicle_id,status,issue_status,issue_date,payment_due_date,customer_name,customer_address,vehicle_label,total_amount,paid_amount,unpaid_amount,customer_note').eq('id', id).eq('store_id', context.member.storeId).maybeSingle(),
    context.service.from('invoice_items').select('id,item_order,item_type,name,description,quantity,unit_price,tax_rate,tax_amount,amount').eq('invoice_id', id).eq('store_id', context.member.storeId).order('item_order'),
  ]);
  if (header.error || lines.error) return Response.json({ ok: false, code: 'invoice_read_failed' }, { status: 500 });
  return header.data ? Response.json({ ok: true, invoice: header.data, items: lines.data ?? [] }) : Response.json({ ok: false, code: 'not_found' }, { status: 404 });
}

export async function POST(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner','admin','staff'].includes(context.member.role)) return Response.json({ ok: false, code: 'forbidden_role' }, { status: 403 });
  const { id } = await params;
  if (!uuid(id)) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
  const { data: invoice } = await context.service.from('invoices').select('id').eq('id', id).eq('store_id', context.member.storeId).maybeSingle();
  if (!invoice) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const key = body?.idempotencyKey;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/.test(key)) return Response.json({ ok: false, code: 'invalid_operation_key' }, { status: 400 });
  const { data, error } = await context.service.rpc('issue_garage_invoice', { p_invoice_id: id, p_idempotency_key: key, p_correlation_id: crypto.randomUUID() });
  if (error || !data || typeof data !== 'object') return Response.json({ ok: false, code: 'invoice_issue_failed' }, { status: 503 });
  const result = data as { ok?: boolean; code?: string };
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
