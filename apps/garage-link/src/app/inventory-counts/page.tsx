'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };
type InventoryCountRow = {
  id: string;
  count_no: string;
  name: string;
  count_type: string | null;
  count_category: string | null;
  status: string | null;
  scheduled_date: string | null;
  difference_count: number | null;
  unchecked_count: number | null;
  approval_status: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

function getStatusClass(status: string | null) {
  switch (status) {
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'completed':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'cancelled':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    draft: '下書き',
    in_progress: '棚卸し中',
    completed: '完了',
    cancelled: 'キャンセル',
  };
  return status ? labels[status] ?? status : '-';
}

function approvalLabel(status: string | null) {
  const labels: Record<string, string> = {
    not_requested: '未申請',
    requested: '申請中',
    approved: '承認済み',
    rejected: '差戻し',
  };
  return status ? labels[status] ?? status : '-';
}

export default function InventoryCountsPage() {
  const [counts, setCounts] = useState<InventoryCountRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadCounts() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');
        const { data: member, error: memberError } = await supabase.from<StoreMemberRow>('store_members').select('store_id').eq('user_id', userData.user.id).single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
        const { data, error } = await supabase
          .from<InventoryCountRow>('inventory_counts')
          .select('id, count_no, name, count_type, count_category, status, scheduled_date, difference_count, unchecked_count, approval_status, deleted_at, is_archived')
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        setCounts((data ?? []).filter((count) => !count.deleted_at && count.is_archived !== true));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '棚卸し一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadCounts();
  }, []);

  const stats = useMemo(() => [
    { label: '棚卸し数', value: counts.length },
    { label: '棚卸し中', value: counts.filter((count) => count.status === 'in_progress').length },
    { label: '差異件数', value: counts.reduce((total, count) => total + (count.difference_count ?? 0), 0) },
    { label: '未確認件数', value: counts.reduce((total, count) => total + (count.unchecked_count ?? 0), 0) },
  ], [counts]);

  return (
    <AppShell
      activeLabel="棚卸し"
      title="棚卸し"
      description="在庫の棚卸しを実施・管理します"
      actionButton={<Link href="/inventory-counts/new" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">棚卸しを開始</Link>}
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
          <h3 className="text-base font-bold">棚卸し一覧</h3>
          <p className="mt-1 text-sm text-slate-500">実施済みの棚卸しを一覧で確認できます。{counts.length}件</p>
        </div>
        {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : counts.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">棚卸しはまだありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">棚卸し番号</th>
                  <th className="px-5 py-4">棚卸し名</th>
                  <th className="px-5 py-4">種別</th>
                  <th className="px-5 py-4">区分</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">実施予定日</th>
                  <th className="px-5 py-4">差異件数</th>
                  <th className="px-5 py-4">未確認件数</th>
                  <th className="px-5 py-4">承認状態</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.map((count) => (
                  <tr key={count.id} className="hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold">{count.count_no}</td>
                    <td className="px-5 py-4">{count.name}</td>
                    <td className="px-5 py-4">{count.count_type ?? '-'}</td>
                    <td className="px-5 py-4">{count.count_category ?? '-'}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(count.status)}`}>{statusLabel(count.status)}</span></td>
                    <td className="px-5 py-4">{count.scheduled_date ?? '-'}</td>
                    <td className="px-5 py-4">{count.difference_count ?? 0}</td>
                    <td className="px-5 py-4">{count.unchecked_count ?? 0}</td>
                    <td className="px-5 py-4">{approvalLabel(count.approval_status)}</td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/inventory-counts/${count.id}`}
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
