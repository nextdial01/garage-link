'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  line_friend_status: string | null;
  desired_model: string | null;
  budget_min: number | null;
  budget_max: number | null;
  customer_status: string | null;
  next_action_date: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

function getStatusClass(status: string) {
  switch (status) {
    case '新規':
    case '見込み':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case '既存':
    case '購入済み':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case '商談中':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '失注':
    case '対応不要':
      return 'bg-slate-100 text-slate-700 ring-slate-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function formatBudget(min: number | null, max: number | null) {
  if (min === null && max === null) {
    return '-';
  }

  if (min !== null && max !== null) {
    return `${min.toLocaleString()}〜${max.toLocaleString()}円`;
  }

  if (min !== null) {
    return `${min.toLocaleString()}円〜`;
  }

  return `〜${max?.toLocaleString()}円`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadCustomers() {
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
          .from<CustomerRow>('customers')
          .select(
            'id, name, phone, mobile_phone, email, line_friend_status, desired_model, budget_min, budget_max, customer_status, next_action_date, deleted_at, is_archived'
          )
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setCustomers((data ?? []).filter((customer) => !customer.deleted_at && customer.is_archived !== true));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '顧客一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadCustomers();
  }, []);

  const stats = useMemo(() => {
    const lineFriends = customers.filter(
      (customer) => customer.line_friend_status === '友だち'
    ).length;
    const deals = customers.filter(
      (customer) => customer.customer_status === '商談中'
    ).length;
    const purchased = customers.filter(
      (customer) => customer.customer_status === '購入済み'
    ).length;

    return [
      { label: '顧客数', value: customers.length },
      { label: 'LINE友だち', value: lineFriends },
      { label: '商談中', value: deals },
      { label: '購入済み', value: purchased },
    ];
  }, [customers]);

  return (
    <AppShell
      activeLabel="顧客管理"
      title="顧客管理"
      description="顧客情報・LINE友だち・商談状況を一元管理します"
      actionButton={
        <Link
          href="/customers/new"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          顧客を登録
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
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold">顧客一覧</h3>
            <p className="mt-1 text-sm text-slate-500">
              登録済みの顧客を一覧で確認できます。{customers.length}件
            </p>
          </div>

          <input
            type="text"
            placeholder="顧客名で検索"
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 md:w-64"
          />
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : customers.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            まだ顧客が登録されていません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">電話番号</th>
                  <th className="px-5 py-4">メールアドレス</th>
                  <th className="px-5 py-4">LINE友だち状態</th>
                  <th className="px-5 py-4">希望車種</th>
                  <th className="px-5 py-4">予算</th>
                  <th className="px-5 py-4">顧客ステータス</th>
                  <th className="px-5 py-4">次回対応日</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => {
                  const status = customer.customer_status ?? '未設定';

                  return (
                    <tr key={customer.id} className="hover:bg-blue-50/50">
                      <td className="px-5 py-4 font-semibold">
                        {customer.name ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        {customer.mobile_phone ?? customer.phone ?? '-'}
                      </td>
                      <td className="px-5 py-4 text-blue-600">
                        {customer.email ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        {customer.line_friend_status ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        {customer.desired_model ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        {formatBudget(customer.budget_min, customer.budget_max)}
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
                        {customer.next_action_date ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          詳細
                        </Link>
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
