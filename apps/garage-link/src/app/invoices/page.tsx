'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type InvoiceRow = {
  id: string;
  deal_id: string | null;
  invoice_no: string | null;
  customer_name: string | null;
  vehicle_label: string | null;
  status: string | null;
  issue_status: string | null;
  issue_date: string | null;
  payment_due_date: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  unpaid_amount: number | null;
  assigned_user_name: string | null;
};

function displayValue(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-';
}

function formatPrice(value: number | null) {
  if (value === null) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}円`;
}

function getStatusClass(status: string | null) {
  switch (status) {
    case 'issued':
    case '送付済み':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'paid':
    case '入金済み':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'overdue':
    case '期限超過':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    case 'draft':
    case '下書き':
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [flashMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const msg = sessionStorage.getItem('flash_invoices') ?? '';
    if (msg) sessionStorage.removeItem('flash_invoices');
    return msg;
  });

  useEffect(() => {
    async function loadInvoices() {
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
          .from<InvoiceRow>('invoices')
          .select(
            'id, deal_id, invoice_no, customer_name, vehicle_label, status, issue_status, issue_date, payment_due_date, total_amount, paid_amount, unpaid_amount, assigned_user_name'
          )
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setInvoices(data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '請求書一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadInvoices();
  }, []);

  const stats = useMemo(() => {
    return [
      { label: '請求件数', value: invoices.length },
      { label: '下書き', value: invoices.filter((invoice) => invoice.issue_status === 'draft').length },
      { label: '発行済み', value: invoices.filter((invoice) => invoice.issue_status === 'issued').length },
      { label: '取消済み', value: invoices.filter((invoice) => invoice.issue_status === 'cancelled').length },
    ];
  }, [invoices]);

  return (
    <AppShell
      activeLabel="請求書"
      title="請求書"
      description="請求書の作成・管理を行います"
      actionButton={
        <Link
          href="/invoices/new"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          請求書を作成
        </Link>
      }
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
          <h3 className="text-base font-bold">請求書一覧</h3>
          <p className="mt-1 text-sm text-slate-500">
            発行済みの請求書を一覧で確認できます
          </p>
        </div>

        {flashMessage && (
          <p className="m-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {flashMessage}
          </p>
        )}

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : invoices.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            まだ請求書が作成されていません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">請求番号</th>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">対象車両</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">発行状態</th>
                  <th className="px-5 py-4">発行日</th>
                  <th className="px-5 py-4">支払期限</th>
                  <th className="px-5 py-4">請求合計</th>
                  <th className="px-5 py-4">未入金</th>
                  <th className="px-5 py-4">担当者</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold">{displayValue(invoice.invoice_no)}</td>
                    <td className="px-5 py-4">{displayValue(invoice.customer_name)}</td>
                    <td className="px-5 py-4">{displayValue(invoice.vehicle_label)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(invoice.status)}`}>
                        {displayValue(invoice.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getIssueStatusClass(invoice.issue_status)}`}>
                        {getIssueStatusLabel(invoice.issue_status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">{displayValue(invoice.issue_date)}</td>
                    <td className="px-5 py-4">{displayValue(invoice.payment_due_date)}</td>
                    <td className="px-5 py-4 text-right font-bold">{formatPrice(invoice.total_amount)}</td>
                    <td className="px-5 py-4 text-right font-bold">{formatPrice(invoice.unpaid_amount)}</td>
                    <td className="px-5 py-4">{displayValue(invoice.assigned_user_name)}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          詳細
                        </Link>
                        <Link
                          href={invoice.deal_id ? `/deals/${invoice.deal_id}/invoices/preview?invoiceId=${invoice.id}` : `/invoices/${invoice.id}/preview`}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                        >
                          PDF
                        </Link>
                        {invoice.deal_id && (
                          <Link
                            href={`/deals/${invoice.deal_id}`}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-blue-50"
                          >
                            商談
                          </Link>
                        )}
                      </div>
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
