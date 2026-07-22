'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ResponsiveDetailPanel from '@/components/ResponsiveDetailPanel';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };
type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  line_friend_status: string | null;
  desired_model: string | null;
  budget_min: number | null;
  budget_max: number | null;
  customer_status: string | null;
  next_action_date: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

const statusOptions = ['新規', '見込み', '商談中', '購入済み', '失注', '対応不要'];

function getStatusClass(status: string) {
  switch (status) {
    case '新規':
    case '見込み': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case '既存':
    case '購入済み': return 'bg-green-50 text-green-700 ring-green-600/20';
    case '商談中': return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '失注':
    case '対応不要': return 'bg-slate-100 text-slate-700 ring-slate-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}
function formatBudget(min: number | null, max: number | null) {
  if (min === null && max === null) return '-';
  if (min !== null && max !== null) return `${min.toLocaleString()}〜${max.toLocaleString()}円`;
  if (min !== null) return `${min.toLocaleString()}円〜`;
  return `〜${max?.toLocaleString()}円`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'today' | 'overdue'>('all');
  const [sortOrder, setSortOrder] = useState<'next_action' | 'recent_status'>('next_action');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState('');
  const [editingNextAction, setEditingNextAction] = useState('');
  const [isSavingPanel, setIsSavingPanel] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  async function loadCustomers() {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) throw new Error(userError?.message ?? 'ログイン情報を取得できませんでした。');
      const { data: member, error: memberError } = await supabase.from<StoreMemberRow>('store_members').select('store_id').eq('user_id', userData.user.id).single();
      if (memberError || !member?.store_id) throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
      const { data, error } = await supabase.from<CustomerRow>('customers').select('id, name, phone, mobile_phone, email, line_friend_status, desired_model, budget_min, budget_max, customer_status, next_action_date, updated_at, deleted_at, is_archived').eq('store_id', member.store_id).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      setCustomers((data ?? []).filter((customer) => !customer.deleted_at && customer.is_archived !== true));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '顧客一覧の取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(() => { void loadCustomers(); }); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const lineFriends = customers.filter((customer) => customer.line_friend_status === '友だち').length;
    const deals = customers.filter((customer) => customer.customer_status === '商談中').length;
    const purchased = customers.filter((customer) => customer.customer_status === '購入済み').length;
    return [
      { label: '顧客数', value: customers.length },
      { label: 'LINE友だち', value: lineFriends },
      { label: '商談中', value: deals },
      { label: '購入済み', value: purchased },
    ];
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => (c.name ?? '').toLowerCase().includes(q) || (c.phone ?? '').includes(q) || (c.mobile_phone ?? '').includes(q) || (c.email ?? '').toLowerCase().includes(q));
    }
    if (statusFilter) result = result.filter((customer) => customer.customer_status === statusFilter);
    if (actionFilter === 'today') result = result.filter((customer) => customer.next_action_date === today);
    if (actionFilter === 'overdue') result = result.filter((customer) => customer.next_action_date !== null && customer.next_action_date < today);
    return [...result].sort((a, b) => sortOrder === 'recent_status' ? (b.customer_status ?? '').localeCompare(a.customer_status ?? '', 'ja') : (a.next_action_date ?? '9999-12-31').localeCompare(b.next_action_date ?? '9999-12-31'));
  }, [actionFilter, customers, searchQuery, sortOrder, statusFilter, today]);

  const selectedCustomer = useMemo(() => customers.find((customer) => customer.id === selectedCustomerId) ?? null, [customers, selectedCustomerId]);


  async function applyRefresh() {
    await loadCustomers();
    setPendingRefresh(false);
    setConflictMessage('');
  }

  async function savePanel() {
    if (!selectedCustomer) return;
    setIsSavingPanel(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from<CustomerRow>('customers').update({ customer_status: editingStatus || null, next_action_date: editingNextAction || null }).eq('id', selectedCustomer.id).eq('updated_at', selectedCustomer.updated_at ?? '').select('id, name, phone, mobile_phone, email, line_friend_status, desired_model, budget_min, budget_max, customer_status, next_action_date, updated_at, deleted_at, is_archived').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        setConflictMessage('ほかの更新が入ったため保存できませんでした。最新データを反映してください。');
        setPendingRefresh(true);
        return;
      }
      setCustomers((current) => current.map((customer) => customer.id === selectedCustomer.id ? data : customer));
      setConflictMessage('');
      setPendingRefresh(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSavingPanel(false);
    }
  }

  function openCustomerPanel(customer: CustomerRow) {
    setSelectedCustomerId(customer.id);
    setEditingStatus(customer.customer_status ?? '');
    setEditingNextAction(customer.next_action_date ?? '');
    setConflictMessage('');
    setPendingRefresh(false);
  }

  return (
    <AppShell activeLabel="顧客" title="顧客" description="顧客情報・LINE友だち・商談状況を一元管理します" actionButton={<Link href="/customers/new" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">顧客を登録</Link>}>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{stat.label}</p><p className="mt-3 text-3xl font-bold">{stat.value}</p></div>)}
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-200 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-[140px] shrink-0">
                <h3 className="text-base font-bold">顧客一覧</h3>
                <p className="mt-1 text-sm text-slate-500">{searchQuery || statusFilter || actionFilter !== 'all' ? `${filteredCustomers.length}件 / 全${customers.length}件` : `全${customers.length}件`}</p>
              </div>
              <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2 2xl:w-auto 2xl:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
                <input type="text" placeholder="顧客名・電話・メールで検索" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'next_action' | 'recent_status')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="next_action">次回対応が近い順</option><option value="recent_status">ステータス順</option></select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="">すべての状態</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select>
                <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as 'all' | 'today' | 'overdue')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"><option value="all">すべての次回対応</option><option value="today">今日対応</option><option value="overdue">期限超過</option></select>
              </div>
            </div>
          </div>
          {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          {isLoading ? <p className="p-5 text-sm text-slate-500">読み込み中...</p> : filteredCustomers.length === 0 ? <p className="p-5 text-sm font-semibold text-slate-500">表示できる顧客はありません</p> : (
            <div className="divide-y divide-slate-100">
              {filteredCustomers.map((customer) => (
                <button key={customer.id} type="button" onClick={() => openCustomerPanel(customer)} className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-blue-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{customer.name ?? '顧客名未設定'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{customer.mobile_phone ?? customer.phone ?? customer.email ?? '-'}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(customer.customer_status ?? '')}`}>{customer.customer_status ?? '-'}</span>
                  </div>
                  <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                    <div><p className="text-xs font-bold text-slate-400">希望車種</p><p className="mt-1 font-bold text-slate-900">{customer.desired_model ?? '-'}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">予算</p><p className="mt-1 font-bold text-slate-900">{formatBudget(customer.budget_min, customer.budget_max)}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">次回対応</p><p className="mt-1 font-bold text-slate-900">{customer.next_action_date ?? '-'}</p></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <ResponsiveDetailPanel open={Boolean(selectedCustomer)} title={selectedCustomer?.name ?? '顧客概要'} subtitle={selectedCustomer?.customer_status ?? undefined} onClose={() => { setSelectedCustomerId(null); setConflictMessage(''); setPendingRefresh(false); }}>
          {selectedCustomer && (
            <div className="space-y-5">
              {pendingRefresh && <button type="button" onClick={() => void applyRefresh()} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">新しい更新があります。反映する</button>}
              {conflictMessage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{conflictMessage}</p>}
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">電話</dt><dd className="font-bold text-slate-900">{selectedCustomer.mobile_phone ?? selectedCustomer.phone ?? '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">メール</dt><dd className="font-bold text-slate-900">{selectedCustomer.email ?? '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">希望車種</dt><dd className="font-bold text-slate-900">{selectedCustomer.desired_model ?? '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">予算</dt><dd className="font-bold text-slate-900">{formatBudget(selectedCustomer.budget_min, selectedCustomer.budget_max)}</dd></div>
              </dl>
              <div className="space-y-2"><p className="text-xs font-bold text-slate-400">状態</p><select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-900" value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></div>
              <div className="space-y-2"><p className="text-xs font-bold text-slate-400">次回対応日</p><input type="date" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-900" value={editingNextAction} onChange={(event) => setEditingNextAction(event.target.value)} /></div>
              <button type="button" onClick={() => void savePanel()} disabled={isSavingPanel || pendingRefresh} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">{isSavingPanel ? '保存中...' : '右パネルから保存する'}</button>
              <Link href={`/customers/${selectedCustomer.id}`} className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">詳細を開く</Link>
            </div>
          )}
        </ResponsiveDetailPanel>
      </div>
    </AppShell>
  );
}
