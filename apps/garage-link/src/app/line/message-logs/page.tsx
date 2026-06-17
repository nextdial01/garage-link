'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LineModuleShell,
  StatCards,
  type StatItem,
} from '../_components/LineModule';
import LineManagementLayout from '@/components/LineManagementLayout';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type LineMessageLogRow = {
  id: string;
  deal_id: string | null;
  customer_id: string | null;
  line_display_name: string | null;
  message_type: string | null;
  title: string | null;
  send_status: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

function displayValue(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return value.replace('T', ' ').slice(0, 16);
}

function messageTypeLabel(value: string | null) {
  switch (value) {
    case 'vehicle_proposal':
      return '車両提案';
    case 'quote_notice':
      return '見積書案内';
    case 'invoice_notice':
      return '請求書案内';
    case 'visit_reservation':
      return '来店予約案内';
    case 'follow_up':
      return 'フォローアップ';
    case 'inspection_notice':
      return '車検・点検案内';
    case 'custom':
      return '自由入力';
    default:
      return displayValue(value);
  }
}

function statusLabel(value: string | null) {
  switch (value) {
    case 'pending':
      return '送信待ち';
    case 'sent':
      return '送信済み';
    case 'failed':
      return '失敗';
    case 'cancelled':
      return '取消済み';
    default:
      return displayValue(value);
  }
}

function statusClass(value: string | null) {
  switch (value) {
    case 'sent':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'failed':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    case 'pending':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

export default function LineMessageLogsPage() {
  const [logs, setLogs] = useState<LineMessageLogRow[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全ログ');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user?.id) {
          throw new Error(userError?.message ?? 'ログイン情報を取得できませんでした。');
        }

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();

        if (memberError || !member?.store_id) {
          throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
        }

        const [logResult, customerResult] = await Promise.all([
          supabase
            .from<LineMessageLogRow>('line_message_logs')
            .select('id, deal_id, customer_id, line_display_name, message_type, title, send_status, error_message, sent_at, created_at')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<CustomerRow>('customers')
            .select('id, name')
            .eq('store_id', member.store_id),
        ]);

        if (logResult.error) {
          throw new Error(logResult.error.message);
        }

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        const nameMap = (customerResult.data ?? []).reduce<Record<string, string>>((map, customer) => {
          map[customer.id] = customer.name ?? '-';
          return map;
        }, {});

        setLogs(logResult.data ?? []);
        setCustomerNames(nameMap);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE送信ログ一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadLogs();
  }, []);

  const stats: StatItem[] = useMemo(() => {
    return [
      { label: '送信ログ', value: String(logs.length) },
      { label: '送信済み', value: String(logs.filter((log) => log.send_status === 'sent').length) },
      { label: '失敗', value: String(logs.filter((log) => log.send_status === 'failed').length) },
      { label: '送信待ち', value: String(logs.filter((log) => log.send_status === 'pending').length) },
    ];
  }, [logs]);

  return (
    <LineModuleShell
      title="LINE送信ログ"
      description="LINEメッセージの送信結果とエラーを確認します"
      actionButton={
        <Link
          href="/line"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
        >
          LINE管理へ戻る
        </Link>
      }
    >
      <StatCards stats={stats} />

      <LineManagementLayout
        title="LINE送信ログ"
        description="LINEメッセージの送信結果とエラーを確認します。"
        categories={['全ログ', '送信済み', '送信待ち', '失敗', '車両提案', '見積案内', '請求案内'].map((label, index) => ({
          label,
          count: index === 0 ? logs.length : 0,
        }))}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        toolbar={
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-950">LINE送信ログ一覧</h3>
              <p className="mt-1 text-sm text-slate-500">送信状態とエラー内容を確認します。</p>
            </div>
            <button type="button" className="rounded-xl border border-green-200 bg-white px-4 py-2.5 text-sm font-bold text-green-700 transition hover:bg-green-50">
              検索
            </button>
          </div>
        }
      >
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h3 className="text-lg font-bold text-slate-950">LINE送信ログ一覧</h3>
          <p className="mt-1 text-sm text-slate-500">
            LINE Messaging APIのpush送信結果を確認できます。
          </p>
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : logs.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            LINE送信ログはまだありません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">送信日時</th>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">LINE表示名</th>
                  <th className="px-5 py-4">メッセージ種別</th>
                  <th className="px-5 py-4">タイトル</th>
                  <th className="px-5 py-4">送信状態</th>
                  <th className="px-5 py-4">エラー</th>
                  <th className="px-5 py-4">商談詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const customerName =
                    (log.customer_id ? customerNames[log.customer_id] : '') ||
                    log.line_display_name ||
                    '-';

                  return (
                    <tr key={log.id} className="hover:bg-green-50/60">
                      <td className="px-5 py-4">{formatDateTime(log.sent_at ?? log.created_at)}</td>
                      <td className="px-5 py-4 font-semibold">{customerName}</td>
                      <td className="px-5 py-4">{displayValue(log.line_display_name)}</td>
                      <td className="px-5 py-4">{messageTypeLabel(log.message_type)}</td>
                      <td className="px-5 py-4">{displayValue(log.title)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(log.send_status)}`}>
                          {statusLabel(log.send_status)}
                        </span>
                      </td>
                      <td className="max-w-[300px] truncate px-5 py-4">{displayValue(log.error_message)}</td>
                      <td className="px-5 py-4">
                        {log.deal_id ? (
                          <Link
                            href={`/deals/${log.deal_id}`}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-green-50"
                          >
                            商談詳細
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </LineManagementLayout>
    </LineModuleShell>
  );
}
