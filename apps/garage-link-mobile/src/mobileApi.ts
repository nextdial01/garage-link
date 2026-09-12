import { supabase } from './supabase';
import { getTrustedDeviceToken, saveTrustedDeviceToken } from './trustedDevice';

const baseUrl = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '');
export type Store = { id: string; tenantId: string; name: string; role: 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer' };
export type Vehicle = { id: string; managementNo: string | null; maker: string | null; modelName: string | null; grade: string | null; registrationNo: string | null; mileageKm: number | null; color: string | null; totalPrice: number | null; status: string | null; locationName: string | null; description: string | null };
export type VehicleDetail = { vehicle: Vehicle; imageFiles: { id: string; mime_type: string; created_at: string }[] };
export type TodayItem = { id: string; job_no?: string | null; job_type?: string | null; appointment_type?: string | null; status?: string | null; scheduled_at?: string | null; scheduled_in_at?: string | null; scheduled_delivery_at?: string | null; assigned_user_name?: string | null; customerName?: string | null; vehicleLabel?: string | null };
export type Today = { appointments: TodayItem[]; deliveries: TodayItem[]; incompleteWork: TodayItem[]; assignedWork: TodayItem[] };
export type MaintenanceJob = { id: string; job_no: string | null; job_type: string | null; status: string | null; scheduled_in_at: string | null; scheduled_delivery_at: string | null; assigned_user_name: string | null; estimated_total_amount: number | null; customerName?: string | null; vehicleLabel?: string | null };
export type Customer = { id: string; name: string | null; kana: string | null; phone: string | null; mobile_phone: string | null; email: string | null; address: string | null; customer_status: string | null; assigned_user_name: string | null; next_action_date: string | null; updated_at: string | null };
export type QuoteItem = { id?: string; itemOrder?: number; itemType: string; name: string; description?: string | null; quantity: number; unitPrice: number; taxRate?: number; taxAmount?: number; amount?: number };
export type Quote = { id: string; quoteNo: string | null; title: string | null; status: string | null; issueDate: string | null; expiryDate: string | null; customerId: string | null; vehicleId: string | null; customerName: string | null; customerPhone: string | null; customerEmail: string | null; customerAddress: string | null; customerHonorific: string | null; vehicleLabel: string | null; subtotalAmount: number | null; taxAmount: number | null; discountAmount: number | null; tradeInAmount: number | null; totalAmount: number | null; customerNote: string | null; updatedAt: string | null; items: QuoteItem[] };
export type CustomerDetail = { customer: Customer; vehicles: Vehicle[]; maintenance: MaintenanceJob[]; deals: { id: string; deal_no: string | null; title: string | null; status: string | null; vehicle_id: string | null; next_action_at: string | null }[]; quotes: Quote[] };
export type QuoteDraft = { title?: string; customerId?: string; vehicleId?: string; dealId?: string; issueDate?: string; expiryDate?: string; customerHonorific?: string; customerNote?: string; items: Pick<QuoteItem, 'itemType' | 'name' | 'description' | 'quantity' | 'unitPrice' | 'taxRate'>[] };

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
  if (!baseUrl || !/^https:\/\//.test(baseUrl) || /localhost|127\.0\.0\.1/.test(baseUrl)) {
    throw new MobileApiError('アプリの接続先設定が正しくありません。', path, 0, 'invalid_base_url');
  }
  const [token, trustedDeviceToken] = await Promise.all([accessToken(), getTrustedDeviceToken()]);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  let body: { error?: string; code?: string } | null;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal, headers: { Authorization: `Bearer ${token}`, ...(storeId ? { 'x-garage-store-id': storeId } : {}), ...(trustedDeviceToken ? { 'x-garage-trusted-device-token': trustedDeviceToken } : {}), ...(init.headers ?? {}) } });
    body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    if (controller.signal.aborted) throw new Error('timeout');
  } catch {
    throw new MobileApiError('通信を完了できませんでした。', path, 0, controller.signal.aborted ? 'timeout' : 'network_error');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new MobileApiError(body?.error || '通信に失敗しました。', path, response.status, body?.code ?? null);

  if (!body || typeof body !== 'object') throw new MobileApiError('応答を確認できませんでした。', path, 502, 'invalid_response');
  return body as T;
}
export type VehiclesPage = { vehicles: Vehicle[]; nextOffset: number | null };
export type CustomersPage = { customers: Customer[]; nextOffset: number | null };
export type MaintenancePage = { jobs: MaintenanceJob[]; nextOffset: number | null };
export type QuotesPage = { quotes: Quote[]; nextOffset: number | null };
export const mobileApi = {
  vehiclesPage(storeId: string, q = '', offset = 0) { return request<VehiclesPage>(`/api/mobile/vehicles?offset=${offset}&limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`, {}, storeId); },
  customersPage(storeId: string, q = '', offset = 0) { return request<CustomersPage>(`/api/mobile/customers?offset=${offset}&limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`, {}, storeId); },
  maintenancePage(storeId: string, offset = 0) { return request<MaintenancePage>(`/api/mobile/maintenance?offset=${offset}&limit=100`, {}, storeId); },
  quotesPage(storeId: string, offset = 0) { return request<QuotesPage>(`/api/mobile/quotes?offset=${offset}&limit=100`, {}, storeId); },
  async stores() { return (await request<{ stores: Store[] }>('/api/mobile/stores')).stores; },
  async selectStore(store: Store) { return (await request<{ store: Store }>('/api/mobile/stores/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: store.tenantId, storeId: store.id }) })).store; },
  requestAdminEmailOtp() { return request<{ ok: true; maskedEmail: string; retryAfter: number }>('/api/mobile/admin-email-otp/request', { method: 'POST' }); },
  async verifyAdminEmailOtp(code: string) {
    const result = await request<{ ok: true; trustedDeviceToken: string }>('/api/mobile/admin-email-otp/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    if (!/^[0-9a-f]{64}$/i.test(result.trustedDeviceToken)) throw new MobileApiError('端末の信頼状態を保存できませんでした。', '/api/mobile/admin-email-otp/verify', 502, 'invalid_trusted_device');
    await saveTrustedDeviceToken(result.trustedDeviceToken);
    return result;
  },
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
  async quoteDetail(storeId: string, quoteId: string) { return (await request<{ quote: Quote }>(`/api/mobile/quotes/${quoteId}`, {}, storeId)).quote; },
  async createQuote(storeId: string, idempotencyKey: string, draft: QuoteDraft) { return (await request<{ quote: Quote }>('/api/mobile/quotes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey }, body: JSON.stringify(draft) }, storeId)).quote; },
  async uploadVehicleImage(storeId: string, vehicleId: string, asset: { uri: string; fileName?: string | null; mimeType?: string | null }) { const form = new FormData(); form.append('purpose', 'vehicle_image'); form.append('related_type', 'vehicle'); form.append('related_id', vehicleId); form.append('file', { uri: asset.uri, name: asset.fileName || `vehicle-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob); return request<{ file: { id: string } }>('/api/mobile/storage/upload', { method: 'POST', body: form }, storeId); },
  signedUrl(storeId: string, fileId: string) { return request<{ signedUrl: string }>('/api/mobile/storage/signed-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId }) }, storeId); },
};
