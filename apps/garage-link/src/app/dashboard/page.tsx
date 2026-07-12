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
  status: string | null;
  location_name: string | null;
  total_price: number | null;
  purchase_date?: string | null;
  market_value?: number | null;
  market_source?: string | null;
  market_checked_at?: string | null;
  created_at: string | null;
};

type DealRow = {
  id: string;
  deal_no: string | null;
  title: string | null;
  status: string | null;
  probability: string | null;
  assigned_user_name: string | null;
  next_action_at: string | null;
  created_at: string | null;
};

type MaintenanceRow = {
  id: string;
  reception_no: string | null;
  job_type: string | null;
  status: string | null;
  scheduled_delivery_at: string | null;
  assigned_user_name: string | null;
};

type InventoryRow = {
  id: string;
  count_no: string | null;
  name: string | null;
  status: string | null;
  planned_date: string | null;
};

type VehicleDashboardSummary = {
  vehicles: VehicleRow[];
  deals: DealRow[];
  maintenanceJobs: MaintenanceRow[];
  inventoryCounts: InventoryRow[];
};

type ListingStatusRow = { vehicle_id: string; channel: string; status: string };

const emptySummary: VehicleDashboardSummary = {
  vehicles: [],
  deals: [],
  maintenanceJobs: [],
  inventoryCounts: [],
};

function formatCurrency(value: number | null | undefined) {
  if (!value) return '0円';
  return `${value.toLocaleString('ja-JP')}円`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return value.slice(0, 10);
}

function vehicleLabel(vehicle: VehicleRow) {
  const label = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return label || vehicle.management_no || '-';
}

