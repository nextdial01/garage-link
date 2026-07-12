'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  total_price: number | null;
  base_price: number | null;
  status: string | null;
  location_name: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  listing_price?: number | null;
  market_value?: number | null;
  market_source?: string | null;
  market_checked_at?: string | null;
  created_at?: string | null;
};

type ListingStatusRow = {
  vehicle_id: string;
  channel: string;
  status: string;
  error_message: string | null;
};

const LONG_STAY_DEFAULT = 90;
function daysInStock(v: VehicleRow): number | null {
  const base = v.purchase_date ?? (v.created_at ? v.created_at.slice(0, 10) : null);
  if (!base) return null;
  const ms = Date.now() - new Date(`${base}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}
function expectedProfit(v: VehicleRow): number | null {
  const list = v.listing_price ?? v.total_price ?? null;
  if (list === null || v.purchase_price === null || v.purchase_price === undefined) return null;
  return list - v.purchase_price;
}

function getStatusClass(status: string) {
  switch (status) {
    case '展示中':
    case 'in_stock':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case '商談中':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case '整備中':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '売約済み':
      return 'bg-slate-100 text-slate-700 ring-slate-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function formatMileage(value: number | null) {
  if (value === null) {
    return '-';
  }

  return `${value.toLocaleString()}km`;
}

function formatPrice(value: number | null) {
  if (value === null) {
    return '-';
  }

  return `${value.toLocaleString()}円`;
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [longStayOnly, setLongStayOnly] = useState(false);
  const [longStayThreshold, setLongStayThreshold] = useState(LONG_STAY_DEFAULT);
  const [listingStatuses, setListingStatuses] = useState<ListingStatusRow[]>([]);
  const [listingStatusError, setListingStatusError] = useState('');

  useEffect(() => {
    async function loadVehicles() {
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
          .from<VehicleRow>('vehicles')
          .select(
            'id, management_no, maker, model_name, model_year, mileage_km, total_price, base_price, status, location_name, deleted_at, is_archived, purchase_price, purchase_date, listing_price, created_at'
          )
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setVehicles((data ?? []).filter((vehicle) => !vehicle.deleted_at && vehicle.is_archived !== true));

        const { data: listingData, error: listingError } = await supabase
          .from<ListingStatusRow>('vehicle_listing_statuses')
          .select('vehicle_id, channel, status, error_message')
          .eq('store_id', member.store_id);
        if (listingError) {
          // 媒体連携未設定でも、車両一覧自体は止めない。
          setListingStatusError('媒体掲載状況はまだ設定されていません。');
          setListingStatuses([]);
        } else {
          setListingStatuses(listingData ?? []);
        }

        // 長期滞留閾値（自店舗のみ。RLSで店舗越境なし）
        const { data: storeRow } = await supabase
          .from<{ long_stay_threshold_days: number | null }>('stores')
          .select('long_stay_threshold_days')
          .eq('id', member.store_id)
          .single();
        setLongStayThreshold(storeRow?.long_stay_threshold_days ?? LONG_STAY_DEFAULT);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '車両一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadVehicles();
  }, []);

  const stats = useMemo(() => {
    const displayCount = vehicles.filter((vehicle) => vehicle.status === '展示中').length;
    const dealCount = vehicles.filter((vehicle) => vehicle.status === '商談中').length;
    const maintenanceCount = vehicles.filter((vehicle) => vehicle.status === '整備中').length;

    return [
      { label: '総在庫', value: vehicles.length },
      { label: '展示中', value: displayCount },
      { label: '商談中', value: dealCount },
      { label: '整備中', value: maintenanceCount },
    ];
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    let result = vehicles;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (v) =>
          (v.maker ?? '').toLowerCase().includes(q) ||
          (v.model_name ?? '').toLowerCase().includes(q) ||
          (v.management_no ?? '').toLowerCase().includes(q) ||
          (v.location_name ?? '').toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      result = result.filter((v) => v.status === statusFilter);
    }
    if (longStayOnly) {
      result = result.filter((v) => {
        const d = daysInStock(v);
        return d !== null && d > longStayThreshold;
      });
    }
    const statusMap = new Map<string, ListingStatusRow[]>();
    listingStatuses.forEach((item) => statusMap.set(item.vehicle_id, [...(statusMap.get(item.vehicle_id) ?? []), item]));
    return [...result].sort((a, b) => {
      const riskScore = (vehicle: VehicleRow) => {
        const statuses = statusMap.get(vehicle.id) ?? [];
        const hasListingError = statuses.some((item) => item.status === 'エラー');
        const isPublishedAfterSale = ['売約済み', '納車済み'].includes(vehicle.status ?? '') && statuses.some((item) => item.status === '掲載中');
        const marketMissing = vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at;
        const longStay = (daysInStock(vehicle) ?? 0) > longStayThreshold;
        return (isPublishedAfterSale ? 1000 : 0) + (hasListingError ? 500 : 0) + (marketMissing ? 50 : 0) + (longStay ? 20 : 0);
      };
      return riskScore(b) - riskScore(a);
    });
  }, [vehicles, searchQuery, statusFilter, longStayOnly, longStayThreshold, listingStatuses]);

  const listingByVehicle = useMemo(() => {
    const result = new Map<string, ListingStatusRow[]>();
    listingStatuses.forEach((item) => result.set(item.vehicle_id, [...(result.get(item.vehicle_id) ?? []), item]));
    return result;
  }, [listingStatuses]);

  const attentionCount = useMemo(() => vehicles.filter((vehicle) => {
    const statuses = listingByVehicle.get(vehicle.id) ?? [];
    return statuses.some((item) => item.status === 'エラー')
      || (['売約済み', '納車済み'].includes(vehicle.status ?? '') && statuses.some((item) => item.status === '掲載中'))
      || vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at;
  }).length, [vehicles, listingByVehicle]);

  return (
    <AppShell
      activeLabel="車両管理"
      title="車両管理"
      description="車両台帳・在庫ステータス・保管場所を管理します"
      actionButton={
        <Link
          href="/vehicles/new"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          車両を登録
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

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-black text-amber-900">要確認 {attentionCount}件</p>
        <p className="mt-1 text-sm text-amber-800">掲載エラー、売約後も掲載中、相場未確認の車両を上から表示しています。</p>
        {listingStatusError && <p className="mt-2 text-xs font-bold text-amber-700">{listingStatusError}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold">車両一覧</h3>
            <p className="mt-1 text-sm text-slate-500">
              {searchQuery || statusFilter
                ? `${filteredVehicles.length}件 / 全${vehicles.length}件`
                : `全${vehicles.length}件`}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="車種・メーカーで検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 sm:w-64"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">全ステータス</option>
              <option value="展示中">展示中</option>
              <option value="商談中">商談中</option>
              <option value="整備中">整備中</option>
              <option value="売約済み">売約済み</option>
            </select>

            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={longStayOnly} onChange={(e) => setLongStayOnly(e.target.checked)} />
              長期滞留のみ（{longStayThreshold}日超）
            </label>
          </div>
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : vehicles.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            まだ車両が登録されていません
          </p>
        ) : filteredVehicles.length === 0 ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            条件に一致する車両がありません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">管理番号</th>
                  <th className="px-5 py-4">メーカー</th>
                  <th className="px-5 py-4">車名</th>
                  <th className="px-5 py-4">年式</th>
                  <th className="px-5 py-4">走行距離</th>
                  <th className="px-5 py-4">販売価格</th>
                  <th className="px-5 py-4 text-right">仕入価格</th>
                  <th className="px-5 py-4 text-right">希望売価</th>
                  <th className="px-5 py-4 text-right">見込み粗利</th>
                  <th className="px-5 py-4 text-right">在庫日数</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">要確認</th>
                  <th className="px-5 py-4">保管場所</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredVehicles.map((vehicle) => {
                  const status = vehicle.status ?? '未設定';
                  const price = vehicle.total_price ?? vehicle.base_price;
                  const days = daysInStock(vehicle);
                  const isLongStay = days !== null && days > longStayThreshold;
                  const profit = expectedProfit(vehicle);
                  const listingItems = listingByVehicle.get(vehicle.id) ?? [];
                  const listingError = listingItems.some((item) => item.status === 'エラー');
                  const publishedAfterSale = ['売約済み', '納車済み'].includes(status) && listingItems.some((item) => item.status === '掲載中');
                  const marketMissing = vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at;

                  return (
                    <tr key={vehicle.id} className={`hover:bg-blue-50/50 ${publishedAfterSale || listingError ? 'bg-red-50/70' : isLongStay || marketMissing ? 'bg-amber-50/60' : ''}`}>
                      <td className="px-5 py-4 font-semibold">
                        {vehicle.management_no ?? '-'}
                      </td>
                      <td className="px-5 py-4">{vehicle.maker ?? '-'}</td>
                      <td className="px-5 py-4 font-bold text-slate-950">
                        {vehicle.model_name ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        {vehicle.model_year ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-[190px] flex-wrap gap-1">
                          {publishedAfterSale && <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-black text-red-700">売約後も掲載中</span>}
                          {listingError && <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-black text-red-700">掲載エラー</span>}
                          {marketMissing && <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">相場未確認</span>}
                          {isLongStay && <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">長期滞留</span>}
                          {!publishedAfterSale && !listingError && !marketMissing && !isLongStay && <span className="text-xs font-bold text-green-700">確認不要</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {formatMileage(vehicle.mileage_km)}
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {formatPrice(price)}
                      </td>
                      <td className="px-5 py-4 text-right">{vehicle.purchase_price != null ? formatPrice(vehicle.purchase_price) : '-'}</td>
                      <td className="px-5 py-4 text-right">{vehicle.listing_price != null ? formatPrice(vehicle.listing_price) : '-'}</td>
                      <td className={`px-5 py-4 text-right font-bold ${profit != null && profit < 0 ? 'text-red-700' : 'text-slate-700'}`}>{profit != null ? formatPrice(profit) : '-'}</td>
                      <td className={`px-5 py-4 text-right ${isLongStay ? 'font-bold text-amber-700' : ''}`}>{days !== null ? `${days}日` : '-'}</td>
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
                        {vehicle.location_name ?? '-'}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/vehicles/${vehicle.id}`}
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
