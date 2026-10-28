import { createHash } from 'node:crypto';
import { subtractCalendarMonths, defaultNoticeSettings, renderNoticeTemplate, type NoticeType, type MergeField } from './noticeRules';
import { buildGarageDocumentSnapshot } from './documentSnapshot';
type SourceGuard = { table: string; id: string; updatedAt?: string; values?: Record<string, string | number | boolean | null> };
const guardFields = ['id', 'store_id', 'quote_id', 'invoice_id', 'name', 'description', 'quantity', 'unit_price', 'amount', 'tax_rate', 'tax_category', 'line_discount_input_amount', 'unit', 'item_order'] as const;
function addGuard(guards: SourceGuard[], table: string, row: Record<string, unknown>, id = row.id) {
 if (!isUuid(id)) throw new Error('対象の版を確認できません。');
 if (typeof row.updated_at === 'string' && Number.isFinite(Date.parse(row.updated_at))) {
  guards.push({ table, id, updatedAt: row.updated_at }); return;
 }
 const values: Record<string, string | number | boolean | null> = {};
 for (const field of guardFields) {
  const value = row[field];
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) values[field] = value;
 }
 if (Object.keys(values).filter(k => k !== 'id').length === 0) throw new Error('対象の版を確認できません。');
 guards.push({ table, id, values });
}
type Row = Record<string, unknown>;
type DbError = { code?: string } | null;
type Query = PromiseLike<{ data: Row[] | null; error: DbError }> & {
 select(columns: string): Query; eq(column: string, value: unknown): Query; is(column: string, value: null): Query; in(column: string, values: readonly unknown[]): Query;
 order(column: string, options: { ascending: boolean }): Query; limit(count: number): Query;
 insert(values: object): Query; single(): Promise<{ data: Row | null; error: DbError }>; maybeSingle(): Promise<{ data: Row | null; error: DbError }>;
};
type HandoffDatabase = { from(table: string): Query };
// Both established session and service clients implement these public query methods.
// Their repository declaration types differ; the adapter never changes credentials or scope.
function database(client: unknown): HandoffDatabase { return client as HandoffDatabase; }
export const HANDOFF_KINDS = ['deal_notice', 'quote_notice', 'invoice_notice', 'price_reduction', 'repurchase'] as const;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export type HandoffInput = { kind: NoticeType; source_id: string; customer_ids?: string[]; idempotency_key: string };
export function parseHandoffInput(v: unknown): HandoffInput | null {
 if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
 const x = v as Record<string, unknown>;
 if (Object.keys(x).some(k => !['kind', 'source_id', 'customer_ids', 'idempotency_key'].includes(k)) || !(HANDOFF_KINDS as readonly unknown[]).includes(x.kind) || !isUuid(x.source_id) || !isUuid(x.idempotency_key)) return null;
 if (x.customer_ids !== undefined && (x.kind !== 'price_reduction' || !Array.isArray(x.customer_ids) || !x.customer_ids.length || x.customer_ids.length > 100 || !x.customer_ids.every(isUuid) || new Set(x.customer_ids).size !== x.customer_ids.length)) return null;
 return x as HandoffInput;
}
const ongoing = ['新規', '連絡済み', '来店予定', '見積済み', '商談中'];
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text = (v: unknown) => typeof v === 'string' ? v : '';
const money = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(v) : '';
async function one(db: HandoffDatabase, table: string, columns: string, store: string, id: string, guards?: SourceGuard[]) {
 const { data, error } = await db.from(table).select(columns).eq('store_id', store).eq('id', id).maybeSingle();
 if (error || !data) throw new Error('対象の情報を確認できません。');
 if (guards) addGuard(guards, table, data as unknown as Row);
 return data as unknown as Record<string, unknown>;
}
export async function prepareHandoffSnapshots(client: unknown, store: string, input: HandoffInput) {
 const db = database(client);
 const guards: SourceGuard[] = [];
 let deal: Record<string, unknown> | null = null, doc: Record<string, unknown> | null = null, price: Record<string, unknown> | null = null;
 let vehicleId: string | null = null, customerIds: string[] = [];
 if (input.kind === 'quote_notice' || input.kind === 'invoice_notice') {
  const table = input.kind === 'quote_notice' ? 'quotes' : 'invoices';
  doc = await one(db, table, `id,deal_id,customer_id,vehicle_id,updated_at,issue_status,deleted_at,is_archived,${table === 'quotes' ? 'quote_no,expiry_date,title,customer_email,vehicle_year,vehicle_mileage_km,vehicle_vin,vehicle_inspection_expiry_date' : 'invoice_no,payment_due_date,paid_amount,unpaid_amount'},issue_date,customer_name,customer_phone,customer_address,customer_honorific,vehicle_label,vehicle_maker,vehicle_model_name,tax_display_mode,subtotal_amount,tax_amount,discount_amount,trade_in_amount,total_amount,customer_note,internal_memo`, store, input.source_id, guards);
  if (doc.deleted_at || doc.is_archived || doc.issue_status !== 'issued') throw new Error('発行済みの書類のみ案内できます。');
  if (doc.deal_id !== null) {
   if (!isUuid(doc.deal_id)) throw new Error('書類の商談情報を確認できません。');
   deal = await one(db, 'deals', 'id,customer_id,vehicle_id,title,status,updated_at,deleted_at', store, doc.deal_id, guards);
  }
 } else if (input.kind === 'deal_notice') deal = await one(db, 'deals', 'id,customer_id,vehicle_id,title,status,updated_at,deleted_at', store, input.source_id, guards);
 if (deal) {
  if (deal.deleted_at || ['失注', 'cancelled', 'canceled'].includes(text(deal.status)) || !isUuid(deal.customer_id)) throw new Error('案内できる商談・顧客ではありません。');
  if (doc && (doc.customer_id !== deal.customer_id || doc.vehicle_id !== deal.vehicle_id)) throw new Error('書類と商談の対象が一致しません。');
  customerIds = [deal.customer_id]; vehicleId = isUuid(deal.vehicle_id) ? deal.vehicle_id : null;
 } else if (doc) {
  if (!isUuid(doc.customer_id)) throw new Error('書類に顧客を設定してください。顧客名だけでは配信準備できません。');
  if (doc.vehicle_id !== null && !isUuid(doc.vehicle_id)) throw new Error('書類の車両情報を確認できません。');
  customerIds = [doc.customer_id]; vehicleId = doc.vehicle_id as string | null;
 } else {
  vehicleId = input.source_id;
  if (input.kind === 'repurchase') {
   const { data: linked, error } = await db.from('deals').select('id,customer_id,updated_at').eq('store_id', store).eq('vehicle_id', vehicleId).eq('status', '成約').is('deleted_at', null);
   if (error) throw new Error('納車済み顧客を確認できません。');
   for (const row of linked ?? []) addGuard(guards, 'deals', row);
   customerIds = [...new Set((linked ?? []).map(d => d.customer_id).filter(isUuid))] as string[];
   if (customerIds.length !== 1) throw new Error('買替提案の所有顧客を一意に確認できません。');
  } else {
  const { data, error } = await db.from('garage_link_vehicle_price_changes').select('id,old_base_price,new_base_price,old_total_price,new_total_price,vehicle_version,created_at').eq('store_id', store).eq('vehicle_id', vehicleId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) throw new Error('保存済みの値下げ履歴がありません。'); price = data;
  const { data: deals, error: dealError } = await db.from('deals').select('id,customer_id,updated_at').eq('store_id', store).eq('vehicle_id', vehicleId).in('status', ongoing).is('deleted_at', null);
  if (dealError) throw new Error('対象顧客を確認できません。');
  for (const row of deals ?? []) addGuard(guards, 'deals', row);
  const eligible = [...new Set((deals ?? []).map(d => d.customer_id).filter(isUuid))] as string[];
  customerIds = input.customer_ids ?? eligible;
  if (!customerIds.length || customerIds.length > 100 || customerIds.some(id => !eligible.includes(id))) throw new Error('進行中の商談に紐づく顧客を指定してください。');
  }
 }
 const vehicle = vehicleId ? await one(db, 'vehicles', `id,maker,model_name,status,deleted_at,is_archived,updated_at,base_price,total_price,inspection_expiry_date${doc ? ',management_no,registration_no,grade,model_year,mileage_km,vin' : ''}`, store, vehicleId, guards) : null;
 if (vehicle && (vehicle.deleted_at || vehicle.is_archived || (input.kind === 'price_reduction' ? ['売約済', '売約', '廃車', 'sold', 'scrapped'] : ['廃車', 'scrapped']).includes(text(vehicle.status)))) throw new Error('この車両は案内できません。');
 if (price && (!vehicle || price.vehicle_version !== vehicle.updated_at || price.new_base_price !== vehicle.base_price || price.new_total_price !== vehicle.total_price)) throw new Error('値下げ後の車両情報が変わりました。');
 const { data: settings, error: settingsError } = await db.from('garage_link_notice_settings').select('templates,repurchase_enabled,repurchase_before_months,updated_at').eq('store_id', store).maybeSingle();
 if (settingsError) throw new Error('案内設定を確認できません。');
 if (input.kind === 'repurchase') {
  if (!settings?.repurchase_enabled || !vehicle?.inspection_expiry_date) throw new Error('買替提案が無効です。');
  const due = subtractCalendarMonths(text(vehicle.inspection_expiry_date), Number(settings.repurchase_before_months));
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  if (today < due || today > text(vehicle.inspection_expiry_date)) throw new Error('買替提案の期間外です。');
 }
 const { data: storeRow, error: storeError } = await db.from('stores').select(doc ? 'id,updated_at,name,company_name,representative_name,invoice_registration_number,postal_code,address,building,phone,fax,email,bank_name,bank_branch_name,bank_account_type,bank_account_number,bank_account_holder,quote_note,invoice_note,document_footer_text' : 'name').eq('id', store).single();
 if (storeError || !storeRow) throw new Error('店舗情報を確認できません。');
 let documentItems: Row[] = [];
 if (doc) {
  // The narrow SQL guard checks this exact store's real timestamp without
  // granting cross-service clients direct access to company or bank details.
  if (storeRow.id !== store || typeof storeRow.updated_at !== 'string' || !Number.isFinite(Date.parse(storeRow.updated_at))) throw new Error('帳票の店舗情報の版を確認できません。');
  addGuard(guards, 'stores', storeRow);
  const quote = input.kind === 'quote_notice';
  const { data: items, error } = await db.from(quote ? 'quote_items' : 'invoice_items').select(`id,${quote ? 'quote_id,description,tax_amount' : 'invoice_id'},updated_at,item_order,name,quantity,unit_price,amount,tax_category,tax_rate,unit,note,line_discount_input_amount`).eq(quote ? 'quote_id' : 'invoice_id', input.source_id).order('item_order', { ascending: true });
  if (error || !items?.length) throw new Error('書類明細を確認できません。');
  for (const item of items) addGuard(guards, quote ? 'quote_items' : 'invoice_items', item);
  documentItems = items;
 }
 const reducedTotal = price && typeof price.old_total_price === 'number' && typeof price.new_total_price === 'number' && price.new_total_price < price.old_total_price;
 const reducedBase = price && typeof price.old_base_price === 'number' && typeof price.new_base_price === 'number' && price.new_base_price < price.old_base_price;
 if (price && !reducedTotal && !reducedBase) throw new Error('値下げ履歴ではありません。');
 const template = (settings?.templates as Record<string, string> | undefined)?.[input.kind] ?? defaultNoticeSettings().templates[input.kind];
 if (doc && !deal && template.includes('{{deal_title}}')) throw new Error('商談のない書類では商談名の差し込みを使用できません。案内本文設定を確認してください。');
 const results = [];
 for (const customerId of customerIds) {
  const customer = await one(db, 'customers', `id,name,deleted_at,is_archived,delivery_permission,customer_status,line_friend_status,updated_at${doc ? ',phone,email,address,customer_type' : ''}`, store, customerId);
  if (customer.deleted_at || customer.is_archived || !['allowed', '許可'].includes(text(customer.delivery_permission)) || (['blocked', '配信停止'].includes(text(customer.customer_status)) || ['blocked', 'ブロック'].includes(text(customer.line_friend_status)))) throw new Error('案内を許可されていない顧客が含まれます。');
  const sourceGuards = [...guards]; addGuard(sourceGuards, 'customers', customer);
  sourceGuards.sort((a, b) => (a.table + a.id).localeCompare(b.table + b.id));
  const document = doc && (input.kind === 'quote_notice' || input.kind === 'invoice_notice') ? buildGarageDocumentSnapshot(input.kind, doc, documentItems, storeRow, vehicle, customer) : undefined;
  const vehicleName = vehicle ? [vehicle.maker, vehicle.model_name].filter(Boolean).join(' ') : '';
  const values: Partial<Record<MergeField, string>> = { customer_name: text(customer.name), vehicle_name: vehicleName, deal_title: text(deal?.title), inspection_expiry_date: text(vehicle?.inspection_expiry_date), document_url: '{{document_url}}', document_number: text(doc?.quote_no ?? doc?.invoice_no), total_amount: money(doc?.total_amount), store_name: text(storeRow.name), old_price: money(reducedTotal ? price?.old_total_price : price?.old_base_price), new_price: money(reducedTotal ? price?.new_total_price : price?.new_base_price) };
  const payload: Record<string, unknown> = { version: 1, bodyText: renderNoticeTemplate(template, values), customerName: text(customer.name), vehicleName, sourceGuards };
  if (price) payload.priceChangeId = price.id;
  if (input.kind === 'repurchase') payload.repurchaseMonths = Number(settings?.repurchase_before_months);
  if (document) payload.document = document;
  const sourceVersion = digest({ deal, doc, price, vehicle, customer, document, sourceGuards });
  results.push({ store_id: store, customer_id: customerId, kind: input.kind, source_id: input.source_id, source_version: sourceVersion, vehicle_id: vehicleId, payload, idempotency_key: input.kind === 'repurchase' ? createHash('sha256').update(['repurchase', store, customerId, vehicleId, text(vehicle?.inspection_expiry_date), String(settings?.repurchase_before_months)].join('|')).digest('hex') : digest({ kind: input.kind, source: price?.id ?? input.source_id, version: price ? undefined : sourceVersion, customerId }), status: 'pending' });
 }
 return results;
}
export async function createHandoffs(client: unknown, store: string, input: HandoffInput) {
 const db = database(client);
 const snapshots = await prepareHandoffSnapshots(db, store, input); const ids: string[] = [];
 for (const snapshot of snapshots) {
  const { data, error } = await db.from('garage_link_handoffs').insert(snapshot).select('id').single();
  if (error?.code === '23505') {
   const old = await db.from('garage_link_handoffs').select('id,source_version,status,revoked_at').eq('store_id', store).eq('idempotency_key', snapshot.idempotency_key).maybeSingle();
   if (old.error || !old.data || old.data.source_version !== snapshot.source_version || old.data.revoked_at || old.data.status === 'invalidated') throw new Error('前回の案内状態を確認してください。'); if (!isUuid(old.data.id)) throw new Error('案内IDが不正です。'); ids.push(old.data.id);
  } else if (error || !data) throw new Error('案内を作成できませんでした。再送せず一覧を確認してください。'); else { if (!isUuid(data.id)) throw new Error('案内IDが不正です。'); ids.push(data.id); }
 }
 return ids;
}
export async function validateHandoff(client: unknown, store: string, row: Record<string, unknown>) {
 const db = database(client);
 if (row.store_id !== store || row.revoked_at || !['pending', 'imported'].includes(text(row.status)) || !isUuid(row.source_id) || !isUuid(row.customer_id)) return false;
 try { const snapshots = await prepareHandoffSnapshots(db, store, { kind: row.kind as NoticeType, source_id: row.source_id, customer_ids: row.kind === 'price_reduction' ? [row.customer_id] : undefined, idempotency_key: String(row.id) }); return snapshots.some(s => s.customer_id === row.customer_id && s.source_version === row.source_version); } catch { return false; }
}

export async function readHandoffBody(request: Request, limit: number): Promise<string> {
 const reader = request.body?.getReader(); if (!reader) throw new Error('EMPTY_BODY');
 const chunks: Uint8Array[] = []; let size = 0;
 while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); } chunks.push(value); }
 const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
 return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
