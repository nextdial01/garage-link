import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { mobileReadHeaders, mobileReadPage, mobileReadResult } from '@/lib/mobile/pagination';
import { assertDocumentLimitAvailable } from '@/lib/billing/garageSubscription';
import { documentCalculation, importDocument, type DocumentHeader, type StoredDocumentLine } from '@/lib/business/documents';
import type { PartLineItem } from '@/components/parts/PartLineItemsEditor';
import { uuid } from '@/lib/mobile/v2Resources';

const FIELDS = 'tax_display_mode,discount_input_amount,id,quote_id,deal_id,maintenance_job_id,customer_id,vehicle_id,invoice_no,title,status,issue_status,issue_date,payment_due_date,customer_name,vehicle_label,subtotal_amount,tax_amount,discount_amount,trade_in_amount,total_amount,paid_amount,unpaid_amount,customer_note,updated_at';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const page = mobileReadPage(request);
  if (!page) return Response.json({ ok: false, code: 'invalid_page' }, { status: 400 });
  let query = context.service.from('invoices').select(FIELDS).eq('store_id', context.member.storeId).is('deleted_at', null)
    .order('updated_at', { ascending: false }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit);
  const url = new URL(request.url);
  for (const key of ['customer_id','deal_id','maintenance_job_id']) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    if (!uuid(value)) return Response.json({ ok: false, code: 'invalid_filter' }, { status: 400 });
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) return Response.json({ ok: false, code: 'invoice_read_failed' }, { status: 500 });
  const result = mobileReadResult(data ?? [], page);
  return Response.json({ ok: true, invoices: result.rows, nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
}

export async function POST(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (!['owner','admin','staff'].includes(context.member.role)) return Response.json({ ok: false, code: 'forbidden_role' }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if(body?.sourceInvoiceId != null) {
    if(!uuid(body.sourceInvoiceId) || !Array.isArray(body.items) || body.items.length>100 || body.items.length===0) return Response.json({ok:false,code:'invalid_invoice_copy'},{status:400});
    const [source,sourceItems]=await Promise.all([
      context.service.from('invoices').select('*').eq('id',body.sourceInvoiceId).eq('store_id',context.member.storeId).maybeSingle(),
      context.service.from('invoice_items').select('*').eq('invoice_id',body.sourceInvoiceId).eq('store_id',context.member.storeId).order('item_order'),
    ]);
    if(source.error || !source.data || sourceItems.error) return Response.json({ok:false,code:'forbidden_source'},{status:403});
    const original=source.data as DocumentHeader;
    const imported=importDocument(original,(sourceItems.data ?? []) as StoredDocumentLine[]);
    if(body.taxDisplayMode != null && body.taxDisplayMode!==imported.mode) return Response.json({ok:false,code:'tax_mode_mismatch'},{status:400});
    try {
      const draftLines:PartLineItem[]=[];
      let discount=body.discountInputAmount == null ? Number(imported.discount) : Number(body.discountInputAmount);
      let tradeIn=body.tradeInAmount == null ? Number(imported.tradeIn) : Number(body.tradeInAmount);
      const raw=body.items as Array<Record<string,unknown>>;
      if(raw.some(x=>x?.itemType==='discount')) discount=0;
      if(raw.some(x=>x?.itemType==='trade_in')) tradeIn=0;
      for(const [index,item] of raw.entries()) {
        if(!item || typeof item.name!=='string' || !item.name.trim() || item.name.length>160) throw new Error('invalid_item');
        if(item.itemType==='discount' || item.itemType==='trade_in') {
          const deduction=Number(item.quantity)*Number(item.unitPrice)*-1;
          if(!Number.isSafeInteger(deduction) || deduction<0) throw new Error('invalid_deduction');
          if(item.itemType==='discount')discount+=deduction;else tradeIn+=deduction;continue;
        }
        if(item.partId != null && !uuid(item.partId)) throw new Error('part_scope');
        if(item.costPrice != null && (typeof item.costPrice!=='number' || !Number.isFinite(item.costPrice) || item.costPrice<0)) throw new Error('invalid_cost');
        draftLines.push({line_discount_input_amount:String(item.lineDiscountInputAmount ?? 0),localId:String(index),name:item.name.trim(),item_type:typeof item.itemType==='string'?item.itemType:'part',part_id:uuid(item.partId)?String(item.partId):null,part_no:'',quantity:String(item.quantity),unit_price:String(item.unitPrice),cost_price:item.costPrice==null?'':String(item.costPrice),tax_rate:String(item.taxRate ?? 0.1),tax_category:item.taxCategory==='exempt'||item.taxCategory==='out_of_scope'?item.taxCategory:'taxable',unit:typeof item.unit==='string'?item.unit.slice(0,40):'',note:typeof item.note==='string'?item.note.slice(0,500):''});
      }
      const calculation=documentCalculation([],{discount:String(discount),trade_in:String(tradeIn)},draftLines,imported.mode);
      // This helper only calls from/rpc; the SSR ambient auth.getClaims type differs from the bearer SDK.
      await assertDocumentLimitAvailable(context.service as unknown as Parameters<typeof assertDocumentLimitAvailable>[0],context.member.storeId);
      const fields=['deal_id','maintenance_job_id','customer_id','vehicle_id','title','assigned_user_name','customer_name','customer_phone','customer_email','customer_postal_code','customer_address','customer_honorific','vehicle_label','vehicle_maker','vehicle_model_name','vehicle_year','vehicle_mileage_km','vehicle_vin','vehicle_registration_no','payment_method','customer_note','internal_memo'];
      const header=Object.fromEntries(fields.map(key=>[key,original[key] ?? null]));
      Object.assign(header,{invoice_no:`INV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,status:'draft',issue_status:'draft',tax_display_mode:imported.mode,discount_input_amount:calculation.discount_input_amount,subtotal_amount:calculation.subtotal_amount,tax_amount:calculation.tax_amount,discount_amount:calculation.discount_amount,trade_in_amount:calculation.trade_in_amount,total_amount:calculation.total_amount});
      if(body.customerId != null && body.customerId!==original.customer_id) {
        if(!uuid(body.customerId)) throw new Error('customer_scope');
        const customer=await context.service.from('customers').select('id,name,phone,email,postal_code,address').eq('id',body.customerId).eq('store_id',context.member.storeId).single();
        if(customer.error || !customer.data) throw new Error('customer_scope');
        Object.assign(header,{customer_id:customer.data.id,customer_name:customer.data.name,customer_phone:customer.data.phone,customer_email:customer.data.email,customer_postal_code:customer.data.postal_code,customer_address:customer.data.address});
      }
      if(body.vehicleId != null && body.vehicleId!==original.vehicle_id) {
        if(!uuid(body.vehicleId)) throw new Error('vehicle_scope');
        const vehicle=await context.service.from('vehicles').select('id,maker,model_name,model_year,mileage_km,vin,registration_no').eq('id',body.vehicleId).eq('store_id',context.member.storeId).single();
        if(vehicle.error || !vehicle.data) throw new Error('vehicle_scope');
        Object.assign(header,{vehicle_id:vehicle.data.id,vehicle_label:[vehicle.data.maker,vehicle.data.model_name].filter(Boolean).join(' '),vehicle_maker:vehicle.data.maker,vehicle_model_name:vehicle.data.model_name,vehicle_year:vehicle.data.model_year,vehicle_mileage_km:vehicle.data.mileage_km,vehicle_vin:vehicle.data.vin,vehicle_registration_no:vehicle.data.registration_no});
      }
      for(const [input,column] of [['issueDate','issue_date'],['dueDate','payment_due_date']] as const) {
        if(body[input]) {if(typeof body[input]!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body[input])) throw new Error('invalid_date');header[column]=body[input];}
      }
      if(typeof body.title==='string')header.title=body.title.slice(0,160);
      if(typeof body.customerNote==='string')header.customer_note=body.customerNote.slice(0,2000);
      if(typeof body.internalMemo==='string')header.internal_memo=body.internalMemo.slice(0,2000);
      const {data,error}=await context.service.rpc('save_document',{p_store_id:context.member.storeId,p_kind:'invoice',p_header:header,p_items:calculation.persisted,p_document_id:null});
      if(error || !data || typeof data!=='object' || !('id' in data)) return Response.json({ok:false,code:'invoice_copy_failed',error:'請求書を保存できませんでした。'},{status:503});
      const saved=await context.service.from('invoices').select(FIELDS).eq('id',data.id).eq('store_id',context.member.storeId).single();
      if(saved.error || !saved.data) return Response.json({ok:false,code:'invoice_readback_failed'},{status:500});
      return Response.json({ok:true,invoice:saved.data},{status:201});
    } catch {return Response.json({ok:false,code:'invalid_invoice_copy',error:'コピー先の明細・金額を確認してください。'},{status:400});}
  }
  if (!body || !uuid(body.id) || !uuid(body.quoteId) || (body.dueDate && (typeof body.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)))) return Response.json({ ok: false, code: 'invalid_invoice' }, { status: 400 });
  const { data: quote } = await context.service.from('quotes').select('id').eq('id', body.quoteId).eq('store_id', context.member.storeId).maybeSingle();
  if (!quote) return Response.json({ ok: false, code: 'forbidden_related_resource' }, { status: 403 });
  const { data, error } = await context.service.rpc('garage_mobile_invoice_from_quote', { p_store_id: context.member.storeId, p_quote_id: body.quoteId, p_invoice_id: body.id, p_due_date: body.dueDate || null });
  if (error || !data || typeof data !== 'object') return Response.json({ ok: false, code: 'invoice_create_failed' }, { status: 503 });
  const result = data as { ok?: boolean; code?: string };
  if (!result.ok) return Response.json({ ...result }, { status: result.code === 'ROLE_FORBIDDEN' ? 403 : 409 });
  const { data: invoice, error: readError } = await context.service.from('invoices').select(FIELDS).eq('id', body.id).eq('store_id', context.member.storeId).maybeSingle();
  if (readError || !invoice) return Response.json({ ok: false, code: 'invoice_readback_failed' }, { status: 500 });
  return Response.json({ ok: true, invoice, replayed: result.code === 'REPLAYED' }, { status: result.code === 'REPLAYED' ? 200 : 201 });
}
