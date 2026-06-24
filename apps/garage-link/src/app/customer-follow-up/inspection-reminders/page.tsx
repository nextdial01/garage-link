'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';
import { REMINDER_STATUS_LABELS, REMINDER_STATUSES, type ReminderStatus } from '@/lib/inspection-reminders/shared';

type EventRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  inspection_expiry_date: string;
  reminder_offset_days: number;
  status: ReminderStatus;
  customer_name: string | null;
  vehicle_name: string | null;
  maker: string | null;
  model_name: string | null;
  registration_no: string | null;
  assigned_user_name: string | null;
  external_reference_id: string | null;
  error_detail: string | null;
  created_at: string;
  stores: { name: string | null } | null;
};

const PAGE_SIZE = 20;
const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : '-';
}

function statusBadgeClass(status: ReminderStatus) {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700';
    case 'processing':
      return 'bg-blue-50 text-blue-700';
    case 'completed':
      return 'bg-green-50 text-green-700';
    case 'skipped':
      return 'bg-slate-100 text-slate-600';
    case 'failed':
      return 'bg-red-50 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export default function InspectionReminderHistoryPage() {
  const [role, setRole] = useState('');
  const [rows, setRows] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');

  const canManage = role === 'owner' || role === 'admin';

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      if (!role) {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user?.id) {
          const { data: member } = await supabase.from<{ role: string | null }>('store_members').select('role').eq('user_id', userData.user.id).single();
          setRole(member?.role ?? '');
        }
      }

      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (appliedKeyword) params.set('keyword', appliedKeyword);
      params.set('page', String(page));

      const response = await fetch(`/api/customer-follow-up/inspection-reminders/events?${params.toString()}`, { cache: 'no-store' });
      const data = (await response.json()) as { ok: boolean; rows?: EventRow[]; total?: number; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? '履歴の取得に失敗しました。');
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '履歴の取得に失敗しました。');
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, fromDate, toDate, appliedKeyword, page, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  function applyFilters() {
    setPage(0);
    setAppliedKeyword(keyword.trim());
  }

  async function skipEvent(id: string) {
    setErrorMessage('');
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('inspection_reminder_events')
        .update({ status: 'skipped' })
        .eq('id', id)
        .eq('status', 'pending');
      if (error) throw new Error(error.message);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'スキップに失敗しました。');
    }
  }

  return (
    <AppShell activeLabel="車検案内対象履歴" title="車検案内対象履歴" description="車検案内の対象として作成されたイベントを確認します。">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              ステータス
              <select className={inputClass} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                <option value="">すべて</option>
                {REMINDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{REMINDER_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              作成日(から)
              <input type="date" className={inputClass} value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              作成日(まで)
              <input type="date" className={inputClass} value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              顧客名・車両名
              <input className={inputClass} value={keyword} placeholder="検索キーワード" onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }} />
            </label>
            <button type="button" onClick={applyFilters} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700">
              検索
            </button>
          </div>
        </section>

        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {isLoading ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">読み込み中...</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">該当する案内対象がありません。設定を有効にし、「今すぐ案内対象を判定」を実行してください。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">作成日</th>
                    <th className="px-4 py-3">顧客名</th>
                    <th className="px-4 py-3">車両名</th>
                    <th className="px-4 py-3">車検満了日</th>
                    <th className="px-4 py-3">案内タイミング</th>
                    <th className="px-4 py-3">状態</th>
                    <th className="px-4 py-3">店舗</th>
                    <th className="px-4 py-3">担当者</th>
                    <th className="px-4 py-3">エラー</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.customer_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{row.vehicle_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{formatDate(row.inspection_expiry_date)}</td>
                        <td className="px-4 py-3 text-slate-700">{row.reminder_offset_days}日前</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(row.status)}`}>{REMINDER_STATUS_LABELS[row.status]}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.stores?.name || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{row.assigned_user_name || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{row.error_detail ? 'あり' : 'なし'}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
                            詳細
                          </button>
                        </td>
                      </tr>
                      {expandedId === row.id && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                              <div>メーカー: <span className="font-semibold text-slate-800">{row.maker || '-'}</span></div>
                              <div>車種: <span className="font-semibold text-slate-800">{row.model_name || '-'}</span></div>
                              <div>登録番号: <span className="font-semibold text-slate-800">{row.registration_no || '-'}</span></div>
                              <div>外部連携先ID: <span className="font-semibold text-slate-800">{row.external_reference_id || '未連携'}</span></div>
                              <div className="sm:col-span-2 lg:col-span-3">エラー内容: <span className="font-semibold text-slate-800">{row.error_detail || 'なし'}</span></div>
                            </div>
                            {canManage && row.status === 'pending' && (
                              <button type="button" onClick={() => void skipEvent(row.id)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                                この対象をスキップ
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {total > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>全{total}件中 {page * PAGE_SIZE + 1}〜{Math.min((page + 1) * PAGE_SIZE, total)}件</span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                前へ
              </button>
              <span className="px-2 py-1.5 text-xs font-bold">{page + 1} / {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
                次へ
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
