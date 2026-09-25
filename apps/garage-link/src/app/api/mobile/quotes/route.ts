import { mobileReadPage, mobileReadResult, mobileReadHeaders } from '@/lib/mobile/pagination';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_QUOTE_FIELDS, mobileQuote } from '@/lib/mobile/dto';
import { readMobileQuote } from '@/lib/mobile/quoteService';
import { logAudit } from '@/lib/audit/logAudit';
import { createAdminClient } from '@/lib/supabase/admin';
import { importDocument, type DocumentHeader, type StoredDocumentLine } from '@/lib/business/documents';
import { calculateDocument, decimal, type TaxDisplayMode, type TaxCategory } from '@/lib/business/money';

const ITEM_TYPES = new Set(['vehicle', 'part', 'labor', 'service', 'fee', 'option', 'registration', 'inspection', 'tax', 'insurance', 'other', 'discount', 'trade_in']);
const NEGATIVE_TYPES = new Set(['discount', 'trade_in']);
const KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;

function text(value: unknown, max = 300) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null; }
function money(value: unknown, places: number) { if(typeof value !== 'number' || !Number.isFinite(value)) return null; try { decimal(Math.abs(value),places); return value; } catch {return null;} }
function uuid(value: unknown) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null; }

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const page = mobileReadPage(request);
  if (!page) return Response.json({ ok: false, code: 'invalid_page', error: '一覧の取得条件が正しくありません。' }, { status: 400 });
  let query = context.service.from('quotes').select(MOBILE_QUOTE_FIELDS).eq('store_id', context.member.storeId).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit);
  const url = new URL(request.url);
  for (const [key, column] of [['customerId','customer_id'],['dealId','deal_id'],['maintenanceJobId','maintenance_job_id']] as const) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    if (!uuid(value)) return Response.json({ ok: false, code: 'invalid_filter' }, { status: 400 });
    query = query.eq(column, value);
  }
  const { data, error } = await query;
  if (error) return Response.json({ ok: false, code: 'quote_list_failed', error: '見積を取得できませんでした。' }, { status: 500 });
  const result = mobileReadResult(data ?? [], page);
  return Response.json({ ok: true, quotes: result.rows.map((quote) => mobileQuote(quote as Record<string, unknown>)), nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
}

export async function POST(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (context.member.role === 'viewer') return Response.json({ ok: false, code: 'forbidden_role', error: '閲覧権限では見積を作成できません。' }, { status: 403 });
  const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() ?? '';
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!KEY_RE.test(idempotencyKey) || !body) return Response.json({ ok: false, code: 'invalid_request', error: '操作IDまたは見積内容が正しくありません。' }, { status: 400 });

  const customerId = uuid(body.customerId); const vehicleId = uuid(body.vehicleId); const dealId = uuid(body.dealId); const maintenanceJobId = uuid(body.maintenanceJobId);
  const [customerResult, vehicleResult, dealResult, maintenanceResult] = await Promise.all([
    customerId ? context.service.from('customers').select('id, name, phone, email, address').eq('id', customerId).eq('store_id', context.member.storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    vehicleId ? context.service.from('vehicles').select('id, management_no, maker, model_name, model_year, mileage_km, vin, inspection_expiry_date').eq('id', vehicleId).eq('store_id', context.member.storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    dealId ? context.service.from('deals').select('id, customer_id, vehicle_id').eq('id', dealId).eq('store_id', context.member.storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    maintenanceJobId ? context.service.from('maintenance_jobs').select('id, customer_id, vehicle_id, tax_display_mode').eq('id', maintenanceJobId).eq('store_id', context.member.storeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (customerResult.error || vehicleResult.error || dealResult.error || maintenanceResult.error || (customerId && !customerResult.data) || (vehicleId && !vehicleResult.data) || (dealId && !dealResult.data) || (maintenanceJobId && !maintenanceResult.data)) return Response.json({ ok: false, code: 'forbidden_related_resource', error: '関連先にアクセスできません。' }, { status: 403 });
  if (dealResult.data && ((customerId && dealResult.data.customer_id !== customerId) || (vehicleId && dealResult.data.vehicle_id !== vehicleId))) return Response.json({ ok: false, code: 'invalid_association', error: '商談と顧客・車両の関連が一致しません。' }, { status: 400 });
  if (maintenanceResult.data && ((customerId && maintenanceResult.data.customer_id !== customerId) || (vehicleId && maintenanceResult.data.vehicle_id !== vehicleId))) return Response.json({ ok: false, code: 'invalid_association', error: '整備案件と顧客・車両の関連が一致しません。' }, { status: 400 });

  const inputItems = Array.isArray(body.items) ? body.items : [];
  if (!inputItems.length || inputItems.length > 100) return Response.json({ ok: false, code: 'invalid_items', error: '見積明細を確認してください。' }, { status: 400 });
  const items = inputItems.map((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const itemType = text(item.itemType, 40); const name = text(item.name, 160); const quantity = money(item.quantity, 3); const unitPrice = money(item.unitPrice, 4); const taxRate = typeof item.taxRate === 'number' && item.taxRate >= 0 && item.taxRate <= 0.5 ? item.taxRate : 0.1;
    if (!itemType || !ITEM_TYPES.has(itemType) || !name || quantity === null || quantity <= 0 || unitPrice === null || (!NEGATIVE_TYPES.has(itemType) && unitPrice < 0) || (NEGATIVE_TYPES.has(itemType) && unitPrice > 0)) return null;
    const partId=item.partId == null?null:uuid(item.partId);
    const costPrice=item.costPrice == null?null:money(item.costPrice,4);
    if((item.partId != null && !partId) || (item.costPrice != null && (costPrice===null || costPrice<0))) return null;
    const taxCategory: TaxCategory = item.taxCategory === 'exempt' || item.taxCategory === 'out_of_scope' ? item.taxCategory : 'taxable';
    const lineDiscount=money(item.lineDiscountInputAmount ?? 0,0);
    if(lineDiscount===null || lineDiscount<0) return null;
    return { line_discount_input_amount:lineDiscount,item_order:index+1,item_type:itemType,part_id:partId,cost_price:costPrice,name,description:text(item.description,500),quantity,unit_price:unitPrice,tax_rate:taxRate,tax_category:taxCategory,unit:text(item.unit,40),note:text(item.note,500) };
  });
  if (items.some((item) => !item)) return Response.json({ ok: false, code: 'invalid_items', error: '見積明細を確認してください。' }, { status: 400 });
  const validatedItems = items as Array<NonNullable<typeof items[number]>>;
  const partIds=[...new Set(validatedItems.flatMap(item=>item.part_id?[item.part_id]:[]))];
  if(partIds.length) {
    const parts=await context.service.from('repair_parts').select('id').eq('store_id',context.member.storeId).in('id',partIds).is('deleted_at',null);
    if(parts.error || parts.data?.length!==partIds.length) return Response.json({ok:false,code:'forbidden_part'},{status:403});
  }
  const storeResult=await context.service.from('stores').select('tax_display_mode').eq('id',context.member.storeId).single();
  if(storeResult.error || !storeResult.data) return Response.json({ok:false,code:'settings_unavailable',error:'店舗設定を取得できませんでした。'},{status:503});
  const maintenanceMode=maintenanceResult.data?.tax_display_mode;
  let mode: TaxDisplayMode = maintenanceMode === 'included' || maintenanceMode === 'excluded' ? maintenanceMode : storeResult.data.tax_display_mode === 'excluded' ? 'excluded' : 'included';
  let sourceDiscount=0,sourceTradeIn=0;
  let copySource: DocumentHeader | null=null;
  if (body.sourceQuoteId != null) {
    const sourceId=uuid(body.sourceQuoteId);
    if(!sourceId) return Response.json({ok:false,code:'invalid_source'},{status:400});
    const [source,sourceItems]=await Promise.all([
      context.service.from('quotes').select('*').eq('id',sourceId).eq('store_id',context.member.storeId).maybeSingle(),
      context.service.from('quote_items').select('*').eq('quote_id',sourceId).eq('store_id',context.member.storeId).order('item_order'),
    ]);
    if(source.error || !source.data || sourceItems.error) return Response.json({ok:false,code:'forbidden_source',error:'コピー元にアクセスできません。'},{status:403});
    copySource=source.data as DocumentHeader;
    const imported=importDocument(source.data as DocumentHeader,(sourceItems.data ?? []) as StoredDocumentLine[]);
    mode=imported.mode;sourceDiscount=Number(imported.discount);sourceTradeIn=Number(imported.tradeIn);
  }
  if(body.taxDisplayMode != null && body.taxDisplayMode !== mode) return Response.json({ok:false,code:'tax_mode_mismatch',error:'金額表示方式が更新されました。元の画面を開き直してください。'},{status:400});
  let calculated: ReturnType<typeof calculateDocument>;
  const positiveItems=validatedItems.filter(item=>!NEGATIVE_TYPES.has(item.item_type));
  try {
    const discount=validatedItems.some(item=>item.item_type==='discount')?validatedItems.filter(item=>item.item_type==='discount').reduce((sum,item)=>sum-item.quantity*item.unit_price,0):Number(body.discountInputAmount ?? sourceDiscount);
    const tradeIn=validatedItems.some(item=>item.item_type==='trade_in')?validatedItems.filter(item=>item.item_type==='trade_in').reduce((sum,item)=>sum-item.quantity*item.unit_price,0):Number(body.tradeInAmount ?? sourceTradeIn);
    calculated=calculateDocument(positiveItems,mode,{discount,tradeIn});
  } catch { return Response.json({ok:false,code:'invalid_total',error:'見積の数量・金額を確認してください。'},{status:400}); }
  const safeItems=positiveItems.map((item,index)=>({...item,...calculated.lines[index],tax_amount:calculated.lines[index].discounted_tax_amount,item_order:index+1}));
  const totals={taxDisplayMode:mode,discountInputAmount:calculated.discount_input_amount,subtotalAmount:calculated.subtotal_amount,taxAmount:calculated.tax_amount,discountAmount:calculated.discount_amount,tradeInAmount:calculated.trade_in_amount,totalAmount:calculated.total_amount};
  // The operation key must also stabilize server-generated fields across a retry.
  const operationHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${context.member.storeId}:${idempotencyKey}`)))).map(value=>value.toString(16).padStart(2,'0')).join('');
  const quoteNo = `Q-M-${operationHash.slice(0,20).toUpperCase()}`;
  const customer = customerResult.data; const vehicle = vehicleResult.data;
  const quote = { quoteNo, title: text(body.title, 160), customerId, vehicleId, dealId, maintenanceJobId, issueDate: text(body.issueDate, 10), expiryDate: text(body.expiryDate, 10), customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null, customerEmail: customer?.email ?? null, customerAddress: customer?.address ?? null, customerHonorific: text(body.customerHonorific, 40), vehicleLabel: vehicle ? [vehicle.management_no, vehicle.maker, vehicle.model_name].filter(Boolean).join(' / ') : null, vehicleMaker: vehicle?.maker ?? null, vehicleModelName: vehicle?.model_name ?? null, vehicleYear: vehicle?.model_year ?? null, vehicleMileageKm: vehicle?.mileage_km ?? null, vehicleVin: vehicle?.vin ?? null, vehicleInspectionExpiryDate: vehicle?.inspection_expiry_date ?? null, ...totals, customerNote: text(body.customerNote, 2_000) };
  if(copySource) {
    const copied:Record<string,unknown>={internalMemo:copySource.internal_memo ?? null,paymentMethod:copySource.payment_method ?? null,loanRequest:copySource.loan_request ?? null,downPayment:copySource.down_payment ?? 0,installmentCount:copySource.installment_count ?? null,paymentDueDate:copySource.payment_due_date ?? null};
    if(copySource.customer_id===customerId) for(const [camel,snake] of [['customerName','customer_name'],['customerPhone','customer_phone'],['customerEmail','customer_email'],['customerAddress','customer_address'],['customerHonorific','customer_honorific']]) copied[camel]=copySource[snake] ?? null;
    if(copySource.vehicle_id===vehicleId) for(const [camel,snake] of [['vehicleLabel','vehicle_label'],['vehicleMaker','vehicle_maker'],['vehicleModelName','vehicle_model_name'],['vehicleYear','vehicle_year'],['vehicleMileageKm','vehicle_mileage_km'],['vehicleVin','vehicle_vin'],['vehicleInspectionExpiryDate','vehicle_inspection_expiry_date']]) copied[camel]=copySource[snake] ?? null;
    Object.assign(quote,copied);
  }
  // The route has already validated this Bearer against the selected store.
  // Keep the SECURITY DEFINER write RPC service-only: granting it to
  // `authenticated` would allow direct RPC calls to bypass that route guard.
  const admin = createAdminClient();
  if (!admin) return Response.json({ ok: false, code: 'mobile_config_missing', error: 'サーバー側の認証設定が不足しています。' }, { status: 500 });
  const { data: quoteId, error } = await admin.rpc('garage_mobile_create_quote', { p_store_id: context.member.storeId, p_actor_user_id: context.user.id, p_actor_role: context.member.role, p_idempotency_key: idempotencyKey, p_quote: quote, p_items: safeItems });
  if (error || typeof quoteId !== 'string') {
    console.error('[mobile-quote-write]', { stage: 'rpc', providerCode: typeof error?.code === 'string' ? error.code.slice(0, 64) : 'invalid_result' });
    return Response.json({ ok: false, code: 'quote_create_failed', error: '見積を保存できませんでした。' }, { status: 500 });
  }
  const saved = await readMobileQuote(context.service, context.member.storeId, quoteId);
  if (!saved) {
    console.error('[mobile-quote-write]', { stage: 'readback', providerCode: 'quote_not_visible' });
    return Response.json({ ok: false, code: 'quote_readback_failed', error: '保存した見積を取得できませんでした。' }, { status: 500 });
  }
  await logAudit({ supabase: context.service, storeId: context.member.storeId, userId: context.user.id, userEmail: context.member.email, userRole: context.member.role, userDisplayName: context.member.displayName, action: 'create', targetType: 'quote', targetId: quoteId, targetLabel: quoteNo, metadata: { source: 'native_mobile', item_count: safeItems.length, operation_key_hash_present: true }, ipAddress: context.ipAddress, userAgent: context.userAgent });
  return Response.json({ ok: true, quote: saved }, { status: 201 });
}
