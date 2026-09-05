import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_QUOTE_FIELDS, mobileQuote } from '@/lib/mobile/dto';
import { readMobileQuote } from '@/lib/mobile/quoteService';
import { logAudit } from '@/lib/audit/logAudit';

const ITEM_TYPES = new Set(['vehicle', 'part', 'labor', 'service', 'registration', 'inspection', 'tax', 'insurance', 'other', 'discount', 'trade_in']);
const NEGATIVE_TYPES = new Set(['discount', 'trade_in']);
const KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;

function text(value: unknown, max = 300) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null; }
function money(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 100_000_000 ? value : null; }
function uuid(value: unknown) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null; }

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { data, error } = await context.service.from('quotes').select(MOBILE_QUOTE_FIELDS).eq('store_id', context.member.storeId).order('updated_at', { ascending: false }).limit(100);
  if (error) return Response.json({ ok: false, code: 'quote_list_failed', error: '見積を取得できませんでした。' }, { status: 500 });
  return Response.json({ ok: true, quotes: (data ?? []).map((quote) => mobileQuote(quote as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (context.member.role === 'viewer') return Response.json({ ok: false, code: 'forbidden_role', error: '閲覧権限では見積を作成できません。' }, { status: 403 });
  const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() ?? '';
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!KEY_RE.test(idempotencyKey) || !body) return Response.json({ ok: false, code: 'invalid_request', error: '操作IDまたは見積内容が正しくありません。' }, { status: 400 });

  const customerId = uuid(body.customerId); const vehicleId = uuid(body.vehicleId); const dealId = uuid(body.dealId);
  const [customerResult, vehicleResult, dealResult] = await Promise.all([
    customerId ? context.service.from('customers').select('id, name, phone, email, address').eq('id', customerId).eq('store_id', context.member.storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    vehicleId ? context.service.from('vehicles').select('id, management_no, maker, model_name, model_year, mileage_km, vin, inspection_expiry_date').eq('id', vehicleId).eq('store_id', context.member.storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    dealId ? context.service.from('deals').select('id, customer_id, vehicle_id').eq('id', dealId).eq('store_id', context.member.storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (customerResult.error || vehicleResult.error || dealResult.error || (customerId && !customerResult.data) || (vehicleId && !vehicleResult.data) || (dealId && !dealResult.data)) return Response.json({ ok: false, code: 'forbidden_related_resource', error: '顧客、車両、または商談にアクセスできません。' }, { status: 403 });
  if (dealResult.data && ((customerId && dealResult.data.customer_id !== customerId) || (vehicleId && dealResult.data.vehicle_id !== vehicleId))) return Response.json({ ok: false, code: 'invalid_association', error: '商談と顧客・車両の関連が一致しません。' }, { status: 400 });

  const inputItems = Array.isArray(body.items) ? body.items : [];
  if (!inputItems.length || inputItems.length > 100) return Response.json({ ok: false, code: 'invalid_items', error: '見積明細を確認してください。' }, { status: 400 });
  const items = inputItems.map((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const itemType = text(item.itemType, 40); const name = text(item.name, 160); const quantity = money(item.quantity); const unitPrice = money(item.unitPrice); const taxRate = typeof item.taxRate === 'number' && item.taxRate >= 0 && item.taxRate <= 0.5 ? item.taxRate : 0.1;
    if (!itemType || !ITEM_TYPES.has(itemType) || !name || quantity === null || quantity <= 0 || unitPrice === null || (!NEGATIVE_TYPES.has(itemType) && unitPrice < 0) || (NEGATIVE_TYPES.has(itemType) && unitPrice > 0)) return null;
    const amount = quantity * unitPrice; const taxAmount = amount > 0 ? Math.round(amount * taxRate) : 0;
    return { item_order: index + 1, item_type: itemType, name, description: text(item.description, 500), quantity, unit_price: unitPrice, tax_rate: taxRate, tax_amount: taxAmount, amount };
  });
  if (items.some((item) => !item)) return Response.json({ ok: false, code: 'invalid_items', error: '見積明細を確認してください。' }, { status: 400 });
  const safeItems = items as Array<NonNullable<typeof items[number]>>;
  const subtotalAmount = safeItems.reduce((sum, item) => sum + item.amount, 0); const taxAmount = safeItems.reduce((sum, item) => sum + item.tax_amount, 0);
  const discountAmount = Math.abs(safeItems.filter((item) => item.item_type === 'discount').reduce((sum, item) => sum + item.amount, 0)); const tradeInAmount = Math.abs(safeItems.filter((item) => item.item_type === 'trade_in').reduce((sum, item) => sum + item.amount, 0));
  const quoteNo = `Q-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const customer = customerResult.data; const vehicle = vehicleResult.data;
  const quote = { quoteNo, title: text(body.title, 160), customerId, vehicleId, dealId, issueDate: text(body.issueDate, 10), expiryDate: text(body.expiryDate, 10), customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null, customerEmail: customer?.email ?? null, customerAddress: customer?.address ?? null, customerHonorific: text(body.customerHonorific, 40), vehicleLabel: vehicle ? [vehicle.management_no, vehicle.maker, vehicle.model_name].filter(Boolean).join(' / ') : null, vehicleMaker: vehicle?.maker ?? null, vehicleModelName: vehicle?.model_name ?? null, vehicleYear: vehicle?.model_year ?? null, vehicleMileageKm: vehicle?.mileage_km ?? null, vehicleVin: vehicle?.vin ?? null, vehicleInspectionExpiryDate: vehicle?.inspection_expiry_date ?? null, subtotalAmount, taxAmount, discountAmount, tradeInAmount, totalAmount: subtotalAmount + taxAmount, customerNote: text(body.customerNote, 2_000) };
  const { data: quoteId, error } = await context.service.rpc('garage_mobile_create_quote', { p_store_id: context.member.storeId, p_actor_user_id: context.user.id, p_actor_role: context.member.role, p_idempotency_key: idempotencyKey, p_quote: quote, p_items: safeItems });
  if (error || typeof quoteId !== 'string') return Response.json({ ok: false, code: 'quote_create_failed', error: '見積を保存できませんでした。' }, { status: 500 });
  const saved = await readMobileQuote(context.service, context.member.storeId, quoteId);
  if (!saved) return Response.json({ ok: false, code: 'quote_readback_failed', error: '保存した見積を取得できませんでした。' }, { status: 500 });
  await logAudit({ supabase: context.service, storeId: context.member.storeId, userId: context.user.id, userEmail: context.member.email, userRole: context.member.role, userDisplayName: context.member.displayName, action: 'create', targetType: 'quote', targetId: quoteId, targetLabel: quoteNo, metadata: { source: 'native_mobile', item_count: safeItems.length, operation_key_hash_present: true }, ipAddress: context.ipAddress, userAgent: context.userAgent });
  return Response.json({ ok: true, quote: saved }, { status: 201 });
}
