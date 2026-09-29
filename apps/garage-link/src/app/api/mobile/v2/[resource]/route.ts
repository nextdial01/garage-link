import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { V2_RESOURCES, v2Patch, v2Resource, uuid } from '@/lib/mobile/v2Resources';
import { mobileReadHeaders, mobileReadPage, mobileReadResult } from '@/lib/mobile/pagination';
import { maintenanceBusinessPatch, validateMobileCustomer } from '@/lib/mobile/businessPatch';

type HandlerContext = { params: Promise<{ resource: string }> };
const fail = (status: number, code: string) => Response.json({ ok: false, code, error: '内容を確認して再試行してください。' }, { status });
const softDelete = new Set(['customers','deals','maintenance']);

export async function GET(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const resource = v2Resource((await params).resource);
  const page = mobileReadPage(request);
  if (!resource || !page) return fail(400, 'invalid_resource_or_page');
  const config = V2_RESOURCES[resource];
  const url = new URL(request.url);
  let query = context.service.from(String(config.table)).select(String(config.fields)).eq('store_id', context.member.storeId);
  if (softDelete.has(resource)) query = query.is('deleted_at',null);
  query = query.order('updated_at', { ascending: false }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit);
  for (const column of ['customer_id', 'vehicle_id', 'deal_id']) {
    const value = url.searchParams.get(column);
    if (value) {
      if (!uuid(value) || !config.fields.includes(column)) return fail(400, 'invalid_filter');
      query = query.eq(column, value);
    }
  }
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q && config.search.length) {
    const safe = q.slice(0, 80).replace(/[\\%_,()"']/g, ' ');
    if (safe) query = query.or(config.search.map((column) => `${column}.ilike.%${safe}%`).join(','));
  }
  const { data, error } = await query;
  if (error) return fail(500, 'v2_list_failed');
  const result = mobileReadResult(data ?? [], page);
  return Response.json({ ok: true, rows: result.rows, nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
}

export async function POST(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (context.member.role === 'viewer') return fail(403, 'forbidden_role');
  const resource = v2Resource((await params).resource);
  if (!resource) return fail(404, 'not_found');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !uuid(body.id)) return fail(400, 'client_operation_id_required');
  const config = V2_RESOURCES[resource];
  const patch = v2Patch(resource, body);
  if (!patch) return fail(400, 'invalid_fields');
  if (resource === 'customers') { try { validateMobileCustomer(patch); } catch { return fail(400, 'birth_date_required'); } }
  if (resource === 'customers' && (!patch.name || !(patch.phone || patch.mobile_phone))) return fail(400, 'customer_name_phone_required');
  if (resource === 'deals' && (!patch.customer_id || !patch.title)) return fail(400, 'deal_customer_title_required');
  if (resource === 'appointments' && (!patch.customer_id || !patch.scheduled_at)) return fail(400, 'appointment_customer_time_required');
  if (resource === 'maintenance' && (!patch.customer_id || !patch.vehicle_id || !patch.request_detail)) return fail(400, 'maintenance_core_required');
  if (resource === 'tradeIns' && !patch.deal_id) return fail(400, 'trade_in_deal_required');
  if (resource === 'maintenance') {
    const { data: store } = await context.service.from('stores').select('tax_display_mode').eq('id', context.member.storeId).single();
    if (!store) return fail(500, 'store_settings_unavailable');
    try { Object.assign(patch, maintenanceBusinessPatch(patch, store.tax_display_mode)); } catch { return fail(400, 'invalid_maintenance_total'); }
  }

  for (const [column, table] of config.related) {
    const relatedId = patch[column];
    if (!relatedId) continue;
    const { data, error } = await context.service.from(table).select('id').eq('id', relatedId).eq('store_id', context.member.storeId).maybeSingle();
    if (error || !data) return fail(403, 'forbidden_related_resource');
  }
  if ((resource === 'tradeIns' || resource === 'appointments') && patch.deal_id) {
    const { data: deal } = await context.service.from('deals').select('customer_id,vehicle_id').eq('id', patch.deal_id).eq('store_id', context.member.storeId).maybeSingle();
    if (!deal || (patch.customer_id && deal.customer_id !== patch.customer_id) || (patch.vehicle_id && deal.vehicle_id !== patch.vehicle_id)) return fail(400, 'related_mismatch');
    if (resource === 'tradeIns') patch.customer_id = deal.customer_id;
  }

  const id = body.id;
  const existing = await context.service.from(String(config.table)).select(String(config.fields)).eq('id', id).eq('store_id', context.member.storeId).maybeSingle();
  if (existing.error) return fail(500, 'v2_create_check_failed');
  if (existing.data) {
    const same = Object.entries(patch).every(([key, value]) => JSON.stringify((existing.data as unknown as Record<string, unknown>)[key]) === JSON.stringify(value));
    return same ? Response.json({ ok: true, row: existing.data, replayed: true }) : fail(409, 'idempotency_conflict');
  }
  const generated: Record<string, unknown> = {};
  if (resource === 'deals') generated.status = '新規';
  if (resource === 'appointments') { generated.status = '予約済み'; generated.appointment_type = '来店予約'; }
  if (resource === 'maintenance') generated.job_no = `M-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
  const { data, error } = await context.service.from(String(config.table)).insert({ id, store_id: context.member.storeId, ...generated, ...patch }).select(String(config.fields)).maybeSingle();
  if (error || !data) {
    if (error?.code === '23505') return fail(409, 'idempotency_conflict');
    return fail(500, 'v2_create_failed');
  }
  return Response.json({ ok: true, row: data, replayed: false }, { status: 201 });
}
