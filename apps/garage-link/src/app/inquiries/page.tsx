'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ContextHelp from '@/components/ContextHelp';
import ResponsiveDetailPanel from '@/components/ResponsiveDetailPanel';
import { getGarageUiContext } from '@/lib/store/garageUiContext';
import { createClient } from '@/lib/supabase/client';

type Inquiry = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  deal_id: string | null;
  answers: Record<string, unknown>;
  submitted_at: string | null;
  source_route: string | null;
  internal_memo: string | null;
  response_status: 'unhandled' | 'in_progress' | 'completed';
  assigned_user_name: string | null;
  next_action_at: string | null;
  updated_at?: string | null;
};
type Customer = { id: string; name: string | null };
type Vehicle = { id: string; maker: string | null; model_name: string | null; management_no: string | null };
type Deal = { id: string; title: string | null; deal_no: string | null };

const inputClass = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
function vehicleLabel(vehicle: Vehicle | undefined) { return vehicle ? `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || vehicle.management_no || '未設定' : '未設定'; }
function answerLabel(answers: Record<string, unknown>) {
  const preferredKeys = ['問い合わせ内容', '相談内容', 'お問い合わせ内容', '内容', 'message', 'inquiry', 'question'];
  for (const key of preferredKeys) {
    const preferredValue = answers[key];
    if (typeof preferredValue === 'string' && preferredValue.trim()) return preferredValue.trim().slice(0, 80);
  }
  const value = Object.values(answers).find((item) => typeof item === 'string' && item.trim());
  return value ? String(value).slice(0, 80) : '回答内容を確認';
}
function responseStatusLabel(status: Inquiry['response_status']) {
  return status === 'completed' ? '完了' : status === 'in_progress' ? '対応中' : '未対応';
}
function responseStatusClass(status: Inquiry['response_status']) {
  return status === 'completed' ? 'bg-emerald-50 text-emerald-700' : status === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800';
}
function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function InquiriesPage() {
  const [storeId, setStoreId] = useState('');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [editingStatus, setEditingStatus] = useState<Inquiry['response_status']>('unhandled');
  const [editingAssignee, setEditingAssignee] = useState('');
  const [editingNextActionAt, setEditingNextActionAt] = useState('');
  const [isSavingResponse, setIsSavingResponse] = useState(false);

  async function load() {
    try {
      const supabase = createClient();
      const context = await getGarageUiContext();
      if (!context.storeId) throw new Error('所属店舗が見つかりません。');
      setStoreId(context.storeId);
      const [inquiryResult, customerResult, vehicleResult, dealResult] = await Promise.all([
        supabase.from<Inquiry>('line_form_responses').select('id, customer_id, vehicle_id, deal_id, answers, submitted_at, source_route, internal_memo, response_status, assigned_user_name, next_action_at, updated_at').eq('store_id', context.storeId).order('submitted_at', { ascending: false }),
        supabase.from<Customer>('customers').select('id, name').eq('store_id', context.storeId),
        supabase.from<Vehicle>('vehicles').select('id, maker, model_name, management_no').eq('store_id', context.storeId),
        supabase.from<Deal>('deals').select('id, title, deal_no').eq('store_id', context.storeId),
      ]);
      if (inquiryResult.error) throw new Error('問い合わせを取得できませんでした。');
      setInquiries(inquiryResult.data ?? []);
      setCustomers(customerResult.data ?? []);
      setVehicles(vehicleResult.data ?? []);
      setDeals(dealResult.data ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '問い合わせの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const stats = useMemo(() => {
    const unhandled = inquiries.filter((item) => item.response_status === 'unhandled').length;
    const inProgress = inquiries.filter((item) => item.response_status === 'in_progress').length;
    const completed = inquiries.filter((item) => item.response_status === 'completed').length;
    const overdue = inquiries.filter((item) => item.response_status !== 'completed' && item.next_action_at && item.next_action_at < new Date().toISOString()).length;
    return [
      { label: '未対応', value: unhandled, detail: 'まだ対応を開始していない' },
      { label: '対応中', value: inProgress, detail: '担当者が対応中' },
      { label: '完了', value: completed, detail: `全${inquiries.length}件` },
      { label: '次回対応超過', value: overdue, detail: '予定日時を超えた未完了' },
    ];
  }, [inquiries]);
  const selectedInquiry = useMemo(() => inquiries.find((item) => item.id === selectedInquiryId) ?? null, [inquiries, selectedInquiryId]);

  function openInquiryDetail(inquiry: Inquiry) {
    setSelectedInquiryId(inquiry.id);
    setEditingStatus(inquiry.response_status);
    setEditingAssignee(inquiry.assigned_user_name ?? '');
    setEditingNextActionAt(toDateTimeLocal(inquiry.next_action_at));
    setConflictMessage('');
    setPendingRefresh(false);
  }

  async function applyRefresh() {
    await load();
    setSelectedInquiryId(null);
    setPendingRefresh(false);
    setConflictMessage('');
  }

  async function updateLink(target: Inquiry, field: 'customer_id' | 'vehicle_id' | 'deal_id', value: string) {
    const next = value || null;
    const supabase = createClient();
    const { data, error } = await supabase.from<Inquiry>('line_form_responses').update({ [field]: next }).eq('id', target.id).eq('store_id', storeId).eq('updated_at', target.updated_at ?? '').select('id, customer_id, vehicle_id, deal_id, answers, submitted_at, source_route, internal_memo, response_status, assigned_user_name, next_action_at, updated_at').maybeSingle();
    if (error) {
      setErrorMessage('紐付けを保存できませんでした。');
      return;
    }
    if (!data) {
      setConflictMessage('ほかの更新が入ったため保存できませんでした。最新データを反映してください。');
      setPendingRefresh(true);
      return;
    }
    setInquiries((items) => items.map((item) => item.id === target.id ? data : item));
    setConflictMessage('');
    setPendingRefresh(false);
  }

  async function saveResponseManagement(target: Inquiry) {
    setIsSavingResponse(true);
    setErrorMessage('');
    try {
      const nextActionAt = editingNextActionAt ? new Date(editingNextActionAt).toISOString() : null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from<Inquiry>('line_form_responses')
        .update({ response_status: editingStatus, assigned_user_name: editingAssignee.trim() || null, next_action_at: nextActionAt })
        .eq('id', target.id)
        .eq('store_id', storeId)
        .eq('updated_at', target.updated_at ?? '')
        .select('id, customer_id, vehicle_id, deal_id, answers, submitted_at, source_route, internal_memo, response_status, assigned_user_name, next_action_at, updated_at')
        .maybeSingle();
      if (error) throw new Error('対応状況を保存できませんでした。');
      if (!data) {
        setConflictMessage('ほかの更新が入ったため保存できませんでした。最新データを反映してください。');
        setPendingRefresh(true);
        return;
      }
      setInquiries((items) => items.map((item) => item.id === target.id ? data : item));
      setConflictMessage('');
      setPendingRefresh(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '対応状況を保存できませんでした。');
    } finally {
      setIsSavingResponse(false);
    }
  }

  return (
    <AppShell activeLabel="問い合わせ" title="問い合わせ" description="L-LINK経由の問い合わせを担当・次回対応・顧客情報と一緒に管理できます。">
      <div className="mb-6 grid gap-4 md:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{stat.label}</p><p className="mt-3 text-3xl font-black text-slate-950">{stat.value}</p><p className="mt-2 text-xs font-semibold text-slate-400">{stat.detail}</p></div>)}</div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><h2 className="text-base font-black">問い合わせ一覧</h2><ContextHelp title="問い合わせ一覧" description="顧客・車両・商談を紐付けると、それぞれの詳細履歴から問い合わせを追えます。" /></div></div>
          {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</p>}
          {isLoading ? <p className="p-5 text-sm text-slate-500">読み込み中...</p> : inquiries.length === 0 ? <p className="p-5 text-sm font-bold text-slate-500">問い合わせはありません。</p> : (
            <div className="divide-y divide-slate-100">
              {inquiries.map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <button type="button" onClick={() => openInquiryDetail(item)} className="min-w-0 text-left">
                      <p className="text-sm font-black text-slate-950">{item.submitted_at ? new Date(item.submitted_at).toLocaleString('ja-JP') : '-'}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{answerLabel(item.answers)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2.5 py-1 font-bold ${responseStatusClass(item.response_status)}`}>{responseStatusLabel(item.response_status)}</span>
                        <span className="text-slate-500">担当: {item.assigned_user_name ?? '未設定'}</span>
                        {item.next_action_at && <span className="text-slate-500">次回: {new Date(item.next_action_at).toLocaleString('ja-JP')}</span>}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">流入元: {item.source_route ?? '-'}</p>
                    </button>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select aria-label={`${item.id}の顧客`} className={inputClass} value={item.customer_id ?? ''} onChange={(event) => void updateLink(item, 'customer_id', event.target.value)}><option value="">顧客未設定</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name ?? '顧客'}</option>)}</select>
                      <select aria-label={`${item.id}の車両`} className={inputClass} value={item.vehicle_id ?? ''} onChange={(event) => void updateLink(item, 'vehicle_id', event.target.value)}><option value="">車両未設定</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select>
                      <select aria-label={`${item.id}の商談`} className={inputClass} value={item.deal_id ?? ''} onChange={(event) => void updateLink(item, 'deal_id', event.target.value)}><option value="">商談未設定</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title ?? deal.deal_no ?? '商談'}</option>)}</select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ResponsiveDetailPanel open={Boolean(selectedInquiry)} title="問い合わせ概要" subtitle={selectedInquiry?.submitted_at ? new Date(selectedInquiry.submitted_at).toLocaleString('ja-JP') : undefined} onClose={() => { setSelectedInquiryId(null); setConflictMessage(''); setPendingRefresh(false); }}>
          {selectedInquiry && (
            <div className="space-y-5">
              {pendingRefresh && <button type="button" onClick={() => void applyRefresh()} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">新しい更新があります。反映する</button>}
              {conflictMessage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{conflictMessage}</p>}
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-400">受付内容</p><p className="mt-2 text-sm font-bold leading-6 text-slate-900">{answerLabel(selectedInquiry.answers)}</p></div>
              <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <div><p className="text-sm font-black text-slate-900">対応管理</p><p className="mt-1 text-xs text-slate-500">状態・担当・次回対応をまとめて保存します。</p></div>
                <label className="block space-y-1 text-xs font-bold text-slate-600">対応状況<select aria-label="選択中の問い合わせの対応状況" className={`${inputClass} w-full`} value={editingStatus} onChange={(event) => setEditingStatus(event.target.value as Inquiry['response_status'])}><option value="unhandled">未対応</option><option value="in_progress">対応中</option><option value="completed">完了</option></select></label>
                <label className="block space-y-1 text-xs font-bold text-slate-600">担当者<input aria-label="選択中の問い合わせの担当者" className={`${inputClass} w-full`} value={editingAssignee} onChange={(event) => setEditingAssignee(event.target.value)} placeholder="例: 田中" /></label>
                <label className="block space-y-1 text-xs font-bold text-slate-600">次回対応日時<input aria-label="選択中の問い合わせの次回対応日時" type="datetime-local" className={`${inputClass} w-full`} value={editingNextActionAt} onInput={(event) => setEditingNextActionAt(event.currentTarget.value)} /></label>
                <button type="button" onClick={() => void saveResponseManagement(selectedInquiry)} disabled={isSavingResponse} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSavingResponse ? '保存中...' : '対応状況を保存'}</button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">紐付け</p>
                <label className="block space-y-1 text-xs font-bold text-slate-600">顧客<select aria-label="選択中の問い合わせの顧客" className={`${inputClass} w-full`} value={selectedInquiry.customer_id ?? ''} onChange={(event) => void updateLink(selectedInquiry, 'customer_id', event.target.value)}><option value="">顧客未設定</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name ?? '顧客'}</option>)}</select></label>
                <label className="block space-y-1 text-xs font-bold text-slate-600">車両<select aria-label="選択中の問い合わせの車両" className={`${inputClass} w-full`} value={selectedInquiry.vehicle_id ?? ''} onChange={(event) => void updateLink(selectedInquiry, 'vehicle_id', event.target.value)}><option value="">車両未設定</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
                <label className="block space-y-1 text-xs font-bold text-slate-600">商談<select aria-label="選択中の問い合わせの商談" className={`${inputClass} w-full`} value={selectedInquiry.deal_id ?? ''} onChange={(event) => void updateLink(selectedInquiry, 'deal_id', event.target.value)}><option value="">商談未設定</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title ?? deal.deal_no ?? '商談'}</option>)}</select></label>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">流入元</dt><dd className="font-bold text-slate-900">{selectedInquiry.source_route ?? '-'}</dd></div>
              </dl>
              <div className="space-y-2">
                {selectedInquiry.customer_id && <Link className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700" href={`/customers/${selectedInquiry.customer_id}`}>顧客詳細を開く</Link>}
                {selectedInquiry.vehicle_id && <Link className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700" href={`/vehicles/${selectedInquiry.vehicle_id}`}>車両詳細を開く</Link>}
                {selectedInquiry.deal_id && <Link className="block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white" href={`/deals/${selectedInquiry.deal_id}`}>商談詳細を開く</Link>}
              </div>
            </div>
          )}
        </ResponsiveDetailPanel>
      </div>
    </AppShell>
  );
}
