import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { money } from '@/lib/mobile/purchase';
import { uuid } from '@/lib/mobile/v2Resources';

type HandlerContext = { params: Promise<{ dealId: string }> };
const keyPattern = /^[A-Za-z0-9_-]{8,200}$/;
const fail = (status: number, code: string) => Response.json({ ok: false, code, error: '処理を完了できませんでした。' }, { status });

async function operate(request: Request, handler: HandlerContext, operation: 'reserve' | 'cancel' | 'deliver') {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner','admin','staff'].includes(context.member.role)) return fail(403, 'forbidden_role');
  const { dealId } = await handler.params;
  if (!uuid(dealId)) return fail(404, 'not_found');
  const { data: deal } = await context.service.from('deals').select('id').eq('id', dealId).eq('store_id', context.member.storeId).maybeSingle();
  if (!deal) return fail(404, 'not_found');
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const key = body?.idempotencyKey;
  if (typeof key !== 'string' || !keyPattern.test(key)) return fail(400, 'invalid_operation_key');
  if (operation === 'cancel' && (typeof body?.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 100)) return fail(400, 'cancellation_reason_required');
  const price = operation === 'reserve' ? money(body?.salePrice) : null;
  if (operation === 'reserve' && price === null) return fail(400, 'sale_price_required');
  const fn = operation === 'reserve' ? 'garage_mobile_reserve_sale_with_price' : operation === 'cancel' ? 'cancel_vehicle_sale' : 'complete_vehicle_delivery';
  const args = operation === 'reserve'
    ? { p_deal_id: dealId, p_sale_price: price, p_idempotency_key: key }
    : { p_deal_id: dealId, p_idempotency_key: key, p_correlation_id: operation === 'cancel' ? `reason:${String(body?.reason).trim()}` : crypto.randomUUID() };
  const { data, error } = await context.service.rpc(fn, args);
  if (error || !data || typeof data !== 'object') return fail(503, 'sale_rpc_failed');
  const result = data as { ok?: boolean; code?: string };
  return result.ok ? Response.json(result) : fail(result.code === 'SCOPE_FORBIDDEN' || result.code === 'ROLE_FORBIDDEN' ? 403 : 409, result.code ?? 'sale_failed');
}

export const POST = (request: Request, context: HandlerContext) => operate(request, context, 'reserve');
export const DELETE = (request: Request, context: HandlerContext) => operate(request, context, 'cancel');
export const PATCH = (request: Request, context: HandlerContext) => operate(request, context, 'deliver');
