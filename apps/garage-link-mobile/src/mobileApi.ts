import { supabase } from './supabase';
import { getTrustedDeviceToken, saveTrustedDeviceToken, TrustedDeviceStorageError } from './trustedDevice';

const baseUrl = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '');
export type Store = { id: string; tenantId: string; name: string; role: 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer' };
export type Vehicle = { id: string; managementNo: string | null; maker: string | null; modelName: string | null; grade: string | null; registrationNo: string | null; mileageKm: number | null; color: string | null; totalPrice: number | null; status: string | null; locationName: string | null; description: string | null };
export type VehicleDraft = { managementNo?: string; vin: string; maker: string; modelName: string; registrationNo?: string; mileageKm?: number; color?: string; locationName?: string; status?: '在庫中' | '展示中' | '商談中' | '整備中'; description?: string };
export type VehicleEdit = { managementNo?: string | null; maker?: string | null; modelName?: string | null; grade?: string | null; registrationNo?: string | null; mileageKm?: number | null; color?: string | null; locationName?: string | null; description?: string | null };


export type VehicleDetail = { vehicle: Vehicle; imageFiles: { id: string; mime_type: string; created_at: string }[] };
export type TodayItem = { id: string; job_no?: string | null; job_type?: string | null; appointment_type?: string | null; status?: string | null; scheduled_at?: string | null; scheduled_in_at?: string | null; scheduled_delivery_at?: string | null; assigned_user_name?: string | null; customerName?: string | null; vehicleLabel?: string | null };
export type Today = { appointments: TodayItem[]; deliveries: TodayItem[]; incompleteWork: TodayItem[]; assignedWork: TodayItem[] };
export type MaintenanceJob = { id: string; customer_id?: string | null; vehicle_id?: string | null; job_no: string | null; job_type: string | null; status: string | null; scheduled_in_at: string | null; scheduled_delivery_at: string | null; assigned_user_name: string | null; estimated_total_amount: number | null; customerName?: string | null; vehicleLabel?: string | null };
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

function trustedDeviceErrorMessage(code: string) {
  if (code === 'trusted_device_read_failed') return '端末の本人確認情報を読み込めませんでした。再試行してください。';
  if (code === 'trusted_device_clear_failed') return '端末の本人確認情報を削除できませんでした。ログアウトを完了していません。';
  return '端末の本人確認を保存できませんでした。新しい確認コードを送信してやり直してください。';
}

async function accessToken() { const { data } = await supabase.auth.getSession(); if (!data.session?.access_token) throw new Error('ログインが必要です。'); return data.session.access_token; }
async function request<T>(path: string, init: RequestInit = {}, storeId?: string, allowTrustedDeviceReadFailure = false): Promise<T> {
  if (!baseUrl || !/^https:\/\//.test(baseUrl) || /localhost|127\.0\.0\.1/.test(baseUrl)) {
    throw new MobileApiError('アプリの接続先設定が正しくありません。', path, 0, 'invalid_base_url');
  }
  let trustedDeviceReadFailure: string | null = null;
  const trustedDeviceTokenPromise = getTrustedDeviceToken().catch((error: unknown) => {
    const code = error instanceof TrustedDeviceStorageError ? error.code : 'trusted_device_read_failed';
    if (allowTrustedDeviceReadFailure) {
      trustedDeviceReadFailure = code;
      return null;
    }
    throw new MobileApiError(trustedDeviceErrorMessage(code), path, 0, code);
  });
  const [token, trustedDeviceToken] = await Promise.all([accessToken(), trustedDeviceTokenPromise]);
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
  if (!response.ok) {
    const trustCode = body?.error === 'admin_security_required'
      ? trustedDeviceReadFailure ?? (trustedDeviceToken ? 'trusted_device_rejected' : 'trusted_device_header_missing')
      : null;
    throw new MobileApiError(body?.error || '通信に失敗しました。', path, response.status, body?.code ?? trustCode);
  }

  if (!body || typeof body !== 'object') throw new MobileApiError('応答を確認できませんでした。', path, 502, 'invalid_response');
  return body as T;
}
export type VehiclesPage = { vehicles: Vehicle[]; nextOffset: number | null };
export type CustomersPage = { customers: Customer[]; nextOffset: number | null };
export type MaintenancePage = { jobs: MaintenanceJob[]; nextOffset: number | null };
export type QuotesPage = { quotes: Quote[]; nextOffset: number | null };
export const mobileApi = {
  vehiclesPage(storeId: string, q = '', offset = 0) { return request<VehiclesPage>(`/api/mobile/vehicles?offset=${offset}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`, {}, storeId); },
  customersPage(storeId: string, q = '', offset = 0) { return request<CustomersPage>(`/api/mobile/customers?offset=${offset}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`, {}, storeId); },
  maintenancePage(storeId: string, offset = 0) { return request<MaintenancePage>(`/api/mobile/maintenance?offset=${offset}&limit=30`, {}, storeId); },
  quotesPage(storeId: string, offset = 0) { return request<QuotesPage>(`/api/mobile/quotes?offset=${offset}&limit=30`, {}, storeId); },
  async stores() { return (await request<{ stores: Store[] }>('/api/mobile/stores')).stores; },
  async selectStore(store: Store) { return (await request<{ store: Store }>('/api/mobile/stores/active', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: store.tenantId, storeId: store.id }) })).store; },
  requestAdminEmailOtp() { return request<{ ok: true; maskedEmail: string; retryAfter: number }>('/api/mobile/admin-email-otp/request', { method: 'POST' }, undefined, true); },
  async verifyAdminEmailOtp(code: string) {
    const endpoint = '/api/mobile/admin-email-otp/verify';
    const result = await request<{ ok: true; trustedDeviceToken: string }>(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }, undefined, true);
    if (!/^[0-9a-f]{64}$/i.test(result.trustedDeviceToken)) throw new MobileApiError(trustedDeviceErrorMessage('trusted_device_token_invalid'), endpoint, 502, 'trusted_device_token_invalid');
    try {
      await saveTrustedDeviceToken(result.trustedDeviceToken);
    } catch (error) {
      const code = error instanceof TrustedDeviceStorageError ? error.code : 'trusted_device_save_failed';
      throw new MobileApiError(trustedDeviceErrorMessage(code), endpoint, 0, code);
    }
    // The bearer must not escape the persistence boundary to UI callers.
    return { ok: true as const };
  },
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
  async quoteDetail(storeId: string, quoteId: string) { return (await request<{ quote: Quote }>(`/api/mobile/quotes/${quoteId}`, {}, storeId)).quote; },
  async createQuote(storeId: string, idempotencyKey: string, draft: QuoteDraft) { return (await request<{ quote: Quote }>('/api/mobile/quotes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey }, body: JSON.stringify(draft) }, storeId)).quote; },
  async uploadVehicleImage(storeId: string, vehicleId: string, asset: { uri: string; fileName?: string | null; mimeType?: string | null }) { const form = new FormData(); form.append('purpose', 'vehicle_image'); form.append('related_type', 'vehicle'); form.append('related_id', vehicleId); form.append('file', { uri: asset.uri, name: asset.fileName || `vehicle-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob); return request<{ file: { id: string } }>('/api/mobile/storage/upload', { method: 'POST', body: form }, storeId); },
  signedUrl(storeId: string, fileId: string) { return request<{ signedUrl: string }>('/api/mobile/storage/signed-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId }) }, storeId); },
};
