'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ResponsiveDetailPanel from '@/components/ResponsiveDetailPanel';
import { getGarageUiContext } from '@/lib/store/garageUiContext';
import { createClient } from '@/lib/supabase/client';

type MaintenanceJobRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  job_no: string;
  job_type: string | null;
  status: string | null;
  scheduled_in_at: string | null;
  scheduled_delivery_at: string | null;
  estimated_total_amount: number | null;
  assigned_user_name: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};
type CustomerRow = { id: string; name: string | null; deleted_at?: string | null; is_archived?: boolean | null };
type VehicleRow = { id: string; maker: string | null; model_name: string | null; management_no: string | null; deleted_at?: string | null; is_archived?: boolean | null };

const statusOptions = [
  { value: 'received', label: '受付' },
  { value: 'estimating', label: '見積中' },
  { value: 'waiting', label: '入庫待ち' },
  { value: 'working', label: '作業中' },
  { value: 'completed', label: '完了' },
  { value: 'delivered', label: '納車済み' },
  { value: 'cancelled', label: 'キャンセル' },
];
function getStatusClass(status: string | null) {
  switch (status) {
    case 'working': return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case 'completed':
    case 'delivered': return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'estimating':
    case 'waiting':
    case 'received': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'cancelled': return 'bg-red-50 text-red-700 ring-red-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}
function statusLabel(status: string | null) {
  return statusOptions.find((option) => option.value === status)?.label ?? status ?? '-';
}
function formatDate(value: string | null) { return value ? value.replace('T', ' ').slice(0, 16) : '-'; }
function formatPrice(value: number | null) { return value === null ? '-' : `${value.toLocaleString()}円`; }
function formatDateInput(value: string | null) { return value ? value.slice(0, 16) : ''; }

export default function MaintenancePage() {
  const [jobs, setJobs] = useState<MaintenanceJobRow[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState('');
  const [editingDeliveryAt, setEditingDeliveryAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [flashMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const msg = sessionStorage.getItem('flash_maintenance') ?? '';
    if (msg) sessionStorage.removeItem('flash_maintenance');
    return msg;
  });

  async function loadJobs() {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const supabase = createClient();
      const context = await getGarageUiContext();
      if (!context.storeId) throw new Error('所属店舗が見つかりません。');
      const [jobResult, customerResult, vehicleResult] = await Promise.all([
        supabase.from<MaintenanceJobRow>('maintenance_jobs').select('id, customer_id, vehicle_id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, estimated_total_amount, assigned_user_name, updated_at, deleted_at, is_archived').eq('store_id', context.storeId).order('scheduled_delivery_at', { ascending: true }),
        supabase.from<CustomerRow>('customers').select('id, name, deleted_at, is_archived').eq('store_id', context.storeId),
        supabase.from<VehicleRow>('vehicles').select('id, maker, model_name, management_no, deleted_at, is_archived').eq('store_id', context.storeId),
      ]);
      if (jobResult.error) throw new Error(jobResult.error.message);
      if (customerResult.error) throw new Error(customerResult.error.message);
      if (vehicleResult.error) throw new Error(vehicleResult.error.message);
      setJobs((jobResult.data ?? []).filter((job) => !job.deleted_at && job.is_archived !== true));
      setCustomers((customerResult.data ?? []).filter((row) => !row.deleted_at && row.is_archived !== true).reduce<Record<string, string>>((map, row) => ({ ...map, [row.id]: row.name ?? '-' }), {}));
      setVehicles((vehicleResult.data ?? []).filter((row) => !row.deleted_at && row.is_archived !== true).reduce<Record<string, string>>((map, row) => ({ ...map, [row.id]: [row.management_no, row.maker, row.model_name].filter(Boolean).join(' / ') || '-' }), {}));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '整備・車検一覧の取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(() => { void loadJobs(); }); }, []);
  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => [
    { label: '整備・車検数', value: jobs.length, detail: '登録済み案件' },
    { label: '受付・待ち', value: jobs.filter((job) => ['received', 'waiting', 'estimating'].includes(job.status ?? '')).length, detail: '見積・入庫待ち' },
    { label: '作業中', value: jobs.filter((job) => job.status === 'working').length, detail: '進行中の案件' },
    { label: '納車期限', value: jobs.filter((job) => job.scheduled_delivery_at?.slice(0, 10) && job.scheduled_delivery_at.slice(0, 10) <= today && !['completed', 'delivered'].includes(job.status ?? '')).length, detail: '今日までに確認' },
  ], [jobs, today]);
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);


  async function applyRefresh() {
    await loadJobs();
    setPendingRefresh(false);
    setConflictMessage('');
  }

  async function savePanel() {
    if (!selectedJob) return;
    setIsSaving(true);
    try {
      const supabase = createClient();
      const nextDelivery = editingDeliveryAt ? new Date(editingDeliveryAt).toISOString() : null;
      const { data, error } = await supabase.from<MaintenanceJobRow>('maintenance_jobs').update({ status: editingStatus || null, scheduled_delivery_at: nextDelivery }).eq('id', selectedJob.id).eq('updated_at', selectedJob.updated_at ?? '').select('id, customer_id, vehicle_id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, estimated_total_amount, assigned_user_name, updated_at, deleted_at, is_archived').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        setConflictMessage('ほかの更新が入ったため保存できませんでした。最新データを反映してください。');
        setPendingRefresh(true);
        return;
      }
      setJobs((current) => current.map((job) => job.id === selectedJob.id ? data : job));
      setConflictMessage('');
      setPendingRefresh(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell activeLabel="整備・車検" title="整備・車検" description="納車予定が近い案件と作業中案件をまとめて見られます" actionButton={<Link href="/maintenance/new" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">整備・車検を登録</Link>}>
      <div className="mb-6 grid gap-4 md:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-500">{stat.label}</p><p className="mt-3 text-3xl font-black text-slate-950">{stat.value}</p><p className="mt-2 text-xs font-semibold text-slate-400">{stat.detail}</p></div>)}</div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5"><h3 className="text-base font-bold">整備・車検一覧</h3><p className="mt-1 text-sm text-slate-500">納車予定が近い順に並びます。{jobs.length}件</p></div>
          {flashMessage && <p className="m-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{flashMessage}</p>}
          {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          {isLoading ? <p className="p-5 text-sm text-slate-500">読み込み中...</p> : jobs.length === 0 && !errorMessage ? <p className="p-5 text-sm font-semibold text-slate-500">整備・車検案件はまだありません</p> : (
            <div className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <button key={job.id} type="button" onClick={() => { setSelectedJobId(job.id); setEditingStatus(job.status ?? 'received'); setEditingDeliveryAt(formatDateInput(job.scheduled_delivery_at)); setConflictMessage(''); setPendingRefresh(false); }} className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-blue-50/50">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-950">{job.job_no}</p><p className="mt-1 text-xs font-semibold text-slate-500">{job.job_type ?? '-'} / 担当 {job.assigned_user_name ?? '-'}</p></div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(job.status)}`}>{statusLabel(job.status)}</span></div>
                  <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                    <div><p className="text-xs font-bold text-slate-400">顧客</p><p className="mt-1 font-bold text-slate-900">{job.customer_id ? customers[job.customer_id] ?? '-' : '-'}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">対象車両</p><p className="mt-1 font-bold text-slate-900">{job.vehicle_id ? vehicles[job.vehicle_id] ?? '-' : '-'}</p></div>
                    <div><p className="text-xs font-bold text-slate-400">納車予定</p><p className="mt-1 font-bold text-slate-900">{formatDate(job.scheduled_delivery_at)}</p></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <ResponsiveDetailPanel open={Boolean(selectedJob)} title={selectedJob?.job_no ?? '案件概要'} subtitle={selectedJob?.job_type ?? '整備・車検'} onClose={() => { setSelectedJobId(null); setConflictMessage(''); setPendingRefresh(false); }}>
          {selectedJob && (
            <div className="space-y-5">
              {pendingRefresh && <button type="button" onClick={() => void applyRefresh()} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">新しい更新があります。反映する</button>}
              {conflictMessage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{conflictMessage}</p>}
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">顧客</dt><dd className="font-bold text-slate-900">{selectedJob.customer_id ? customers[selectedJob.customer_id] ?? '-' : '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">対象車両</dt><dd className="font-bold text-slate-900">{selectedJob.vehicle_id ? vehicles[selectedJob.vehicle_id] ?? '-' : '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">入庫予定</dt><dd className="font-bold text-slate-900">{formatDate(selectedJob.scheduled_in_at)}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">見積合計</dt><dd className="font-bold text-slate-900">{formatPrice(selectedJob.estimated_total_amount)}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">担当者</dt><dd className="font-bold text-slate-900">{selectedJob.assigned_user_name ?? '-'}</dd></div>
              </dl>
              <div className="space-y-2"><p className="text-xs font-bold text-slate-400">状態</p><select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-900" value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              <div className="space-y-2"><p className="text-xs font-bold text-slate-400">納車予定</p><input type="datetime-local" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-900" value={editingDeliveryAt} onChange={(event) => setEditingDeliveryAt(event.target.value)} /></div>
              <button type="button" onClick={() => void savePanel()} disabled={isSaving || pendingRefresh} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">{isSaving ? '保存中...' : '右パネルから保存する'}</button>
              <Link href={`/maintenance/${selectedJob.id}`} className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">詳細を開く</Link>
            </div>
          )}
        </ResponsiveDetailPanel>
      </div>
    </AppShell>
  );
}
