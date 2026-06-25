'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { REMINDER_STATUS_LABELS, REMINDER_STATUSES, type ReminderStatus } from '@/lib/inspection-reminders/shared';
import { CANDIDATE_EVENT_TYPES, CANDIDATE_EVENT_TYPE_LABELS, type CandidateEventType } from '@/lib/line-link/deliveryCandidates';

type Row = {
  id: string;
  event_type: CandidateEventType;
  customer_name: string | null;
  vehicle_name: string | null;
  inspection_expiry_date: string;
  reminder_offset_days: number;
  status: ReminderStatus;
  error_detail: string | null;
  stores: { name: string | null } | null;
};

const PAGE_SIZE = 20;
const inputClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

function fmt(d: string | null) {
  return d ? d.slice(0, 10) : '-';
}
function statusBadge(s: ReminderStatus) {
  switch (s) {
    case 'pending': return 'bg-amber-50 text-amber-700';
    case 'completed': return 'bg-green-50 text-green-700';
    case 'skipped': return 'bg-slate-100 text-slate-600';
    case 'failed': return 'bg-red-50 text-red-700';
    default: return 'bg-blue-50 text-blue-700';
  }
}

export default function DeliveryCandidatesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('event_type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', String(page));
      const res = await fetch(`/api/customer-follow-up/inspection-reminders/events?${params.toString()}`, { cache: 'no-store' });
      const data = (await res.json()) as { ok: boolean; rows?: Row[]; total?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? '配信候補の取得に失敗しました。');
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '配信候補の取得に失敗しました。');
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter, statusFilter, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  return (
    <AppShell activeLabel="配信候補一覧" title="L-LINK配信候補一覧" description="車検・点検・納車後フォロー・口コミ・長期未接触などの配信候補を確認します。送信はL-LINKで行います。">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              種別
              <select className={inputClass} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}>
                <option value="">すべて</option>
                {CANDIDATE_EVENT_TYPES.map((t) => <option key={t} value={t}>{CANDIDATE_EVENT_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              状態
              <select className={inputClass} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                <option value="">すべて</option>
                {REMINDER_STATUSES.map((s) => <option key={s} value={s}>{REMINDER_STATUS_LABELS[s]}</option>)}
              </select>
            </label>
          </div>
        </section>

        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {isLoading ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">読み込み中...</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">配信候補がありません。各種フォロー条件に合致すると自動で候補が作成されます。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">種別</th>
                    <th className="px-4 py-3">対象顧客</th>
                    <th className="px-4 py-3">対象車両</th>
                    <th className="px-4 py-3">基準日</th>
                    <th className="px-4 py-3">タイミング</th>
                    <th className="px-4 py-3">状態</th>
                    <th className="px-4 py-3">店舗</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{CANDIDATE_EVENT_TYPE_LABELS[r.event_type] ?? r.event_type}</td>
                      <td className="px-4 py-3 text-slate-700">{r.customer_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{r.vehicle_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{fmt(r.inspection_expiry_date)}</td>
                      <td className="px-4 py-3 text-slate-700">{r.reminder_offset_days}日</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadge(r.status)}`}>{REMINDER_STATUS_LABELS[r.status]}</span></td>
                      <td className="px-4 py-3 text-slate-700">{r.stores?.name || '-'}</td>
                    </tr>
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
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">前へ</button>
              <span className="px-2 py-1.5 text-xs font-bold">{page + 1} / {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">次へ</button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
