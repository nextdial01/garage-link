import { vehicleDate } from '@/lib/business/vehicleFields';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { assertVehicleLimitAvailable, VEHICLE_LIMIT_MESSAGE } from '@/lib/billing/garageSubscription';
import { COST_KEYS, PURCHASE_FIELDS, SUPPLIER_TYPES, cleanDate, cleanText, money } from '@/lib/mobile/purchase';
import { vehicleCost, type CostParts } from '@/lib/mobile/vehicleCost';
import { uuid } from '@/lib/mobile/v2Resources';

const fail = (status: number, code: string) => Response.json({ ok: false, code, error: '仕入内容を確認してください。' }, { status });
const authorizedRole = (role: string) => role === 'owner' || role === 'admin' || role === 'staff';

export async function POST(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!authorizedRole(context.member.role)) return fail(403, 'forbidden_role');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !uuid(body.id)) return fail(400, 'client_operation_id_required');
  const vin = cleanText(body.vin, 120);
  const maker = cleanText(body.maker, 120);
  const model = cleanText(body.modelName, 160);
  const supplier = cleanText(body.supplierName, 200);
  const supplierType = cleanText(body.supplierType, 40);
  const purchaseDate = cleanDate(body.purchaseDate);
  const purchasePrice = money(body.purchasePrice);
  if (!vin || !maker || !model || !supplier || !supplierType || !SUPPLIER_TYPES.includes(supplierType as typeof SUPPLIER_TYPES[number]) || !purchaseDate || purchasePrice === null) return fail(400, 'invalid_purchase');
  const payload: Record<string, unknown> = {
    id: body.id, store_id: context.member.storeId, vin, maker, model_name: model,
    management_no: cleanText(body.managementNo, 120), status: '在庫中',
    purchase_supplier_name: supplier, purchase_supplier_type: supplierType,
    purchase_date: purchaseDate, purchase_price: purchasePrice,
  };
  for (const [key,column] of [['inspectionExpiryDate','inspection_expiry_date'],['liabilityInsuranceExpiryDate','liability_insurance_expiry_date']] as const) {
    const date = vehicleDate(body[key]); if (date === undefined) return fail(400,'invalid_date'); payload[column] = date;
  }
  const { data: makerEntry } = await context.service.from('store_master_entries').select('id').eq('store_id',context.member.storeId).eq('kind','vehicle_maker').eq('label',maker).eq('is_active',true).maybeSingle();
  if (!makerEntry) return fail(400,'invalid_vehicle_maker');
  for (const key of COST_KEYS) {
    if (!(key in body)) continue;
    const amount = money(body[key]);
    if (amount === null) return fail(400, 'invalid_cost');
    payload[key] = amount;
  }
  if ('listingPrice' in body) {
    const listingPrice = money(body.listingPrice);
    if (listingPrice === null) return fail(400, 'invalid_listing_price');
    payload.listing_price = listingPrice;
  }
  if ('marketValue' in body) {
    const marketValue = money(body.marketValue);
    if (marketValue === null) return fail(400, 'invalid_market_value');
    payload.market_value = marketValue;
  }
  const existing = await context.service.from('vehicles').select(PURCHASE_FIELDS).eq('id', body.id).eq('store_id', context.member.storeId).maybeSingle();
  if (existing.error) return fail(500, 'purchase_check_failed');
  if (existing.data) {
    const same = Object.entries(payload).every(([key, value]) => (existing.data as Record<string, unknown>)[key] === value);
    return same ? Response.json({ ok: true, vehicle: { ...existing.data, ...vehicleCost(existing.data as CostParts) }, replayed: true }) : fail(409, 'idempotency_conflict');
  }
  try { await assertVehicleLimitAvailable(context.service as unknown as Parameters<typeof assertVehicleLimitAvailable>[0], context.member.storeId); }
  catch (error) { return fail(error instanceof Error && error.message === VEHICLE_LIMIT_MESSAGE ? 409 : 500, 'vehicle_limit_check_failed'); }
  const { data, error } = await context.service.from('vehicles').insert(payload).select(PURCHASE_FIELDS).maybeSingle();
  if (error || !data) return fail(error?.code === '23505' ? 409 : 500, error?.code === '23505' ? 'idempotency_conflict' : 'purchase_create_failed');
  return Response.json({ ok: true, vehicle: { ...data, ...vehicleCost(data as CostParts) }, replayed: false }, { status: 201 });
}
