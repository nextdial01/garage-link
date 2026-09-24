import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { mobileReadHeaders, mobileReadPage, mobileReadResult } from '@/lib/mobile/pagination';
import { uuid } from '@/lib/mobile/v2Resources';

const FIELDS = 'id,quote_id,deal_id,maintenance_job_id,customer_id,vehicle_id,invoice_no,title,status,issue_status,issue_date,payment_due_date,customer_name,vehicle_label,subtotal_amount,tax_amount,discount_amount,trade_in_amount,total_amount,paid_amount,unpaid_amount,customer_note,updated_at';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const page = mobileReadPage(request);
  if (!page) return Response.json({ ok: false, code: 'invalid_page' }, { status: 400 });
  let query = context.service.from('invoices').select(FIELDS).eq('store_id', context.member.storeId).is('deleted_at', null)
    .order('updated_at', { ascending: false }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit);
  const url = new URL(request.url);
  for (const key of ['customer_id','deal_id','maintenance_job_id']) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    if (!uuid(value)) return Response.json({ ok: false, code: 'invalid_filter' }, { status: 400 });
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) return Response.json({ ok: false, code: 'invoice_read_failed' }, { status: 500 });
  const result = mobileReadResult(data ?? [], page);
  return Response.json({ ok: true, invoices: result.rows, nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
}

export async function POST(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner','admin','staff'].includes(context.member.role)) return Response.json({ ok: false, code: 'forbidden_role' }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !uuid(body.id) || !uuid(body.quoteId) || (body.dueDate && (typeof body.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)))) return Response.json({ ok: false, code: 'invalid_invoice' }, { status: 400 });
  const { data: quote } = await context.service.from('quotes').select('id').eq('id', body.quoteId).eq('store_id', context.member.storeId).maybeSingle();
  if (!quote) return Response.json({ ok: false, code: 'forbidden_related_resource' }, { status: 403 });
  const { data, error } = await context.service.rpc('garage_mobile_invoice_from_quote', { p_store_id: context.member.storeId, p_quote_id: body.quoteId, p_invoice_id: body.id, p_due_date: body.dueDate || null });
  if (error || !data || typeof data !== 'object') return Response.json({ ok: false, code: 'invoice_create_failed' }, { status: 503 });
  const result = data as { ok?: boolean; code?: string };
  if (!result.ok) return Response.json({ ...result }, { status: result.code === 'ROLE_FORBIDDEN' ? 403 : 409 });
  const { data: invoice, error: readError } = await context.service.from('invoices').select(FIELDS).eq('id', body.id).eq('store_id', context.member.storeId).maybeSingle();
  if (readError || !invoice) return Response.json({ ok: false, code: 'invoice_readback_failed' }, { status: 500 });
  return Response.json({ ok: true, invoice, replayed: result.code === 'REPLAYED' }, { status: result.code === 'REPLAYED' ? 200 : 201 });
}
