import { appendPhotoAsset, type PhotoAsset } from './photoUpload';
import { validMobileApiOrigin } from './apiOrigin';
import { supabase } from './supabase';

const baseUrl = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '');
export type Store = { id: string; tenantId: string; name: string; role: 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer' };
export type MasterEntry = { id: string; kind: string; label: string; is_active: boolean; sort_order: number };
export type Vehicle = { inspectionExpiryDate?: string | null; liabilityInsuranceExpiryDate?: string | null; id: string; managementNo: string | null; maker: string | null; modelName: string | null; grade: string | null; registrationNo: string | null; mileageKm: number | null; color: string | null; totalPrice: number | null; status: string | null; locationName: string | null; description: string | null };
export type VehicleDraft = { inspectionExpiryDate?: string; liabilityInsuranceExpiryDate?: string; managementNo?: string; vin: string; maker: string; modelName: string; registrationNo?: string; mileageKm?: number; color?: string; locationName?: string; status?: '在庫中' | '展示中' | '商談中' | '整備中'; description?: string };
export type VehicleEdit = { inspectionExpiryDate?: string | null; liabilityInsuranceExpiryDate?: string | null; managementNo?: string | null; maker?: string | null; modelName?: string | null; grade?: string | null; registrationNo?: string | null; mileageKm?: number | null; color?: string | null; locationName?: string | null; description?: string | null };


export type VehicleDetail = { vehicle: Vehicle; imageFiles: { id: string; mime_type: string; created_at: string }[] };
export type TodayItem = { id: string; job_no?: string | null; job_type?: string | null; appointment_type?: string | null; status?: string | null; scheduled_at?: string | null; scheduled_in_at?: string | null; scheduled_delivery_at?: string | null; assigned_user_name?: string | null; customerName?: string | null; vehicleLabel?: string | null };
export type Today = { appointments: TodayItem[]; deliveries: TodayItem[]; incompleteWork: TodayItem[]; assignedWork: TodayItem[] };
export type MaintenanceJob = { id: string; customer_id?: string | null; vehicle_id?: string | null; job_no: string | null; job_type: string | null; status: string | null; scheduled_in_at: string | null; scheduled_delivery_at: string | null; assigned_user_name: string | null; estimated_total_amount: number | null; customerName?: string | null; vehicleLabel?: string | null };
export type Customer = { id: string; name: string | null; kana: string | null; phone: string | null; mobile_phone: string | null; email: string | null; address: string | null; customer_status: string | null; assigned_user_name: string | null; next_action_date: string | null; updated_at: string | null };
export type QuoteItem = { lineDiscountInputAmount?: number | null; partId?: string | null; costPrice?: number | null; taxCategory?: 'taxable' | 'exempt' | 'out_of_scope'; unit?: string | null; note?: string | null; id?: string; itemOrder?: number; itemType: string; name: string; description?: string | null; quantity: number; unitPrice: number; taxRate?: number; taxAmount?: number; amount?: number };
export type Quote = { taxDisplayMode?: 'included' | 'excluded' | null; discountInputAmount?: number | null; id: string; quoteNo: string | null; title: string | null; status: string | null; issueDate: string | null; expiryDate: string | null; customerId: string | null; vehicleId: string | null; dealId?: string | null; maintenanceJobId?: string | null; customerName: string | null; customerPhone: string | null; customerEmail: string | null; customerAddress: string | null; customerHonorific: string | null; vehicleLabel: string | null; subtotalAmount: number | null; taxAmount: number | null; discountAmount: number | null; tradeInAmount: number | null; totalAmount: number | null; customerNote: string | null; updatedAt: string | null; items: QuoteItem[] };
export type CustomerDetail = { customer: Customer; vehicles: Vehicle[]; maintenance: MaintenanceJob[]; deals: { id: string; deal_no: string | null; title: string | null; status: string | null; vehicle_id: string | null; next_action_at: string | null }[]; quotes: Quote[] };
export type QuoteDraft = { discountInputAmount?: number; tradeInAmount?: number; sourceQuoteId?: string; taxDisplayMode?: 'included' | 'excluded'; title?: string; customerId?: string; vehicleId?: string; dealId?: string; maintenanceJobId?: string; issueDate?: string; expiryDate?: string; customerHonorific?: string; customerNote?: string; items: Pick<QuoteItem, 'itemType' | 'name' | 'description' | 'quantity' | 'unitPrice' | 'taxRate' | 'taxCategory' | 'unit' | 'note' | 'partId' | 'costPrice' | 'lineDiscountInputAmount'>[] };
export type V2Resource = 'customers' | 'deals' | 'appointments' | 'maintenance' | 'tradeIns';
export type V2Record = Record<string, unknown> & { id: string };
export type PurchaseDraft = { inspectionExpiryDate?: string; liabilityInsuranceExpiryDate?: string; id: string; vin: string; maker: string; modelName: string; managementNo?: string; supplierName: string; supplierType: string; purchaseDate: string; purchasePrice: number; listingPrice?: number; marketValue?: number; direct_cost_special?: number; direct_cost_accessories?: number; direct_cost_agency?: number; direct_cost_legal?: number; direct_cost_other?: number; direct_cost_repair?: number };

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

async function accessToken() { const { data } = await supabase.auth.getSession(); if (!data.session?.access_token) throw new Error('ログインが必要です。'); return data.session.access_token; }
async function request<T>(path: string, init: RequestInit = {}, storeId?: string): Promise<T> {
  if (!validMobileApiOrigin(baseUrl)) {
    throw new MobileApiError('アプリの接続先設定が正しくありません。', path, 0, 'invalid_base_url');
  }
  const token = await accessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  let body: { error?: string; code?: string } | null;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal, headers: { Authorization: `Bearer ${token}`, ...(storeId ? { 'x-garage-store-id': storeId } : {}), ...(init.headers ?? {}) } });
    body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    if (controller.signal.aborted) throw new Error('timeout');
  } catch {
    throw new MobileApiError('通信を完了できませんでした。', path, 0, controller.signal.aborted ? 'timeout' : 'network_error');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new MobileApiError(body?.error || '通信に失敗しました。', path, response.status, body?.code ?? null);
  }

  if (!body || typeof body !== 'object') throw new MobileApiError('応答を確認できませんでした。', path, 502, 'invalid_response');
  return body as T;
}
export type VehiclesPage = { vehicles: Vehicle[]; nextOffset: number | null };
export type CustomersPage = { customers: Customer[]; nextOffset: number | null };
export type MaintenancePage = { jobs: MaintenanceJob[]; nextOffset: number | null };
export type QuotesPage = { quotes: Quote[]; nextOffset: number | null };
export const mobileApi = {
  async businessSettings(storeId: string) { return request<{ entries: MasterEntry[]; taxDisplayMode: 'included' | 'excluded' }>('/api/mobile/masters', {}, storeId); },
  async maintenanceInline(storeId:string, body:Record<string,unknown>) { return request<{row:V2Record}>('/api/mobile/maintenance/inline',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},storeId); },
  async masters(storeId: string) { return (await request<{ entries: MasterEntry[] }>('/api/mobile/masters', {}, storeId)).entries; },
  vehiclesPage(storeId: string, q = '', offset = 0) { return request<VehiclesPage>(`/api/mobile/vehicles?offset=${offset}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`, {}, storeId); },
  customersPage(storeId: string, q = '', offset = 0) { return request<CustomersPage>(`/api/mobile/customers?offset=${offset}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`, {}, storeId); },
  maintenancePage(storeId: string, offset = 0) { return request<MaintenancePage>(`/api/mobile/maintenance?offset=${offset}&limit=30`, {}, storeId); },
  quotesPage(storeId: string, offset = 0) { return request<QuotesPage>(`/api/mobile/quotes?offset=${offset}&limit=30`, {}, storeId); },
  async stores() { return (await request<{ stores: Store[] }>('/api/mobile/stores')).stores; },
  async selectStore(store: Store) { return (await request<{ store: Store }>('/api/mobile/stores/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: store.tenantId, storeId: store.id }) })).store; },
  async createVehicle(storeId: string, draft: VehicleDraft) { return (await request<{ vehicle: Vehicle }>('/api/mobile/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) }, storeId)).vehicle; },
  async updateVehicle(storeId: string, vehicleId: string, patch: VehicleEdit) { return (await request<{ vehicle: Vehicle }>(`/api/mobile/vehicles/${vehicleId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }, storeId)).vehicle; },
  async vehicles(storeId: string, q = '') { return (await request<{ vehicles: Vehicle[] }>(`/api/mobile/vehicles${q ? `?q=${encodeURIComponent(q)}` : ''}`, {}, storeId)).vehicles; },
  detail(storeId: string, vehicleId: string) { return request<VehicleDetail>(`/api/mobile/vehicles/${vehicleId}`, {}, storeId); },
  async updateStatus(storeId: string, vehicleId: string, status: string) { return (await request<{ vehicle: Vehicle }>(`/api/mobile/vehicles/${vehicleId}/status`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }, storeId)).vehicle; },
  async today(storeId: string) { return request<Today>('/api/mobile/today', {}, storeId); },
  async maintenance(storeId: string) { return (await request<{ jobs: MaintenanceJob[] }>('/api/mobile/maintenance', {}, storeId)).jobs; },
  async maintenanceDetail(storeId: string, jobId: string) { return (await request<{ job: MaintenanceJob }>(`/api/mobile/maintenance/${jobId}`, {}, storeId)).job; },
  async updateMaintenance(storeId: string, jobId: string, status: string, idempotencyKey: string) { return (await request<{ job: MaintenanceJob }>(`/api/mobile/maintenance/${jobId}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey }, body: JSON.stringify({ status }) }, storeId)).job; },
  async customers(storeId: string, q = '') { return (await request<{ customers: Customer[] }>(`/api/mobile/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`, {}, storeId)).customers; },
  customerDetail(storeId: string, customerId: string) { return request<CustomerDetail>(`/api/mobile/customers/${customerId}`, {}, storeId); },
  async quotes(storeId: string) { return (await request<{ quotes: Quote[] }>('/api/mobile/quotes', {}, storeId)).quotes; },
  quotesFor(storeId: string, query: Record<string,string>) { return request<{ quotes: Quote[] }>(`/api/mobile/quotes?${new URLSearchParams(query)}`, {}, storeId); },
  async quoteDetail(storeId: string, quoteId: string) { return (await request<{ quote: Quote }>(`/api/mobile/quotes/${quoteId}`, {}, storeId)).quote; },
  async copyInvoice(storeId:string, body:QuoteDraft & {sourceInvoiceId:string}) { return (await request<{invoice:V2Record}>('/api/mobile/v2/invoices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},storeId)).invoice; },
  async createQuote(storeId: string, idempotencyKey: string, draft: QuoteDraft) { return (await request<{ quote: Quote }>('/api/mobile/quotes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey }, body: JSON.stringify(draft) }, storeId)).quote; },
  async uploadVehicleImage(storeId: string, vehicleId: string, asset: PhotoAsset) { const form = new FormData(); form.append('purpose', 'vehicle_image'); form.append('related_type', 'vehicle'); form.append('related_id', vehicleId); await appendPhotoAsset(form, asset); return request<{ file: { id: string } }>('/api/mobile/storage/upload', { method: 'POST', body: form }, storeId); },
  signedUrl(storeId: string, fileId: string) { return request<{ signedUrl: string }>('/api/mobile/storage/signed-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId }) }, storeId); },
  v2List(storeId: string, resource: V2Resource, query: Record<string, string> = {}) { const params = new URLSearchParams(query); return request<{ rows: V2Record[]; nextOffset: number | null }>(`/api/mobile/v2/${resource}?${params}`, {}, storeId); },
  v2Detail(storeId: string, resource: V2Resource, id: string) { return request<{ row: V2Record }>(`/api/mobile/v2/${resource}/${id}`, {}, storeId); },
  v2Create(storeId: string, resource: V2Resource, draft: V2Record) { return request<{ row: V2Record; replayed: boolean }>(`/api/mobile/v2/${resource}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) }, storeId); },
  v2Update(storeId: string, resource: V2Resource, id: string, patch: Record<string, unknown>) { return request<{ row: V2Record }>(`/api/mobile/v2/${resource}/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }, storeId); },
  v2Inventory(storeId: string, offset = 0, q = '') { return request<{ vehicles: (Record<string, unknown> & { id: string })[]; metrics: Record<string, number> | null; nextOffset: number | null }>(`/api/mobile/v2/inventory?offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {}, storeId); },
  v2PurchaseDetail(storeId:string,id:string) { return request<{vehicle:V2Record}>(`/api/mobile/v2/purchases/${id}`,{},storeId); },
  v2Purchase(storeId: string, draft: PurchaseDraft) { return request<{ vehicle: Record<string, unknown> & { id: string }; replayed: boolean }>('/api/mobile/v2/purchases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) }, storeId); },
  v2PurchaseUpdate(storeId: string, id: string, patch: Record<string, unknown>) { return request<{ vehicle: Record<string, unknown> & { id: string } }>(`/api/mobile/v2/purchases/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }, storeId); },
  v2Invoices(storeId: string, query: Record<string, string> = {}) { return request<{ invoices: V2Record[] }>(`/api/mobile/v2/invoices?${new URLSearchParams(query)}`, {}, storeId); },
  v2InvoiceDetail(storeId: string, id: string) { return request<{ invoice: V2Record; items: Record<string, unknown>[] }>(`/api/mobile/v2/invoices/${id}`, {}, storeId); },
  v2InvoiceFromQuote(storeId: string, id: string, quoteId: string, dueDate?: string) { return request<{ invoice: V2Record; replayed: boolean }>('/api/mobile/v2/invoices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, quoteId, dueDate }) }, storeId); },
  v2IssueInvoice(storeId: string, id: string, idempotencyKey: string) { return request<{ ok: boolean; code: string }>(`/api/mobile/v2/invoices/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey }) }, storeId); },
  v2Sale(storeId: string, dealId: string, salePrice: number, idempotencyKey: string) { return request<{ ok: boolean; code: string }>(`/api/mobile/v2/sales/${dealId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ salePrice, idempotencyKey }) }, storeId); },
  v2Delivery(storeId: string, dealId: string, idempotencyKey: string) { return request<{ ok: boolean; code: string }>(`/api/mobile/v2/sales/${dealId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey }) }, storeId); },
  v2CancelSale(storeId: string, dealId: string, reason: string, idempotencyKey: string) { return request<{ ok: boolean; code: string }>(`/api/mobile/v2/sales/${dealId}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason, idempotencyKey }) }, storeId); },
  v2Payment(storeId: string, invoiceId: string, amount: number, paymentMethod: string, idempotencyKey: string) { return request<{ invoice: V2Record }>(`/api/mobile/v2/payments/${invoiceId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount, paymentMethod, idempotencyKey }) }, storeId); },
  async uploadCategorizedPhoto(storeId: string, relatedType: 'vehicle' | 'maintenance_job' | 'trade_in_vehicle', relatedId: string, photoCategory: string, asset: PhotoAsset) {
    const form = new FormData();
    form.append('purpose', 'vehicle_image'); form.append('related_type', relatedType); form.append('related_id', relatedId); form.append('photo_category', photoCategory);
    await appendPhotoAsset(form, asset);
    return request<{ file: { id: string } }>('/api/mobile/storage/upload', { method: 'POST', body: form }, storeId);
  },
  v2Photos(storeId: string, relatedType: 'vehicle' | 'maintenance_job' | 'trade_in_vehicle', relatedId: string) { return request<{ photos: { id: string; photo_category: string | null; created_at: string }[] }>(`/api/mobile/v2/photos?relatedType=${relatedType}&relatedId=${relatedId}`, {}, storeId); },
};
