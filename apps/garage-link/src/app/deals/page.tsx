'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ResponsiveDetailPanel from '@/components/ResponsiveDetailPanel';
import { getGarageUiContext } from '@/lib/store/garageUiContext';
import { createClient } from '@/lib/supabase/client';

type DealRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  deal_no: string | null;
  title: string | null;
  deal_type: string | null;
  status: string | null;
  probability: string | null;
  next_action_at: string | null;
  assigned_user_name: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};
type CustomerRow = { id: string; name: string | null; deleted_at?: string | null; is_archived?: boolean | null };
type VehicleRow = { id: string; maker: string | null; model_name: string | null; management_no: string | null; deleted_at?: string | null; is_archived?: boolean | null };

const statusOptions = ['新規', '連絡済み', '見積済み', '来店予定', '商談中', '成約', '失注'];

function getStatusClass(status: string) {
  switch (status) {
    case '新規': return 'bg-slate-50 text-slate-700 ring-slate-600/20';
    case '連絡済み':
    case '見積済み': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case '来店予定':
    case '商談中': return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '成約': return 'bg-green-50 text-green-700 ring-green-600/20';
    case '失注': return 'bg-red-50 text-red-700 ring-red-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}
function formatDateTime(value: string | null) { return value ? value.replace('T', ' ').slice(0, 16) : '-'; }
function formatDateInput(value: string | null) { return value ? value.slice(0, 16) : ''; }
function vehicleLabel(vehicle: VehicleRow | undefined) {
  if (!vehicle) return '-';
  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '-';
}

export default function DealsPage() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'today' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState('');
  const [editingNextActionAt, setEditingNextActionAt] = useState('');
  const [isSavingPanel, setIsSavingPanel] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  async function loadDeals() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const supabase = createClient();
      const context = await getGarageUiContext();
      if (!context.storeId) throw new Error('所属店舗が見つかりません。');
      const [dealResult, customerResult, vehicleResult] = await Promise.all([
        supabase.from<DealRow>('deals').select('id, customer_id, vehicle_id, deal_no, title, deal_type, status, probability, next_action_at, assigned_user_name, updated_at, deleted_at, is_archived').eq('store_id', context.storeId).order('created_at', { ascending: false }),
        supabase.from<CustomerRow>('customers').select('id, name, deleted_at, is_archived').eq('store_id', context.storeId),
        supabase.from<VehicleRow>('vehicles').select('id, maker, model_name, management_no, deleted_at, is_archived').eq('store_id', context.storeId),
      ]);
      if (dealResult.error) throw new Error(dealResult.error.message);
      if (customerResult.error) throw new Error(customerResult.error.message);
      if (vehicleResult.error) throw new Error(vehicleResult.error.message);
      const nextDeals = (dealResult.data ?? []).filter((deal) => !deal.deleted_at && deal.is_archived !== true);
      const nextCustomers = (customerResult.data ?? []).filter((customer) => !customer.deleted_at && customer.is_archived !== true);
      const nextVehicles = (vehicleResult.data ?? []).filter((vehicle) => !vehicle.deleted_at && vehicle.is_archived !== true);
      setDeals(nextDeals);
      setCustomers(nextCustomers);
      setVehicles(nextVehicles);
      return { deals: nextDeals, customers: nextCustomers, vehicles: nextVehicles };
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '商談一覧の取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(() => { void loadDeals(); }); }, []);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => [
    { label: '新規', value: deals.filter((deal) => deal.status === '新規').length },
    { label: '連絡済み', value: deals.filter((deal) => deal.status === '連絡済み').length },
    { label: '来店予定', value: deals.filter((deal) => deal.status === '来店予定').length },
    { label: '成約', value: deals.filter((deal) => deal.status === '成約').length },
  ], [deals]);

  const filteredDeals = useMemo(() => {
    let result = deals;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((deal) =>
        [deal.deal_no, deal.title, customerMap.get(deal.customer_id ?? '')?.name, vehicleLabel(vehicleMap.get(deal.vehicle_id ?? ''))]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      );
    }
    if (statusFilter) result = result.filter((deal) => deal.status === statusFilter);
    if (actionFilter === 'today') result = result.filter((deal) => deal.next_action_at?.slice(0, 10) === today);
    if (actionFilter === 'overdue') result = result.filter((deal) => deal.next_action_at !== null && deal.next_action_at.slice(0, 10) < today && !['成約', '失注'].includes(deal.status ?? ''));
    return [...result].sort((a, b) => (a.next_action_at ?? '9999-12-31').localeCompare(b.next_action_at ?? '9999-12-31'));
  }, [actionFilter, customerMap, deals, searchQuery, statusFilter, today, vehicleMap]);

  const selectedDeal = useMemo(() => deals.find((deal) => deal.id === selectedDealId) ?? null, [deals, selectedDealId]);


  async function applyRefresh() {
    const loaded = await loadDeals();
    const latest = loaded?.deals.find((deal) => deal.id === selectedDealId);
    if (latest) {
      setEditingStatus(latest.status ?? '');
      setEditingNextActionAt(formatDateInput(latest.next_action_at));
    }
    setPendingRefresh(false);
    setConflictMessage('');
  }

  async function savePanel() {
    if (!selectedDeal) return;
    setIsSavingPanel(true);
    try {
      const supabase = createClient();
      const nextAction = editingNextActionAt ? new Date(editingNextActionAt).toISOString() : null;
      const { data, error } = await supabase
        .from<DealRow>('deals')
        .update({ status: editingStatus || null, next_action_at: nextAction })
        .eq('id', selectedDeal.id)
        .eq('updated_at', selectedDeal.updated_at ?? '')
        .select('id, customer_id, vehicle_id, deal_no, title, deal_type, status, probability, next_action_at, assigned_user_name, updated_at, deleted_at, is_archived')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        setConflictMessage('ほかの更新が入ったため保存できませんでした。最新データを反映してください。');
        setPendingRefresh(true);
        return;
      }
      setDeals((current) => current.map((deal) => deal.id === selectedDeal.id ? data : deal));
      setConflictMessage('');
      setPendingRefresh(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSavingPanel(false);
    }
  }

  function openDealPanel(deal: DealRow) {
    setSelectedDealId(deal.id);
    setEditingStatus(deal.status ?? '');
    setEditingNextActionAt(formatDateInput(deal.next_action_at));
    setConflictMessage('');
    setPendingRefresh(false);
  }

  return (
    <AppShell activeLabel="商談" title="商談" description="顧客との商談進捗を追跡・管理します" actionButton={<Link href="/deals/new" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">商談を登録</Link>}>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{stat.label}</p><p className="mt-3 text-3xl font-bold">{stat.value}</p></div>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-200 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-base font-bold">商談一覧</h3>
                <p className="mt-1 text-sm text-slate-500">{searchQuery || statusFilter || actionFilter !== 'all' ? `${filteredDeals.length}件 / 全${deals.length}件` : `全${deals.length}件`}</p>
              </div>
              <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-[minmax(240px,1fr)_auto_auto]">
                <input type="text" placeholder="商談番号・顧客名・車両名で検索" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                  <option value="">すべての状態</option>
                  {statusOptions.map((status) => <option key={status}>{status}</option>)}
                </select>
                <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as 'all' | 'today' | 'overdue')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100">
                  <option value="all">すべての次回対応</option>
                  <option value="today">今日対応</option>
                  <option value="overdue">期限超過</option>
                </select>
              </div>
            </div>
          </div>
          {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          {isLoading ? <p className="p-5 text-sm text-slate-500">読み込み中...</p> : filteredDeals.length === 0 ? <p className="p-5 text-sm font-semibold text-slate-500">表示できる商談はありません</p> : (
            <div className="divide-y divide-slate-100">
              {filteredDeals.map((deal) => (
                <button key={deal.id} type="button" onClick={() => openDealPanel(deal)} className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-blue-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{deal.title ?? deal.deal_no ?? '商談'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{customerMap.get(deal.customer_id ?? '')?.name ?? '顧客未設定'} / {vehicleLabel(vehicleMap.get(deal.vehicle_id ?? ''))}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(deal.status ?? '')}`}>{deal.status ?? '-'}</span>
                  </div>
                  <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                    <div><p className="text-xs font-bold text-slate-400">商談番号</p><p className="mt-1 font-bold text-slate-900">{deal.deal_no ?? '-'}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">担当者</p><p className="mt-1 font-bold text-slate-900">{deal.assigned_user_name ?? '-'}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">次回連絡</p><p className="mt-1 font-bold text-slate-900">{formatDateTime(deal.next_action_at)}</p></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <ResponsiveDetailPanel open={Boolean(selectedDeal)} title={selectedDeal?.title ?? selectedDeal?.deal_no ?? '商談概要'} subtitle={selectedDeal?.status ?? undefined} onClose={() => { setSelectedDealId(null); setConflictMessage(''); setPendingRefresh(false); }}>
          {selectedDeal && (
            <div className="space-y-5">
              {pendingRefresh && <button type="button" onClick={() => void applyRefresh()} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">新しい更新があります。反映する</button>}
              {conflictMessage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{conflictMessage}</p>}
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">顧客</dt><dd className="font-bold text-slate-900">{customerMap.get(selectedDeal.customer_id ?? '')?.name ?? '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">車両</dt><dd className="font-bold text-slate-900">{vehicleLabel(vehicleMap.get(selectedDeal.vehicle_id ?? ''))}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">担当者</dt><dd className="font-bold text-slate-900">{selectedDeal.assigned_user_name ?? '-'}</dd></div>
              </dl>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">状態</p>
                <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-900" value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)}>
                  {statusOptions.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">次回連絡</p>
                <input type="datetime-local" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-900" value={editingNextActionAt} onChange={(event) => setEditingNextActionAt(event.target.value)} />
              </div>
              <button type="button" onClick={() => void savePanel()} disabled={isSavingPanel || pendingRefresh} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">{isSavingPanel ? '保存中...' : '右パネルから保存する'}</button>
              <Link href={`/deals/${selectedDeal.id}`} className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">詳細を開く</Link>
            </div>
          )}
        </ResponsiveDetailPanel>
      </div>
    </AppShell>
  );
}
