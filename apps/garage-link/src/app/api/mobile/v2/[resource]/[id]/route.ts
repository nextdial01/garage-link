import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { V2_RESOURCES, v2Patch, v2Resource, uuid } from '@/lib/mobile/v2Resources';
import { maintenanceEstimate } from '@/lib/mobile/maintenanceCost';

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
  return data ? Response.json({ ok: true, row: data }) : fail(404, 'not_found');
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
    const { data: before } = await context.service.from(String(config.table)).select('deal_id,customer_id,vehicle_id').eq('id',id).eq('store_id',context.member.storeId).maybeSingle();
    if (!before) return fail(404,'not_found');
    const dealId = patch.deal_id ?? before.deal_id;
    if (dealId) {
      const { data: deal } = await context.service.from('deals').select('customer_id,vehicle_id').eq('id', dealId).eq('store_id', context.member.storeId).maybeSingle();
      const customerId = patch.customer_id ?? before.customer_id;
      const vehicleId = patch.vehicle_id ?? before.vehicle_id;
      if (!deal || (customerId && deal.customer_id !== customerId) || (vehicleId && deal.vehicle_id !== vehicleId)) return fail(400, 'related_mismatch');
    }
  }
  if (resource === 'maintenance' && ['labor_amount','parts_amount','inspection_amount','legal_fee_amount','additional_amount','discount_amount'].some((key) => key in patch)) {
    const { data: existing } = await context.service.from('maintenance_jobs').select('labor_amount,parts_amount,inspection_amount,legal_fee_amount,additional_amount,discount_amount').eq('id', id).eq('store_id', context.member.storeId).maybeSingle();
    if (!existing) return fail(404, 'not_found');
    const estimate = maintenanceEstimate({ ...existing, ...patch } as Record<string, number | null>);
    if (estimate === null) return fail(400, 'invalid_maintenance_total');
    patch.estimated_total_amount = estimate;
  }
  let update = context.service.from(String(config.table)).update(patch).eq('id', id).eq('store_id', context.member.storeId);
  if (softDelete.has(resource)) update = update.is('deleted_at',null);
  const { data, error } = await update.select(String(config.fields)).maybeSingle();
  if (error) return fail(500, 'v2_update_failed');
  return data ? Response.json({ ok: true, row: data }) : fail(404, 'not_found');
}
