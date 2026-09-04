import { supabase } from './supabase';

const baseUrl = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '');
export type Store = { id: string; tenantId: string; name: string; role: 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer' };
export type Vehicle = { id: string; managementNo: string | null; maker: string | null; modelName: string | null; grade: string | null; registrationNo: string | null; mileageKm: number | null; color: string | null; totalPrice: number | null; status: string | null; locationName: string | null; description: string | null };
export type VehicleDetail = { vehicle: Vehicle; imageFiles: Array<{ id: string; mime_type: string; created_at: string }> };
export type TodayItem = { id: string; job_no?: string | null; job_type?: string | null; appointment_type?: string | null; status?: string | null; scheduled_at?: string | null; scheduled_in_at?: string | null; scheduled_delivery_at?: string | null; assigned_user_name?: string | null };
export type Today = { appointments: TodayItem[]; deliveries: TodayItem[]; incompleteWork: TodayItem[]; assignedWork: TodayItem[] };
export type MaintenanceJob = { id: string; job_no: string | null; job_type: string | null; status: string | null; scheduled_in_at: string | null; scheduled_delivery_at: string | null; assigned_user_name: string | null; estimated_total_amount: number | null };
export type Customer = { id: string; name: string | null; kana: string | null; phone: string | null; mobile_phone: string | null; email: string | null; address: string | null; customer_status: string | null; assigned_user_name: string | null; next_action_date: string | null; updated_at: string | null };
export type QuoteItem = { id?: string; itemOrder?: number; itemType: string; name: string; description?: string | null; quantity: number; unitPrice: number; taxRate?: number; taxAmount?: number; amount?: number };
export type Quote = { id: string; quoteNo: string | null; title: string | null; status: string | null; issueDate: string | null; expiryDate: string | null; customerId: string | null; vehicleId: string | null; customerName: string | null; customerPhone: string | null; customerEmail: string | null; customerAddress: string | null; customerHonorific: string | null; vehicleLabel: string | null; subtotalAmount: number | null; taxAmount: number | null; discountAmount: number | null; tradeInAmount: number | null; totalAmount: number | null; customerNote: string | null; updatedAt: string | null; items: QuoteItem[] };
export type CustomerDetail = { customer: Customer; vehicles: Vehicle[]; maintenance: MaintenanceJob[]; deals: Array<{ id: string; deal_no: string | null; title: string | null; status: string | null; vehicle_id: string | null; next_action_at: string | null }>; quotes: Quote[] };
export type QuoteDraft = { title?: string; customerId?: string; vehicleId?: string; dealId?: string; issueDate?: string; expiryDate?: string; customerHonorific?: string; customerNote?: string; items: Array<Pick<QuoteItem, 'itemType' | 'name' | 'description' | 'quantity' | 'unitPrice' | 'taxRate'>> };

async function accessToken() { const { data } = await supabase.auth.getSession(); if (!data.session?.access_token) throw new Error('ログインが必要です。'); return data.session.access_token; }
async function request<T>(path: string, init: RequestInit = {}, storeId?: string): Promise<T> {
  if (!baseUrl) throw new Error('EXPO_PUBLIC_APP_BASE_URL をproduction環境に設定してください。');
  const token = await accessToken();
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(storeId ? { 'x-garage-store-id': storeId } : {}), ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || '通信に失敗しました。');
  return body as T;
}
export const mobileApi = {
  async stores() { return (await request<{ stores: Store[] }>('/api/mobile/stores')).stores; },
  async vehicles(storeId: string, q = '') { return (await request<{ vehicles: Vehicle[] }>(`/api/mobile/vehicles${q ? `?q=${encodeURIComponent(q)}` : ''}`, {}, storeId)).vehicles; },
  detail(storeId: string, vehicleId: string) { return request<VehicleDetail>(`/api/mobile/vehicles/${vehicleId}`, {}, storeId); },
  async updateStatus(storeId: string, vehicleId: string, status: string) { return (await request<{ vehicle: Vehicle }>(`/api/mobile/vehicles/${vehicleId}/status`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }, storeId)).vehicle; },
  async today(storeId: string) { return request<Today>('/api/mobile/today', {}, storeId); },
  async maintenance(storeId: string) { return (await request<{ jobs: MaintenanceJob[] }>('/api/mobile/maintenance', {}, storeId)).jobs; },
  async maintenanceDetail(storeId: string, jobId: string) { return (await request<{ job: MaintenanceJob }>(`/api/mobile/maintenance/${jobId}`, {}, storeId)).job; },
  async updateMaintenance(storeId: string, jobId: string, status: string) { return (await request<{ job: MaintenanceJob }>(`/api/mobile/maintenance/${jobId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }, storeId)).job; },
  async customers(storeId: string, q = '') { return (await request<{ customers: Customer[] }>(`/api/mobile/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`, {}, storeId)).customers; },
  customerDetail(storeId: string, customerId: string) { return request<CustomerDetail>(`/api/mobile/customers/${customerId}`, {}, storeId); },
  async quotes(storeId: string) { return (await request<{ quotes: Quote[] }>('/api/mobile/quotes', {}, storeId)).quotes; },
  async quoteDetail(storeId: string, quoteId: string) { return (await request<{ quote: Quote }>(`/api/mobile/quotes/${quoteId}`, {}, storeId)).quote; },
  async createQuote(storeId: string, idempotencyKey: string, draft: QuoteDraft) { return (await request<{ quote: Quote }>('/api/mobile/quotes', { method: 'POST', headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey }, body: JSON.stringify(draft) }, storeId)).quote; },
  async uploadVehicleImage(storeId: string, vehicleId: string, asset: { uri: string; fileName?: string | null; mimeType?: string | null }) { const form = new FormData(); form.append('purpose', 'vehicle_image'); form.append('related_type', 'vehicle'); form.append('related_id', vehicleId); form.append('file', { uri: asset.uri, name: asset.fileName || `vehicle-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob); return request<{ file: { id: string } }>('/api/storage/upload', { method: 'POST', body: form }, storeId); },
  signedUrl(storeId: string, fileId: string) { return request<{ signedUrl: string }>('/api/storage/signed-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileId }) }, storeId); },
};
