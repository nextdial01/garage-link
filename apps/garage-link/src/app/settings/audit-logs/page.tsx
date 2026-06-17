'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';
import { getRoleLabel } from '@/lib/auth/permissions';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type AuditLogRow = {
  id: string;
  store_id: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  user_display_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  before_data: unknown | null;
  after_data: unknown | null;
  metadata: unknown | null;
  created_at: string | null;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const actionLabels: Record<string, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
  login: 'ログイン',
  logout: 'ログアウト',
  issue_quote: '見積書発行',
  issue_invoice: '請求書発行',
  cancel_quote: '見積書取消',
  cancel_invoice: '請求書取消',
  send_line: 'LINE送信',
  export_settings: '設定エクスポート',
  import_settings: '設定インポート',
  change_role: '権限変更',
  upload_file: 'ファイルアップロード',
};

function displayValue(value: string | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

function prettyJson(value: unknown) {
  if (value === null || value === undefined) return '-';
  const text = JSON.stringify(value, null, 2);
  return text.length > 2500 ? `${text.slice(0, 2500)}\n...省略` : text;
}

export default function AuditLogsPage() {
  const [role, setRole] = useState('');
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [expandedId, setExpandedId] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');

        setRole(member.role ?? '');
        if (member.role !== 'owner' && member.role !== 'admin') {
          setLogs([]);
          return;
        }

        const { data, error } = await supabase
          .from<AuditLogRow>('audit_logs')
          .select('id, store_id, user_id, user_email, user_role, user_display_name, action, target_type, target_id, target_label, before_data, after_data, metadata, created_at')
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        setLogs((data ?? []).slice(0, 100));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '監査ログの取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadLogs();
  }, []);

  const actions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).filter(Boolean), [logs]);
  const targetTypes = useMemo(() => Array.from(new Set(logs.map((log) => log.target_type ?? ''))).filter(Boolean), [logs]);
  const users = useMemo(() => Array.from(new Set(logs.map((log) => log.user_email ?? log.user_display_name ?? ''))).filter(Boolean), [logs]);
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const createdDate = log.created_at?.slice(0, 10) ?? '';
    if (actionFilter && log.action !== actionFilter) return false;
    if (targetFilter && log.target_type !== targetFilter) return false;
    if (userFilter && log.user_email !== userFilter && log.user_display_name !== userFilter) return false;
    if (dateFrom && createdDate < dateFrom) return false;
    if (dateTo && createdDate > dateTo) return false;
    return true;
  }), [actionFilter, dateFrom, dateTo, logs, targetFilter, userFilter]);

  return (
    <AppShell
      activeLabel="監査ログ"
      title="監査ログ"
      description="店舗内の作成・更新・削除・発行・送信・設定変更の履歴を確認します。"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</section>
      ) : role !== 'owner' && role !== 'admin' ? (
        <PermissionDeniedCard />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
            現在の権限: {getRoleLabel(role)}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-950">検索・絞り込み</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <select className={inputClass} value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="">すべての操作</option>
                {actions.map((action) => <option key={action} value={action}>{actionLabels[action] ?? action}</option>)}
              </select>
              <select className={inputClass} value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}>
                <option value="">すべての対象</option>
                {targetTypes.map((target) => <option key={target} value={target}>{target}</option>)}
              </select>
              <select className={inputClass} value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
                <option value="">すべてのユーザー</option>
                {users.map((user) => <option key={user} value={user}>{user}</option>)}
              </select>
              <input type="date" className={inputClass} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <input type="date" className={inputClass} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
              <h3 className="text-lg font-bold text-slate-950">操作履歴</h3>
              <p className="mt-1 text-sm text-slate-500">最新100件を表示します。将来的にページネーションへ対応します。</p>
            </div>
            <div className="overflow-x-auto p-5">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>{['日時', 'ユーザー', '権限', '操作', '対象', '対象名', '詳細'].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr><td className="px-4 py-5 text-slate-500" colSpan={7}>操作履歴はありません。</td></tr>
                  ) : filteredLogs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3">{displayValue(log.user_display_name ?? log.user_email)}</td>
                      <td className="px-4 py-3">{getRoleLabel(log.user_role)}</td>
                      <td className="px-4 py-3 font-semibold">{actionLabels[log.action] ?? log.action}</td>
                      <td className="px-4 py-3">{displayValue(log.target_type)}</td>
                      <td className="px-4 py-3">{displayValue(log.target_label)}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpandedId((current) => current === log.id ? '' : log.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                          {expandedId === log.id ? '閉じる' : '詳細'}
                        </button>
                        {expandedId === log.id && (
                          <div className="mt-3 grid gap-3">
                            <pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-5 text-slate-100">{prettyJson({ metadata: log.metadata, before_data: log.before_data, after_data: log.after_data })}</pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
