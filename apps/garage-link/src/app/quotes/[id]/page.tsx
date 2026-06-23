'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string; role: string | null };

type QuoteRow = {
  id: string;
  store_id: string;
  deal_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  quote_no: string | null;
  title: string | null;
  status: string | null;
  issue_status: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  assigned_user_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  vehicle_label: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  trade_in_amount: number | null;
  total_amount: number | null;
  customer_note: string | null;
  created_at: string | null;
};

type QuoteItemRow = {
  id: string;
  item_order: number | null;
  item_type: string | null;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
};

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString('ja-JP')}円`;
}

function displayValue(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-';
}

function getIssueStatusLabel(status: string | null) {
  switch (status) {
    case 'issued': return '発行済み';
    case 'cancelled': return '取消済み';
    case 'draft': return '下書き';
    default: return displayValue(status);
  }
}

function getIssueStatusClass(status: string | null) {
  switch (status) {
    case 'issued': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'cancelled': return 'bg-red-50 text-red-700 ring-red-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function getStatusClass(status: string | null) {
  switch (status) {
    case '下書き': case 'draft': return 'bg-slate-50 text-slate-700 ring-slate-600/20';
    case '送付済み': case 'sent': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case '承認済み': case 'approved': return 'bg-green-50 text-green-700 ring-green-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function loadQuote() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');

        const { data, error } = await supabase
          .from<QuoteRow>('quotes')
          .select('id, store_id, deal_id, customer_id, vehicle_id, quote_no, title, status, issue_status, issue_date, expiry_date, assigned_user_name, customer_name, customer_phone, customer_email, customer_address, vehicle_label, subtotal_amount, tax_amount, discount_amount, trade_in_amount, total_amount, customer_note, created_at')
          .eq('id', id)
          .eq('store_id', member.store_id)
          .single();
        if (error || !data) throw new Error(error?.message ?? '見積書が見つかりません。');

        setQuote(data);

        const { data: items } = await supabase
          .from<QuoteItemRow>('quote_items')
          .select('id, item_order, item_type, name, quantity, unit_price, amount')
          .eq('quote_id', id)
          .eq('store_id', member.store_id)
          .order('item_order', { ascending: true });
        setQuoteItems(items ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '見積書の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }
    void loadQuote();
  }, [id]);

  const previewHref = quote?.deal_id
    ? `/deals/${quote.deal_id}/quotes/preview?quoteId=${id}`
    : `/quotes/${id}/preview`;

  return (
    <AppShell
      activeLabel="見積書"
      title={isLoading ? '見積書詳細' : (quote?.quote_no ? `見積書 ${quote.quote_no}` : '見積書詳細')}
      description="見積書の内容を確認します"
      actionButton={
        <div className="flex gap-2">
          {quote && (
            <Link
              href={previewHref}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100"
            >
              PDF発行
            </Link>
          )}
          {quote?.deal_id && (
            <Link
              href={`/deals/${quote.deal_id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              商談へ
            </Link>
          )}
          <Link
            href="/quotes"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            一覧へ戻る
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">読み込み中...</p>
      ) : !quote ? (
        <p className="rounded-xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {errorMessage || '見積書が見つかりません。'}
        </p>
      ) : (
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-inset ${getIssueStatusClass(quote.issue_status)}`}>
              {getIssueStatusLabel(quote.issue_status)}
            </span>
            {quote.status && (
              <span className={`inline-flex rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-inset ${getStatusClass(quote.status)}`}>
                {quote.status}
              </span>
            )}
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">見積基本情報</h2>
            <dl className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
              {[
                ['見積番号', quote.quote_no],
                ['タイトル', quote.title],
                ['発行日', quote.issue_date],
                ['有効期限', quote.expiry_date],
                ['担当者', quote.assigned_user_name],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="font-bold text-slate-500">{label as string}</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{displayValue(value as string | null)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">顧客・車両</h2>
            <dl className="grid gap-4 text-sm md:grid-cols-2">
              {[
                ['顧客名', quote.customer_name],
                ['電話番号', quote.customer_phone],
                ['メールアドレス', quote.customer_email],
                ['住所', quote.customer_address],
                ['対象車両', quote.vehicle_label],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="font-bold text-slate-500">{label as string}</dt>
                  <dd className="mt-1 font-semibold text-slate-950">{displayValue(value as string | null)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">明細</h2>
            {quoteItems.length === 0 ? (
              <p className="text-sm text-slate-400">明細はありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">項目</th>
                      <th className="px-4 py-3 text-left">種別</th>
                      <th className="px-4 py-3 text-right">数量</th>
                      <th className="px-4 py-3 text-right">単価</th>
                      <th className="px-4 py-3 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quoteItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-semibold text-slate-950">{displayValue(item.name)}</td>
                        <td className="px-4 py-3 text-slate-500">{displayValue(item.item_type)}</td>
                        <td className="px-4 py-3 text-right">{item.quantity ?? '-'}</td>
                        <td className="px-4 py-3 text-right">{formatPrice(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatPrice(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">金額</h2>
            <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
              {([
                ['小計', quote.subtotal_amount],
                ['消費税', quote.tax_amount],
                ['値引き', quote.discount_amount],
                ['下取り額', quote.trade_in_amount],
              ] as [string, number | null][]).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-bold text-slate-500">{label}</p>
                  <p className="mt-1 font-semibold text-slate-950">{formatPrice(value)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-700">見積合計</p>
              <p className="mt-1 text-2xl font-black text-blue-700">{formatPrice(quote.total_amount)}</p>
            </div>
          </section>

          {quote.customer_note && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-950">顧客向け備考</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{quote.customer_note}</p>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
