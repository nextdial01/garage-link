'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ContextHelp from '@/components/ContextHelp';
import ResponsiveDetailPanel from '@/components/ResponsiveDetailPanel';
import { getGarageUiContext } from '@/lib/store/garageUiContext';
import { createClient } from '@/lib/supabase/client';

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

function daysInStock(vehicle: VehicleRow): number | null {
  const base = vehicle.purchase_date ?? (vehicle.created_at ? vehicle.created_at.slice(0, 10) : null);
  if (!base) return null;
  const ms = Date.now() - new Date(`${base}T00:00:00`).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function expectedProfit(vehicle: VehicleRow): number | null {
  const listing = vehicle.listing_price ?? vehicle.total_price ?? null;
  if (listing === null || vehicle.purchase_price === null || vehicle.purchase_price === undefined) return null;
  return listing - vehicle.purchase_price;
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
    case '納車済み':
      return 'bg-slate-100 text-slate-700 ring-slate-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function formatMileage(value: number | null) {
  if (value === null) return '-';
  return `${value.toLocaleString()}km`;
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString()}円`;
}

function vehicleTitle(vehicle: VehicleRow) {
  return `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || vehicle.management_no || '車両';
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
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  useEffect(() => {
    async function loadVehicles() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const context = await getGarageUiContext();
        if (!context.storeId) throw new Error('所属店舗が見つかりません。');

        const { data, error } = await supabase
          .from<VehicleRow>('vehicles')
          .select(
            'id, management_no, maker, model_name, model_year, mileage_km, total_price, base_price, status, location_name, deleted_at, is_archived, purchase_price, purchase_date, listing_price, market_value, market_source, market_checked_at, created_at'
          )
          .eq('store_id', context.storeId)
          .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);

        setVehicles((data ?? []).filter((vehicle) => !vehicle.deleted_at && vehicle.is_archived !== true));

        const { data: listingData, error: listingError } = await supabase
          .from<ListingStatusRow>('vehicle_listing_statuses')
          .select('vehicle_id, channel, status, error_message')
          .eq('store_id', context.storeId);

        if (listingError) {
          setListingStatusError('媒体掲載状況はまだ設定されていません。');
          setListingStatuses([]);
        } else {
          setListingStatuses(listingData ?? []);
        }

        setLongStayThreshold(context.longStayThresholdDays);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '車両一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadVehicles();
  }, []);

  const listingByVehicle = useMemo(() => {
    const result = new Map<string, ListingStatusRow[]>();
    listingStatuses.forEach((item) => result.set(item.vehicle_id, [...(result.get(item.vehicle_id) ?? []), item]));
    return result;
  }, [listingStatuses]);

  const filteredVehicles = useMemo(() => {
    let result = vehicles;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (vehicle) =>
          (vehicle.maker ?? '').toLowerCase().includes(q) ||
          (vehicle.model_name ?? '').toLowerCase().includes(q) ||
          (vehicle.management_no ?? '').toLowerCase().includes(q) ||
          (vehicle.location_name ?? '').toLowerCase().includes(q),
      );
    }

    if (statusFilter) {
      result = result.filter((vehicle) => vehicle.status === statusFilter);
    }

    if (longStayOnly) {
      result = result.filter((vehicle) => {
        const days = daysInStock(vehicle);
        return days !== null && days > longStayThreshold;
      });
    }

    return [...result].sort((a, b) => {
      const score = (vehicle: VehicleRow) => {
        const statuses = listingByVehicle.get(vehicle.id) ?? [];
        const hasListingError = statuses.some((item) => item.status === 'エラー');
        const isPublishedAfterSale = ['売約済み', '納車済み'].includes(vehicle.status ?? '') && statuses.some((item) => item.status === '掲載中');
        const marketMissing = vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at;
        const longStay = (daysInStock(vehicle) ?? 0) > longStayThreshold;
        return (isPublishedAfterSale ? 1000 : 0) + (hasListingError ? 500 : 0) + (marketMissing ? 50 : 0) + (longStay ? 20 : 0);
      };

      return score(b) - score(a);
    });
  }, [listingByVehicle, longStayOnly, longStayThreshold, searchQuery, statusFilter, vehicles]);

  const stats = useMemo(() => {
    const attentionCount = vehicles.filter((vehicle) => {
      const statuses = listingByVehicle.get(vehicle.id) ?? [];
      return statuses.some((item) => item.status === 'エラー')
        || (['売約済み', '納車済み'].includes(vehicle.status ?? '') && statuses.some((item) => item.status === '掲載中'))
        || vehicle.market_value == null
        || !vehicle.market_source
        || !vehicle.market_checked_at
        || (daysInStock(vehicle) ?? 0) > longStayThreshold;
    }).length;

    return [
      { label: '総在庫', value: vehicles.length, detail: '登録済み車両' },
      { label: '展示中', value: vehicles.filter((vehicle) => vehicle.status === '展示中').length, detail: '公開中の在庫' },
      { label: '長期在庫', value: vehicles.filter((vehicle) => (daysInStock(vehicle) ?? 0) > longStayThreshold).length, detail: `${longStayThreshold}日超え` },
      { label: '要確認', value: attentionCount, detail: '掲載・相場・長期滞留' },
    ];
  }, [listingByVehicle, longStayThreshold, vehicles]);

  const selectedVehicle = useMemo(
    () => filteredVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [filteredVehicles, selectedVehicleId],
  );

  function renderAttentionBadges(vehicle: VehicleRow) {
    const status = vehicle.status ?? '未設定';
    const listingItems = listingByVehicle.get(vehicle.id) ?? [];
    const listingError = listingItems.some((item) => item.status === 'エラー');
    const publishedAfterSale = ['売約済み', '納車済み'].includes(status) && listingItems.some((item) => item.status === '掲載中');
    const marketMissing = vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at;
    const isLongStay = (daysInStock(vehicle) ?? 0) > longStayThreshold;

    return (
      <div className="flex max-w-[280px] flex-wrap gap-1">
        {publishedAfterSale && <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-black text-red-700">売約後も掲載中</span>}
        {listingError && <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-black text-red-700">掲載エラー</span>}
        {marketMissing && <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">相場未確認</span>}
        {isLongStay && <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">長期滞留</span>}
        {!publishedAfterSale && !listingError && !marketMissing && !isLongStay && (
          <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-black text-green-700">通常</span>
        )}
      </div>
    );
  }

  return (
    <AppShell
      activeLabel="車両管理"
      title="車両"
      description="長期在庫、掲載エラー、売約後掲載中の車両を上から確認できます"
      actionButton={
        <Link href="/vehicles/new" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
          車両を登録
        </Link>
      }
    >
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{stat.value}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">{stat.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-200 p-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-amber-900">要確認</p>
                <ContextHelp title="要確認" description="掲載エラー、売約後も掲載中、相場未確認、長期在庫を優先表示します。" />
              </div>
              {listingStatusError && <p className="mt-2 text-xs font-bold text-amber-700">{listingStatusError}</p>}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-[140px] shrink-0">
                <h3 className="text-base font-bold">車両一覧</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {searchQuery || statusFilter || longStayOnly ? `${filteredVehicles.length}件 / 全${vehicles.length}件` : `全${vehicles.length}件`}
                </p>
              </div>

              <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-[minmax(220px,1fr)_auto_auto]">
                <input
                  type="text"
                  placeholder="メーカー・車種・管理番号で検索"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full min-w-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="">全ステータス</option>
                  <option value="展示中">展示中</option>
                  <option value="商談中">商談中</option>
                  <option value="整備中">整備中</option>
                  <option value="売約済み">売約済み</option>
                  <option value="納車済み">納車済み</option>
                </select>

                <label className="inline-flex min-w-0 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 sm:col-span-2 xl:col-span-1">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={longStayOnly} onChange={(event) => setLongStayOnly(event.target.checked)} />
                  長期在庫のみ（{longStayThreshold}日超）
                </label>
              </div>
            </div>
          </div>

          {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

          {isLoading ? (
            <p className="p-5 text-sm text-slate-500">読み込み中...</p>
          ) : vehicles.length === 0 && !errorMessage ? (
            <p className="p-5 text-sm font-semibold text-slate-500">まだ車両が登録されていません</p>
          ) : filteredVehicles.length === 0 ? (
            <p className="p-5 text-sm font-semibold text-slate-500">条件に一致する車両がありません</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredVehicles.map((vehicle) => {
                const price = vehicle.total_price ?? vehicle.base_price;
                const profit = expectedProfit(vehicle);
                const days = daysInStock(vehicle);
                const status = vehicle.status ?? '未設定';

                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-blue-50/50"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-950">{vehicleTitle(vehicle)}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {vehicle.management_no ?? '-'} / {vehicle.location_name ?? '保管場所未設定'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {renderAttentionBadges(vehicle)}
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(status)}`}>{status}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
                      <div>
                        <p className="text-xs font-bold text-slate-400">販売価格</p>
                        <p className="mt-1 font-bold text-slate-900">{formatPrice(price)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400">見込み粗利</p>
                        <p className={`mt-1 font-bold ${profit !== null && profit < 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatPrice(profit)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400">在庫日数</p>
                        <p className={`mt-1 font-bold ${(days ?? 0) > longStayThreshold ? 'text-amber-700' : 'text-slate-900'}`}>{days !== null ? `${days}日` : '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400">走行距離</p>
                        <p className="mt-1 font-bold text-slate-900">{formatMileage(vehicle.mileage_km)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ResponsiveDetailPanel
          open={Boolean(selectedVehicle)}
          title={selectedVehicle ? vehicleTitle(selectedVehicle) : '車両概要'}
          subtitle={selectedVehicle?.management_no ?? '管理番号'}
          onClose={() => setSelectedVehicleId(null)}
        >
          {selectedVehicle && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-400">販売価格</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{formatPrice(selectedVehicle.total_price ?? selectedVehicle.base_price)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-400">見込み粗利</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{formatPrice(expectedProfit(selectedVehicle))}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400">要確認</p>
                <div className="mt-2">{renderAttentionBadges(selectedVehicle)}</div>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">仕入価格</dt>
                  <dd className="font-bold text-slate-900">{formatPrice(selectedVehicle.purchase_price)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">希望売価</dt>
                  <dd className="font-bold text-slate-900">{formatPrice(selectedVehicle.listing_price)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">在庫日数</dt>
                  <dd className="font-bold text-slate-900">{daysInStock(selectedVehicle) !== null ? `${daysInStock(selectedVehicle)}日` : '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">相場確認</dt>
                  <dd className="font-bold text-slate-900">
                    {selectedVehicle.market_value != null && selectedVehicle.market_source && selectedVehicle.market_checked_at
                      ? `${formatPrice(selectedVehicle.market_value)} / ${selectedVehicle.market_source}`
                      : '未確認'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">保管場所</dt>
                  <dd className="font-bold text-slate-900">{selectedVehicle.location_name ?? '-'}</dd>
                </div>
              </dl>

              <div className="flex flex-col gap-3">
                <Link href={`/vehicles/${selectedVehicle.id}`} className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white">
                  車両詳細を開く
                </Link>
                <Link href="/settings/store" className="rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">
                  長期在庫の閾値を変える
                </Link>
              </div>
            </div>
          )}
        </ResponsiveDetailPanel>
      </div>
    </AppShell>
  );
}
