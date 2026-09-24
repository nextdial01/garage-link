import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { vehicleCost, type CostParts } from '@/lib/mobile/vehicleCost';
import { mobileReadPage, mobileReadResult, mobileReadHeaders } from '@/lib/mobile/pagination';

const FIELDS = 'id, management_no, vin, maker, model_name, grade, status, purchase_supplier_name, purchase_supplier_type, purchase_date, purchase_price, direct_cost_special, direct_cost_accessories, direct_cost_agency, direct_cost_legal, direct_cost_other, direct_cost_repair, listing_price, sale_price, sold_date, market_value, created_at, updated_at';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner', 'admin', 'staff'].includes(context.member.role)) return Response.json({ ok: false, code: 'forbidden_role' }, { status: 403 });
  const page = mobileReadPage(request);
  if (!page) return Response.json({ ok: false, code: 'invalid_page' }, { status: 400 });
  const q = new URL(request.url).searchParams.get('q')?.trim().slice(0,80).replace(/[\\%_,()"']/g,' ') ?? '';
  let vehicleQuery = context.service.from('vehicles').select(FIELDS).eq('store_id', context.member.storeId).is('deleted_at', null).neq('is_archived', true);
  if (q) vehicleQuery = vehicleQuery.or(`maker.ilike.%${q}%,model_name.ilike.%${q}%,management_no.ilike.%${q}%`);
  const [rowsResult, storeResult, metricsResult] = await Promise.all([
    vehicleQuery.order('updated_at', { ascending: false }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit),
    context.service.from('stores').select('long_stay_threshold_days').eq('id', context.member.storeId).maybeSingle(),
    context.service.rpc('inventory_dashboard_metrics', { p_store_id: context.member.storeId }),
  ]);
  if (rowsResult.error || storeResult.error || metricsResult.error) return Response.json({ ok: false, code: 'inventory_read_failed' }, { status: 500 });
  const threshold = storeResult.data?.long_stay_threshold_days ?? 90;
  const result = mobileReadResult(rowsResult.data ?? [], page);
  const vehicles = result.rows.map((row) => {
    const cost = vehicleCost(row as CostParts);
    return { ...row, ...cost, longStay: cost.daysInStock > threshold };
  });
  return Response.json({ ok: true, vehicles, metrics: metricsResult.data, nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
}
