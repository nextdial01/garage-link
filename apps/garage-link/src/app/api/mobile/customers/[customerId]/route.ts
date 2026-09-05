import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_CUSTOMER_FIELDS, MOBILE_QUOTE_FIELDS, mobileQuote } from '@/lib/mobile/dto';

export async function GET(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const context = await getGarageMobileBearerContext(request); if (!context.ok) return context.response;
  const { customerId } = await params;
  const [customer, deals] = await Promise.all([
    context.service.from('customers').select(MOBILE_CUSTOMER_FIELDS).eq('id', customerId).eq('store_id', context.member.storeId).maybeSingle(),
    context.service.from('deals').select('id, deal_no, title, status, vehicle_id, next_action_at').eq('store_id', context.member.storeId).eq('customer_id', customerId),
  ]);
  if (customer.error || deals.error) return Response.json({ ok: false, code: 'customer_read_failed', error: '顧客を取得できませんでした。' }, { status: 500 });
  if (!customer.data) return Response.json({ ok: false, code: 'not_found', error: '顧客が見つかりません。' }, { status: 404 });
  const vehicleIds = [...new Set((deals.data ?? []).map((deal) => deal.vehicle_id).filter((id): id is string => typeof id === 'string'))];
  const [vehicles, maintenance, quotes] = await Promise.all([
    vehicleIds.length ? context.service.from('vehicles').select('id, management_no, maker, model_name, status').eq('store_id', context.member.storeId).in('id', vehicleIds) : Promise.resolve({ data: [], error: null }),
    context.service.from('maintenance_jobs').select('id, job_no, job_type, status, scheduled_delivery_at, vehicle_id').eq('store_id', context.member.storeId).eq('customer_id', customerId).is('deleted_at', null),
    context.service.from('quotes').select(MOBILE_QUOTE_FIELDS).eq('store_id', context.member.storeId).eq('customer_id', customerId).order('updated_at', { ascending: false }),
  ]);
  if (vehicles.error || maintenance.error || quotes.error) return Response.json({ ok: false, code: 'customer_read_failed', error: '顧客を取得できませんでした。' }, { status: 500 });
  return Response.json({ ok: true, customer: customer.data, vehicles: vehicles.data ?? [], maintenance: maintenance.data ?? [], deals: deals.data ?? [], quotes: (quotes.data ?? []).map((quote) => mobileQuote(quote as Record<string, unknown>)) });
}
