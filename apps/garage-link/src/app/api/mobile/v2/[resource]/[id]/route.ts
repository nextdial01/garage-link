import { createBearerClient } from '@/lib/supabase/admin';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { V2_RESOURCES, v2Patch, v2Resource, uuid } from '@/lib/mobile/v2Resources';
import { maintenanceBusinessPatch, maintenancePartLines, validateMobileCustomer } from '@/lib/mobile/businessPatch';

type HandlerContext = { params: Promise<{ resource: string; id: string }> };
const fail = (status: number, code: string) => Response.json({ ok: false, code, error: '内容を確認して再試行してください。' }, { status });
const softDelete = new Set(['customers','deals','maintenance']);

export async function GET(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { resource: name, id } = await params;
  const resource = v2Resource(name);
  if (!resource || !uuid(id)) return fail(404, 'not_found');
  const config = V2_RESOURCES[resource];
  let query = context.service.from(String(config.table)).select(String(config.fields)).eq('id', id).eq('store_id', context.member.storeId);
  if (softDelete.has(resource)) query = query.is('deleted_at',null);
  const { data, error } = await query.maybeSingle();
  if (error) return fail(500, 'v2_read_failed');
  if (!data) return fail(404, 'not_found');
  if (resource === 'maintenance') {
    const client = createBearerClient(request.headers.get('authorization')!.replace(/^Bearer\s+/i,''));
    if (!client) return fail(500, 'connection_failed');
    const parts = await client.from('maintenance_job_parts').select('id,part_id,part_no,name,quantity,unit_price,cost_price,tax_rate,discount_amount,subtotal_amount,work_memo').eq('job_id',id).eq('store_id',context.member.storeId).order('created_at');
    if (parts.error) return fail(500, 'maintenance_parts_read_failed');
    return Response.json({ ok: true, row: { ...(data as unknown as Record<string,unknown>), maintenance_parts: parts.data ?? [] } });
  }
  return Response.json({ ok: true, row: data });
}

export async function PATCH(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (context.member.role === 'viewer') return fail(403, 'forbidden_role');
  const { resource: name, id } = await params;
  const resource = v2Resource(name);
  if (!resource || !uuid(id)) return fail(404, 'not_found');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const patch = body && v2Patch(resource, body);
  if (!patch) return fail(400, 'invalid_fields');
  if (resource === 'customers') {
    const { data: before } = await context.service.from('customers').select('name,birth_date').eq('id',id).eq('store_id',context.member.storeId).maybeSingle();
    if (!before) return fail(404,'not_found');
    try { validateMobileCustomer({ ...before, ...patch }); } catch { return fail(400,'birth_date_required'); }
  }
  // Sale and delivery are atomic RPC operations, never direct status writes.
  if (resource === 'deals' && 'status' in patch && ['成約','失注'].includes(String(patch.status))) return fail(409, 'sale_rpc_required');
  const config = V2_RESOURCES[resource];
  for (const [column, table] of config.related) {
    const relatedId = patch[column];
    if (!relatedId) continue;
    const { data } = await context.service.from(table).select('id').eq('id', relatedId).eq('store_id', context.member.storeId).maybeSingle();
    if (!data) return fail(403, 'forbidden_related_resource');
  }
  if ((resource === 'tradeIns' || resource === 'appointments') && ['deal_id','customer_id','vehicle_id'].some((key) => key in patch)) {
    // Keep literal selects separate: trade-in rows have no vehicle_id column.
    const relatedQuery = context.service.from(String(config.table));
    const { data: before } = resource === 'tradeIns'
      ? await relatedQuery.select('deal_id,customer_id').eq('id',id).eq('store_id',context.member.storeId).maybeSingle()
      : await relatedQuery.select('deal_id,customer_id,vehicle_id').eq('id',id).eq('store_id',context.member.storeId).maybeSingle();
    if (!before) return fail(404,'not_found');
    const dealId = patch.deal_id ?? before.deal_id;
    if (dealId) {
      const { data: deal } = await context.service.from('deals').select('customer_id,vehicle_id').eq('id', dealId).eq('store_id', context.member.storeId).maybeSingle();
      const customerId = patch.customer_id ?? before.customer_id;
      const vehicleId = patch.vehicle_id ?? ('vehicle_id' in before ? before.vehicle_id : null);
      if (!deal || (customerId && deal.customer_id !== customerId) || (vehicleId && deal.vehicle_id !== vehicleId)) return fail(400, 'related_mismatch');
    }
  }
  if (resource === 'maintenance') {
    const { data: existing } = await context.service.from('maintenance_jobs').select('*').eq('id', id).eq('store_id', context.member.storeId).maybeSingle();
    if (!existing) return fail(404, 'not_found');
    // Existing documents retain their snapshot mode, including legacy inclusive values.
    if (existing.tax_display_mode && patch.tax_display_mode && patch.tax_display_mode !== existing.tax_display_mode) return fail(400, 'immutable_document_mode');
    const client = createBearerClient(request.headers.get('authorization')!.replace(/^Bearer\s+/i,''));
    if (!client) return fail(500, 'connection_failed');
    const parts = await client.from('maintenance_job_parts').select('subtotal_amount,tax_rate').eq('job_id',id).eq('store_id',context.member.storeId);
    if (parts.error) return fail(500, 'maintenance_parts_read_failed');
    try { Object.assign(patch, maintenanceBusinessPatch({ ...existing, ...patch }, existing.tax_display_mode || 'included', Object.hasOwn(patch, 'work_details'), maintenancePartLines(parts.data ?? []))); } catch { return fail(400, 'invalid_maintenance_total'); }
  }
  let update = context.service.from(String(config.table)).update(patch).eq('id', id).eq('store_id', context.member.storeId);
  if (softDelete.has(resource)) update = update.is('deleted_at',null);
  const { data, error } = await update.select(String(config.fields)).maybeSingle();
  if (error) return fail(500, 'v2_update_failed');
  return data ? Response.json({ ok: true, row: data }) : fail(404, 'not_found');
}
