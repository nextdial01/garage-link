'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type QuoteRow = {
  id: string;
  deal_id: string | null;
  quote_no: string | null;
  customer_name: string | null;
  vehicle_label: string | null;
  status: string | null;
  issue_status: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  total_amount: number | null;
  assigned_user_name: string | null;
};

function getStatusClass(status: string) {
  switch (status) {
    case '下書き':
    case 'draft':
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
    case '送付済み':
    case 'sent':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case '承認済み':
    case 'approved':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case '失注':
    case '期限切れ':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function getIssueStatusLabel(status: string | null) {
  switch (status) {
    case 'issued':
      return '発行済み';
    case 'cancelled':
      return '取消済み';
    case 'draft':
      return '下書き';
    default:
      return displayValue(status);
  }
}

function getIssueStatusClass(status: string | null) {
  switch (status) {
    case 'issued':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'cancelled':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    case 'draft':
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function formatPrice(value: number | null) {
  if (value === null) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}円`;
}

function displayValue(value: string | null) {
  return value && value.trim() !== '' ? value : '-';
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadQuotes() {
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

        const { data, error } = await supabase
          .from<QuoteRow>('quotes')
          .select(
            'id, deal_id, quote_no, customer_name, vehicle_label, status, issue_status, issue_date, expiry_date, total_amount, assigned_user_name'
          )
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setQuotes(data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '見積書一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadQuotes();
  }, []);

  const stats = useMemo(() => {
    return [
      { label: '見積件数', value: quotes.length },
      { label: '下書き', value: quotes.filter((quote) => quote.issue_status === 'draft').length },
      { label: '発行済み', value: quotes.filter((quote) => quote.issue_status === 'issued').length },
      { label: '取消済み', value: quotes.filter((quote) => quote.issue_status === 'cancelled').length },
    ];
  }, [quotes]);

  return (
    <AppShell
      activeLabel="見積書"
      title="見積書"
      description="見積書の作成・管理を行います"
      actionButton={
        <Link
          href="/quotes/new"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          見積書を作成
        </Link>
      }
    >
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-base font-bold">見積書一覧</h3>
          <p className="mt-1 text-sm text-slate-500">
            作成済みの見積書を一覧で確認できます
          </p>
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : quotes.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            まだ見積書が作成されていません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">見積番号</th>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">対象車両</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">発行状態</th>
                  <th className="px-5 py-4">発行日</th>
                  <th className="px-5 py-4">有効期限</th>
                  <th className="px-5 py-4">見積合計</th>
                  <th className="px-5 py-4">担当者</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {quotes.map((quote) => {
                  const status = quote.status ?? '未設定';

                  return (
                    <tr key={quote.id} className="hover:bg-blue-50/50">
                      <td className="px-5 py-4 font-semibold">
                        {displayValue(quote.quote_no)}
                      </td>
                      <td className="px-5 py-4">
                        {displayValue(quote.customer_name)}
                      </td>
                      <td className="px-5 py-4">
                        {displayValue(quote.vehicle_label)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(
                            status
                          )}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getIssueStatusClass(
                            quote.issue_status
                          )}`}
                        >
                          {getIssueStatusLabel(quote.issue_status)}
                        </span>
                      </td>
                      <td className="px-5 py-4">{displayValue(quote.issue_date)}</td>
                      <td className="px-5 py-4">{displayValue(quote.expiry_date)}</td>
                      <td className="px-5 py-4 text-right font-bold">
                        {formatPrice(quote.total_amount)}
                      </td>
                      <td className="px-5 py-4">
                        {displayValue(quote.assigned_user_name)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {quote.deal_id ? (
                            <>
                              <Link
                                href={`/deals/${quote.deal_id}/quotes/preview?quoteId=${quote.id}`}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                              >
                                PDF
                              </Link>
                              <Link
                                href={`/deals/${quote.deal_id}`}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-blue-50"
                              >
                                商談
                              </Link>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
