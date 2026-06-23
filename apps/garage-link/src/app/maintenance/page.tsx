'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };
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
  deleted_at?: string | null;
  is_archived?: boolean | null;
};
type CustomerRow = { id: string; name: string | null; deleted_at?: string | null; is_archived?: boolean | null };
type VehicleRow = { id: string; maker: string | null; model_name: string | null; management_no: string | null; deleted_at?: string | null; is_archived?: boolean | null };

function getStatusClass(status: string | null) {
  switch (status) {
    case 'working':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case 'completed':
    case 'delivered':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'estimating':
    case 'waiting':
    case 'received':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'cancelled':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    received: '受付',
    estimating: '見積中',
    waiting: '入庫待ち',
    working: '作業中',
    completed: '完了',
    delivered: '納車済み',
    cancelled: 'キャンセル',
  };
  return status ? labels[status] ?? status : '-';
}

function formatDate(value: string | null) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

function formatPrice(value: number | null) {
  return value === null ? '-' : `${value.toLocaleString()}円`;
}

export default function MaintenancePage() {
  const [jobs, setJobs] = useState<MaintenanceJobRow[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [flashMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const msg = sessionStorage.getItem('flash_maintenance') ?? '';
    if (msg) sessionStorage.removeItem('flash_maintenance');
    return msg;
  });

  useEffect(() => {
    async function loadJobs() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');
        const { data: member, error: memberError } = await supabase.from<StoreMemberRow>('store_members').select('store_id').eq('user_id', userData.user.id).single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');

        const [jobResult, customerResult, vehicleResult] = await Promise.all([
          supabase.from<MaintenanceJobRow>('maintenance_jobs').select('id, customer_id, vehicle_id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, estimated_total_amount, assigned_user_name, deleted_at, is_archived').eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<CustomerRow>('customers').select('id, name, deleted_at, is_archived').eq('store_id', member.store_id),
          supabase.from<VehicleRow>('vehicles').select('id, maker, model_name, management_no, deleted_at, is_archived').eq('store_id', member.store_id),
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

    void loadJobs();
  }, []);

  const stats = useMemo(() => [
    { label: '整備・車検数', value: jobs.length },
    { label: '受付・待ち', value: jobs.filter((job) => ['received', 'waiting', 'estimating'].includes(job.status ?? '')).length },
    { label: '作業中', value: jobs.filter((job) => job.status === 'working').length },
    { label: '完了', value: jobs.filter((job) => ['completed', 'delivered'].includes(job.status ?? '')).length },
  ], [jobs]);

  return (
    <AppShell
      activeLabel="整備・車検"
      title="整備・車検"
      description="整備・車検のスケジュールを管理します"
      actionButton={<Link href="/maintenance/new" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">整備・車検を登録</Link>}
    >
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-base font-bold">整備・車検スケジュール</h3>
          <p className="mt-1 text-sm text-slate-500">整備・車検の予定を一覧で確認できます。{jobs.length}件</p>
        </div>
        {flashMessage && <p className="m-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{flashMessage}</p>}
        {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : jobs.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">整備・車検案件はまだありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">受付番号</th>
                  <th className="px-5 py-4">種別</th>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">対象車両</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">入庫予定</th>
                  <th className="px-5 py-4">納車予定</th>
                  <th className="px-5 py-4">見積合計</th>
                  <th className="px-5 py-4">担当者</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold">{job.job_no}</td>
                    <td className="px-5 py-4">{job.job_type ?? '-'}</td>
                    <td className="px-5 py-4">{job.customer_id ? customers[job.customer_id] ?? '-' : '-'}</td>
                    <td className="px-5 py-4">{job.vehicle_id ? vehicles[job.vehicle_id] ?? '-' : '-'}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(job.status)}`}>{statusLabel(job.status)}</span></td>
                    <td className="px-5 py-4">{formatDate(job.scheduled_in_at)}</td>
                    <td className="px-5 py-4">{formatDate(job.scheduled_delivery_at)}</td>
                    <td className="px-5 py-4 text-right">{formatPrice(job.estimated_total_amount)}</td>
                    <td className="px-5 py-4">{job.assigned_user_name ?? '-'}</td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/maintenance/${job.id}`}
                        className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
