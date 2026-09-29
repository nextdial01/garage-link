import { vehicleDate } from '@/lib/business/vehicleFields';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { COST_KEYS, PURCHASE_FIELDS, SUPPLIER_TYPES, cleanDate, cleanText, money } from '@/lib/mobile/purchase';
import { vehicleCost, type CostParts } from '@/lib/mobile/vehicleCost';
import { uuid } from '@/lib/mobile/v2Resources';

type HandlerContext = { params: Promise<{ id: string }> };
const fail = (status: number, code: string) => Response.json({ ok: false, code, error: '仕入内容を確認してください。' }, { status });

export async function GET(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner','admin','staff'].includes(context.member.role)) return fail(403,'forbidden_role');
  const { id } = await params;
  if (!uuid(id)) return fail(404,'not_found');
  const { data, error } = await context.service.from('vehicles').select(PURCHASE_FIELDS).eq('id',id).eq('store_id',context.member.storeId).is('deleted_at',null).maybeSingle();
  if (error) return fail(500,'purchase_read_failed');
  if (!data) return fail(404,'not_found');
  return Response.json({ok:true,vehicle:{...data,...vehicleCost(data as CostParts)}});
}

export async function PATCH(request: Request, { params }: HandlerContext) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner','admin','staff'].includes(context.member.role)) return fail(403, 'forbidden_role');
  const { id } = await params;
  if (!uuid(id)) return fail(404, 'not_found');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail(400, 'invalid_request');
  const patch: Record<string, string | number | null> = {};
  for (const [key, column, limit] of [['vin','vin',120],['maker','maker',120],['modelName','model_name',160],['managementNo','management_no',120]] as const) {
    if (!(key in body)) continue;
    const value = cleanText(body[key], limit);
    if (!value) return fail(400, 'invalid_vehicle_identity');
    patch[column] = value;
  }
  for (const [key,column] of [['inspectionExpiryDate','inspection_expiry_date'],['liabilityInsuranceExpiryDate','liability_insurance_expiry_date']] as const) {
    if (!(key in body)) continue;
    const date = vehicleDate(body[key]); if (date === undefined) return fail(400,'invalid_date'); patch[column] = date;
  }
  for (const key of COST_KEYS) {
    if (!(key in body)) continue;
    const value = money(body[key]);
    if (value === null) return fail(400, 'invalid_cost');
    patch[key] = value;
  }
  for (const [key, column] of [['purchasePrice','purchase_price'],['listingPrice','listing_price'],['marketValue','market_value']] as const) {
    if (!(key in body)) continue;
    const value = money(body[key]);
    if (value === null) return fail(400, 'invalid_price');
    patch[column] = value;
  }
  if ('supplierName' in body) {
    const name = cleanText(body.supplierName, 200); if (!name) return fail(400, 'invalid_supplier'); patch.purchase_supplier_name = name;
  }
  if ('supplierType' in body) {
    const type = cleanText(body.supplierType, 40);
    if (!type || !SUPPLIER_TYPES.includes(type as typeof SUPPLIER_TYPES[number])) return fail(400, 'invalid_supplier_type');
    patch.purchase_supplier_type = type;
  }
  if ('purchaseDate' in body) {
    const date = cleanDate(body.purchaseDate); if (!date) return fail(400, 'invalid_date'); patch.purchase_date = date;
  }
  if (!Object.keys(patch).length) return fail(400, 'empty_update');
  const { data: before } = await context.service.from('vehicles').select('id,status,maker').eq('id', id).eq('store_id', context.member.storeId).maybeSingle();
  if (!before) return fail(404, 'not_found');
  if ('maker' in patch && patch.maker !== before.maker) {
    const { data: entry } = await context.service.from('store_master_entries').select('id').eq('store_id',context.member.storeId).eq('kind','vehicle_maker').eq('label',String(patch.maker)).eq('is_active',true).maybeSingle();
    if (!entry) return fail(400,'invalid_vehicle_maker');
  }
  if (['売約済み','納車済み','sold','delivered'].includes(before.status)) return fail(409, 'sold_vehicle_locked');
  const { data, error } = await context.service.from('vehicles').update(patch).eq('id', id).eq('store_id', context.member.storeId).select(PURCHASE_FIELDS).maybeSingle();
  if (error || !data) return fail(error ? 500 : 404, 'purchase_update_failed');
  return Response.json({ ok: true, vehicle: { ...data, ...vehicleCost(data as CostParts) } });
}