function countBy<T>(items: T[], getter: (item: T) => string | null | undefined) {
  return items.reduce<Record<string, number>>((result, item) => {
    const key = getter(item) || '未設定';
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function StatusBadge({ value, tone = 'blue' }: { value: string | null | undefined; tone?: 'blue' | 'green' | 'orange' | 'slate' }) {
  const classes = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    green: 'bg-green-50 text-green-700 ring-green-100',
    orange: 'bg-orange-50 text-orange-700 ring-orange-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${classes[tone]}`}>
      {value || '未設定'}
    </span>
  );
}

function KpiCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 h-1.5 w-12 rounded-full ${accent}`} />
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-400">{detail}</p>
    </section>
  );
}

function ActionCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
          →
        </span>
      </div>
    </Link>
  );
}

function SummaryList({ title, items, emptyLabel }: { title: string; items: Record<string, number>; emptyLabel: string }) {
  const entries = Object.entries(items);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">{emptyLabel}</p>
        ) : (
          entries.slice(0, 6).map(([label, count]) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-sm font-bold text-slate-700">{label}</span>
              <span className="text-sm font-black text-blue-700">{count}件</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type InventoryMetrics = {
  inventory_total_cost: number;
  expected_gross_profit: number;
  long_stay_count: number;
  avg_days_in_stock: number;
  in_stock_count: number;
  sold_this_month_count: number;
  realized_gross_profit_this_month: number;
  long_stay_threshold_days: number;
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<VehicleDashboardSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<InventoryMetrics | null>(null);
  const [metricsError, setMetricsError] = useState('');
  const [todayKey] = useState(() => new Date().toISOString().slice(0, 10));
  const [listingStatuses, setListingStatuses] = useState<ListingStatusRow[]>([]);

  useEffect(() => {
    async function loadSummary() {
      setIsLoading(true);

      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user?.id) return;

        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();

        if (!member?.store_id) return;

        const [vehicles, deals, maintenanceJobs, inventoryCounts, listingStatuses] = await Promise.all([
          supabase
            .from<VehicleRow>('vehicles')
            .select('id, management_no, maker, model_name, status, location_name, total_price, purchase_date, market_value, market_source, market_checked_at, created_at')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<DealRow>('deals')
            .select('id, deal_no, title, status, probability, assigned_user_name, next_action_at, created_at')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<MaintenanceRow>('maintenance_jobs')
            .select('id, reception_no, job_type, status, scheduled_delivery_at, assigned_user_name')
            .eq('store_id', member.store_id),
          supabase
            .from<InventoryRow>('inventory_counts')
            .select('id, count_no, name, status, planned_date')
            .eq('store_id', member.store_id),
          supabase
            .from<ListingStatusRow>('vehicle_listing_statuses')
            .select('vehicle_id, channel, status')
            .eq('store_id', member.store_id),
        ]);

        setSummary({
          vehicles: vehicles.data ?? [],
          deals: deals.data ?? [],
          maintenanceJobs: maintenanceJobs.data ?? [],
          inventoryCounts: inventoryCounts.data ?? [],
        });
        setListingStatuses(listingStatuses.data ?? []);
        // 在庫指標（041 RPC・サーバ側集計・店舗スコープ）
        const metricsResult = await supabase.rpc('inventory_dashboard_metrics', { p_store_id: member.store_id });
        if (metricsResult.error) setMetricsError('在庫指標の取得に失敗しました。');
        else setMetrics((metricsResult.data as unknown) as InventoryMetrics);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSummary();
  }, []);

  const vehicleStatus = useMemo(() => countBy(summary.vehicles, (vehicle) => vehicle.status), [summary.vehicles]);
  const dealStatus = useMemo(() => countBy(summary.deals, (deal) => deal.status), [summary.deals]);
  const maintenanceStatus = useMemo(() => countBy(summary.maintenanceJobs, (job) => job.status), [summary.maintenanceJobs]);
  const monthlySales = useMemo(
    () => summary.vehicles.filter((vehicle) => vehicle.status === '売約済み' || vehicle.status === '納車済み').reduce((total, vehicle) => total + (vehicle.total_price ?? 0), 0),
    [summary.vehicles]
  );
  const inStockCount = summary.vehicles.filter((vehicle) => vehicle.status === '在庫中' || vehicle.status === '展示中').length;
  const maintenanceCount = summary.vehicles.filter((vehicle) => vehicle.status === '整備中').length + summary.maintenanceJobs.filter((job) => job.status === '作業中').length;
  const activeDeals = summary.deals.filter((deal) => !['成約', '失注'].includes(deal.status ?? '')).length;
  const wonDeals = summary.deals.filter((deal) => deal.status === '成約').length;
  const todayActions = useMemo(() => {
    const today = todayKey;
    const tomorrow = new Date(`${todayKey}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    const vehicleMap = new Map(summary.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const actions: Array<{ title: string; detail: string; href: string; tone: 'red' | 'amber' | 'blue' }> = [];
    summary.deals.filter((deal) => deal.next_action_at && deal.next_action_at.slice(0, 10) <= today && !['成約', '失注'].includes(deal.status ?? '')).slice(0, 4).forEach((deal) => actions.push({ title: '商談に対応', detail: `${deal.title ?? deal.deal_no ?? '商談'}の次回対応日です`, href: `/deals/${deal.id}`, tone: 'red' }));
    summary.maintenanceJobs.filter((job) => job.scheduled_delivery_at && job.scheduled_delivery_at.slice(0, 10) <= tomorrowKey && !['完了', '納車済み'].includes(job.status ?? '')).slice(0, 3).forEach((job) => actions.push({ title: '整備予定を確認', detail: `${job.reception_no ?? '整備案件'}の納車予定を確認`, href: `/maintenance/${job.id}`, tone: 'blue' }));
    summary.vehicles.filter((vehicle) => vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at).slice(0, 3).forEach((vehicle) => actions.push({ title: '相場を確認', detail: `${vehicleLabel(vehicle)}は相場未確認`, href: `/vehicles/${vehicle.id}`, tone: 'amber' }));
    listingStatuses.filter((item) => item.status === 'エラー').slice(0, 3).forEach((item) => { const vehicle = vehicleMap.get(item.vehicle_id); if (vehicle) actions.push({ title: '掲載エラーを確認', detail: `${vehicleLabel(vehicle)}の${item.channel}掲載`, href: `/vehicles/${vehicle.id}`, tone: 'red' }); });
    return actions.slice(0, 8);
  }, [summary, listingStatuses, todayKey]);

  return (
    <AppShell
      activeLabel="ダッシュボード"
      title="車両管理ダッシュボード"
      description="在庫、商談、整備、棚卸しの状況を確認します。LINE管理情報は表示しません。"
      actionButton={
        <Link href="/vehicles/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
          車両を登録
        </Link>
      }
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black text-blue-700">Vehicle Operations</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">車両販売業務の現在地</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                入庫、販売、商談、整備、棚卸しを一画面で把握し、次の作業へすぐ移動できます。
              </p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-bold text-slate-400">確認状態</p>
              <p className="mt-1 text-sm font-black text-slate-800">{isLoading ? '読み込み中' : '最新データを表示中'}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div><h3 className="text-base font-black text-slate-950">今日やること</h3><p className="mt-1 text-sm text-slate-500">期限が近いもの、止まっているものから表示します。</p></div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{todayActions.length}件</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {todayActions.map((action, index) => <Link key={`${action.href}-${index}`} href={action.href} className={`rounded-xl border px-4 py-3 transition hover:shadow-sm ${action.tone === 'red' ? 'border-red-200 bg-red-50/60' : action.tone === 'amber' ? 'border-amber-200 bg-amber-50/60' : 'border-blue-200 bg-blue-50/50'}`}><p className="text-sm font-black text-slate-950">{action.title}</p><p className="mt-1 text-xs font-semibold text-slate-600">{action.detail}</p></Link>)}
            {todayActions.length === 0 && <p className="rounded-xl bg-green-50 px-4 py-4 text-sm font-bold text-green-800">今日の対応はありません。</p>}
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="総在庫台数" value={`${summary.vehicles.length}`} detail="登録済み車両" accent="bg-blue-600" />
          <KpiCard label="入庫中" value={`${inStockCount}`} detail="在庫中・展示中" accent="bg-sky-500" />
          <KpiCard label="整備中" value={`${maintenanceCount}`} detail="車両/整備案件" accent="bg-orange-500" />
          <KpiCard label="今月の売上" value={formatCurrency(monthlySales)} detail="売約/納車済み合計" accent="bg-green-500" />
          <KpiCard label="商談中" value={`${activeDeals}`} detail="進行中商談" accent="bg-indigo-500" />
          <KpiCard label="成約数" value={`${wonDeals}`} detail="成約ステータス" accent="bg-emerald-500" />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-black text-slate-950">在庫利益・回転</h3>
            <p className="text-xs text-slate-500">長期滞留閾値: {metrics?.long_stay_threshold_days ?? 90}日（店舗設定）</p>
          </div>
          {metricsError ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{metricsError}</p>
          ) : !metrics ? (
            <p className="text-sm text-slate-500">読み込み中...</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <KpiCard label="在庫総額" value={formatCurrency(metrics.inventory_total_cost)} detail="仕入価格合計" accent="bg-blue-600" />
              <KpiCard label="見込み粗利" value={formatCurrency(metrics.expected_gross_profit)} detail="希望売価-仕入" accent="bg-emerald-500" />
              <KpiCard label="長期滞留台数" value={`${metrics.long_stay_count}`} detail="閾値超え在庫" accent="bg-amber-500" />
              <KpiCard label="平均在庫日数" value={`${metrics.avg_days_in_stock}日`} detail="現在の在庫" accent="bg-indigo-500" />
              <KpiCard label="当月販売台数" value={`${metrics.sold_this_month_count}`} detail="今月の販売実績" accent="bg-sky-500" />
              <KpiCard label="当月実現粗利" value={formatCurrency(metrics.realized_gross_profit_this_month)} detail="販売価格-仕入" accent="bg-green-500" />
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-black text-slate-950">最近の入庫車両</h3>
              <p className="mt-1 text-sm text-slate-500">直近で登録された車両を確認します。</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black text-slate-500">
                  <tr>
                    <th className="px-5 py-3">管理番号</th>
                    <th className="px-5 py-3">車両</th>
                    <th className="px-5 py-3">保管場所</th>
                    <th className="px-5 py-3">価格</th>
                    <th className="px-5 py-3">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.vehicles.slice(0, 6).map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-blue-50/50">
                      <td className="px-5 py-4 font-bold text-slate-700">{vehicle.management_no ?? '-'}</td>
                      <td className="px-5 py-4 font-black text-slate-950">{vehicleLabel(vehicle)}</td>
                      <td className="px-5 py-4 text-slate-600">{vehicle.location_name ?? '-'}</td>
                      <td className="px-5 py-4 text-right font-bold text-slate-700">{formatCurrency(vehicle.total_price)}</td>
                      <td className="px-5 py-4"><StatusBadge value={vehicle.status} /></td>
                    </tr>
                  ))}
                  {summary.vehicles.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-sm font-bold text-slate-400">データがありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-black text-slate-950">最近の商談</h3>
              <p className="mt-1 text-sm text-slate-500">次回対応日と担当者を確認します。</p>
            </div>
            <div className="divide-y divide-slate-100">
              {summary.deals.slice(0, 5).map((deal) => (
                <Link key={deal.id} href={`/deals/${deal.id}`} className="block px-5 py-4 transition hover:bg-blue-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{deal.title ?? deal.deal_no ?? '商談'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">担当: {deal.assigned_user_name ?? '-'} / 次回: {formatDate(deal.next_action_at)}</p>
                    </div>
                    <StatusBadge value={deal.status} tone="orange" />
                  </div>
                </Link>
              ))}
              {summary.deals.length === 0 && (
                <p className="px-5 py-8 text-center text-sm font-bold text-slate-400">データがありません</p>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <SummaryList title="車両ステータスサマリー" items={vehicleStatus} emptyLabel="車両データがありません" />
          <SummaryList title="商談ステータスサマリー" items={dealStatus} emptyLabel="商談データがありません" />
          <SummaryList title="整備・車検進捗" items={maintenanceStatus} emptyLabel="整備・車検データがありません" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <ActionCard title="車両一覧へ" description="在庫・販売車両を確認します。" href="/vehicles" />
          <ActionCard title="顧客管理へ" description="顧客情報と希望条件を確認します。" href="/customers" />
          <ActionCard title="商談管理へ" description="商談状況と次回対応を管理します。" href="/deals" />
          <ActionCard title="整備・車検へ" description="作業進捗と納車予定を確認します。" href="/maintenance" />
          <ActionCard title="棚卸しへ" description="在庫差異と棚卸し状況を確認します。" href="/inventory-counts" />
          <ActionCard title="分析へ" description="販売・商談・整備の集計を確認します。" href="/analytics" />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">棚卸し状況</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {summary.inventoryCounts.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-800">{item.name ?? item.count_no ?? '棚卸し'}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500">予定日: {formatDate(item.planned_date)}</p>
                <div className="mt-3"><StatusBadge value={item.status} tone="slate" /></div>
              </div>
            ))}
            {summary.inventoryCounts.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm font-bold text-slate-400">棚卸しデータがありません</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
