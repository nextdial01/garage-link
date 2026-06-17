'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type DealRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  deal_no: string | null;
  title: string | null;
  deal_type: string | null;
  status: string | null;
  probability: string | null;
  next_action_at: string | null;
  assigned_user_name: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

type VehicleRow = {
  id: string;
  maker: string | null;
  model_name: string | null;
  management_no: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

function getStatusClass(status: string) {
  switch (status) {
    case '新規':
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
    case '連絡済み':
    case '見積済み':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case '来店予定':
    case '商談中':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '成約':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case '失注':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  return value.replace('T', ' ').slice(0, 16);
}

function vehicleLabel(vehicle: VehicleRow | undefined) {
  if (!vehicle) {
    return '-';
  }

  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '-';
}

export default function DealsPage() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDeals() {
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

        const [dealResult, customerResult, vehicleResult] = await Promise.all([
          supabase
            .from<DealRow>('deals')
            .select(
              'id, customer_id, vehicle_id, deal_no, title, deal_type, status, probability, next_action_at, assigned_user_name, deleted_at, is_archived'
            )
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<CustomerRow>('customers')
            .select('id, name, deleted_at, is_archived')
            .eq('store_id', member.store_id),
          supabase
            .from<VehicleRow>('vehicles')
            .select('id, maker, model_name, management_no, deleted_at, is_archived')
            .eq('store_id', member.store_id),
        ]);

        if (dealResult.error) {
          throw new Error(dealResult.error.message);
        }

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        if (vehicleResult.error) {
          throw new Error(vehicleResult.error.message);
        }

        setDeals((dealResult.data ?? []).filter((deal) => !deal.deleted_at && deal.is_archived !== true));
        setCustomers((customerResult.data ?? []).filter((customer) => !customer.deleted_at && customer.is_archived !== true));
        setVehicles((vehicleResult.data ?? []).filter((vehicle) => !vehicle.deleted_at && vehicle.is_archived !== true));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '商談一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDeals();
  }, []);

  const customerMap = useMemo(() => {
    return new Map(customers.map((customer) => [customer.id, customer]));
  }, [customers]);

  const vehicleMap = useMemo(() => {
    return new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  }, [vehicles]);

  const stats = useMemo(() => {
    return [
      { label: '新規', value: deals.filter((deal) => deal.status === '新規').length },
      { label: '連絡済み', value: deals.filter((deal) => deal.status === '連絡済み').length },
      { label: '来店予定', value: deals.filter((deal) => deal.status === '来店予定').length },
      { label: '成約', value: deals.filter((deal) => deal.status === '成約').length },
    ];
  }, [deals]);

  return (
    <AppShell
      activeLabel="商談管理"
      title="商談管理"
      description="顧客との商談進捗を追跡・管理します"
      actionButton={
        <Link
          href="/deals/new"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          商談を登録
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
          <h3 className="text-base font-bold">商談一覧</h3>
          <p className="mt-1 text-sm text-slate-500">
            進行中の商談を一覧で確認できます。{deals.length}件
          </p>
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : deals.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            まだ商談が登録されていません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">商談番号</th>
                  <th className="px-5 py-4">商談タイトル</th>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">対象車両</th>
                  <th className="px-5 py-4">商談種別</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">確度</th>
                  <th className="px-5 py-4">次回対応日</th>
                  <th className="px-5 py-4">担当者</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {deals.map((deal) => {
                  const status = deal.status ?? '未設定';
                  const customer = deal.customer_id
                    ? customerMap.get(deal.customer_id)
                    : undefined;
                  const vehicle = deal.vehicle_id
                    ? vehicleMap.get(deal.vehicle_id)
                    : undefined;

                  return (
                    <tr key={deal.id} className="hover:bg-blue-50/50">
                      <td className="px-5 py-4 font-semibold">
                        {deal.deal_no ?? '-'}
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-950">
                        {deal.title ?? '-'}
                      </td>
                      <td className="px-5 py-4">{customer?.name ?? '-'}</td>
                      <td className="px-5 py-4">{vehicleLabel(vehicle)}</td>
                      <td className="px-5 py-4">{deal.deal_type ?? '-'}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(
                            status
                          )}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-4">{deal.probability ?? '-'}</td>
                      <td className="px-5 py-4">
                        {formatDateTime(deal.next_action_at)}
                      </td>
                      <td className="px-5 py-4">
                        {deal.assigned_user_name ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/deals/${deal.id}`}
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
