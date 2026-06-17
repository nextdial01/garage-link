'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };

type VehicleRow = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  base_price: number | null;
  total_price: number | null;
  status: string | null;
  location_name: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  line_friend_status: string | null;
  delivery_permission: string | boolean | null;
};

type DealRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  title: string | null;
  status: string | null;
  probability: string | null;
  source: string | null;
  next_action_at: string | null;
  assigned_user_name: string | null;
};

type QuoteRow = {
  id: string;
  status: string | null;
  issue_status?: string | null;
  total_amount: number | null;
};

type InvoiceRow = {
  id: string;
  status: string | null;
  issue_status: string | null;
  total_amount: number | null;
  unpaid_amount: number | null;
};

type MaintenanceRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  job_no: string | null;
  job_type: string | null;
  status: string | null;
  scheduled_delivery_at: string | null;
  next_inspection_date: string | null;
  assigned_user_name: string | null;
};

type LineFriendRow = {
  id: string;
  customer_id: string | null;
  line_display_name: string | null;
  friend_status: string | null;
  delivery_permission: boolean | null;
  tag_names: string[] | null;
};

type LineLogRow = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  message_type: string | null;
  title: string | null;
  send_status: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type IdRow = { id: string };

const statusLabels: Record<string, string> = {
  draft: '下書き',
  issued: '発行済み',
  sent: '送付済み',
  approved: '承認済み',
  cancelled: '取消',
  lost: '失注',
  expired: '期限切れ',
  pending: '送信待ち',
  failed: '失敗',
  friend: '友だち',
  blocked: 'ブロック',
  unknown: '不明',
  received: '受付済み',
  estimating: '見積中',
  waiting: '作業待ち',
  working: '作業中',
  completed: '完了',
  delivered: '納車済み',
};

function labelValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return '未設定';
  if (typeof value === 'boolean') return value ? '許可' : '不許可';
  return statusLabels[String(value)] ?? String(value);
}

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function formatCurrency(value: number | null | undefined) {
  return `${(value ?? 0).toLocaleString()}円`;
}

function isDeliveryAllowed(value: string | boolean | null | undefined) {
  return value === true || value === '許可' || value === 'true' || value === 'allowed';
}

function isWithinDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const end = new Date();
  end.setDate(now.getDate() + days);
  return target >= now && target <= end;
}

function isOverdue(value: string | null | undefined) {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  return target < new Date();
}

function countBy<T>(rows: T[], getValue: (row: T) => string | number | boolean | null | undefined) {
  return rows.reduce<Record<string, number>>((result, row) => {
    const key = labelValue(getValue(row));
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

function sumBy<T>(rows: T[], getValue: (row: T) => number | null | undefined) {
  return rows.reduce((total, row) => total + (getValue(row) ?? 0), 0);
}

function vehicleLabel(vehicle: VehicleRow | undefined) {
  if (!vehicle) return '-';
  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '-';
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h3 className="text-base font-bold text-slate-950">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function KpiCard({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'blue' | 'green' | 'red' | 'yellow' }) {
  const toneClass = {
    default: 'text-slate-950',
    blue: 'text-blue-700',
    green: 'text-green-700',
    red: 'text-red-700',
    yellow: 'text-yellow-700',
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function BreakdownList({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">データがありません</p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map(([label, count]) => (
            <div key={label} className="flex items-center gap-3">
              <p className="w-32 truncate text-sm text-slate-700">{label}</p>
              <div className="h-2 flex-1 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(8, (count / max) * 100)}%` }} />
              </div>
              <p className="w-10 text-right text-sm font-bold text-slate-900">{count}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataTable({ headers, children, empty }: { headers: string[]; children: React.ReactNode; empty?: boolean }) {
  if (empty) {
    return <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">データがありません</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [lineFriends, setLineFriends] = useState<LineFriendRow[]>([]);
  const [lineLogs, setLineLogs] = useState<LineLogRow[]>([]);
  const [lineTags, setLineTags] = useState<IdRow[]>([]);
  const [lineTemplates, setLineTemplates] = useState<IdRow[]>([]);
  const [lineSteps, setLineSteps] = useState<IdRow[]>([]);
  const [lineCampaigns, setLineCampaigns] = useState<IdRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
        const storeId = member.store_id;

        async function safeRows<T extends { id: string }>(table: string, columns: string): Promise<T[]> {
          const { data, error } = await supabase.from<T>(table).select(columns).eq('store_id', storeId);
          if (error) return [];
          return data ?? [];
        }

        const [
          vehicleRows,
          customerRows,
          dealRows,
          quoteRows,
          invoiceRows,
          maintenanceRows,
          lineFriendRows,
          lineLogRows,
          lineTagRows,
          lineTemplateRows,
          lineStepRows,
          lineCampaignRows,
        ] = await Promise.all([
          safeRows<VehicleRow>('vehicles', 'id, management_no, maker, model_name, base_price, total_price, status, location_name'),
          safeRows<CustomerRow>('customers', 'id, name, phone, email, line_user_id, line_display_name, line_friend_status, delivery_permission'),
          safeRows<DealRow>('deals', 'id, customer_id, vehicle_id, title, status, probability, source, next_action_at, assigned_user_name'),
          safeRows<QuoteRow>('quotes', 'id, status, issue_status, total_amount'),
          safeRows<InvoiceRow>('invoices', 'id, status, issue_status, total_amount, unpaid_amount'),
          safeRows<MaintenanceRow>('maintenance_jobs', 'id, customer_id, vehicle_id, job_no, job_type, status, scheduled_delivery_at, next_inspection_date, assigned_user_name'),
          safeRows<LineFriendRow>('line_friends', 'id, customer_id, line_display_name, friend_status, delivery_permission, tag_names'),
          safeRows<LineLogRow>('line_message_logs', 'id, customer_id, line_user_id, line_display_name, message_type, title, send_status, error_message, sent_at, created_at'),
          safeRows<IdRow>('line_tags', 'id'),
          safeRows<IdRow>('line_templates', 'id'),
          safeRows<IdRow>('line_steps', 'id'),
          safeRows<IdRow>('line_campaigns', 'id'),
        ]);

        setVehicles(vehicleRows);
        setCustomers(customerRows);
        setDeals(dealRows);
        setQuotes(quoteRows);
        setInvoices(invoiceRows);
        setMaintenance(maintenanceRows);
        setLineFriends(lineFriendRows);
        setLineLogs(lineLogRows);
        setLineTags(lineTagRows);
        setLineTemplates(lineTemplateRows);
        setLineSteps(lineStepRows);
        setLineCampaigns(lineCampaignRows);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '分析データの取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadAnalytics();
  }, []);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const vehicleStatusCounts = useMemo(() => countBy(vehicles, (vehicle) => vehicle.status), [vehicles]);
  const vehicleMakerCounts = useMemo(() => countBy(vehicles, (vehicle) => vehicle.maker), [vehicles]);
  const vehicleLocationCounts = useMemo(() => countBy(vehicles, (vehicle) => vehicle.location_name), [vehicles]);
  const vehiclePriceCounts = useMemo(() => countBy(vehicles, (vehicle) => {
    const price = vehicle.total_price ?? vehicle.base_price ?? 0;
    if (price < 500000) return '〜50万円';
    if (price < 1000000) return '50〜100万円';
    if (price < 2000000) return '100〜200万円';
    return '200万円〜';
  }), [vehicles]);

  const dealStatusCounts = useMemo(() => countBy(deals, (deal) => deal.status), [deals]);
  const dealProbabilityCounts = useMemo(() => countBy(deals, (deal) => deal.probability), [deals]);
  const dealSourceCounts = useMemo(() => countBy(deals, (deal) => deal.source), [deals]);
  const upcomingDeals = useMemo(() => deals.filter((deal) => isWithinDays(deal.next_action_at, 7)).sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at))).slice(0, 8), [deals]);
  const overdueDeals = useMemo(() => deals.filter((deal) => isOverdue(deal.next_action_at) && deal.status !== '成約' && deal.status !== '失注'), [deals]);

  const maintenanceStatusCounts = useMemo(() => countBy(maintenance, (job) => job.status), [maintenance]);
  const maintenanceTypeCounts = useMemo(() => countBy(maintenance, (job) => job.job_type), [maintenance]);
  const upcomingInspections = useMemo(() => maintenance.filter((job) => isWithinDays(job.next_inspection_date, 30)).slice(0, 8), [maintenance]);
  const workingJobs = useMemo(() => maintenance.filter((job) => job.status === 'working' || job.status === '作業中').slice(0, 8), [maintenance]);
  const nearDeliveryJobs = useMemo(() => maintenance.filter((job) => isWithinDays(job.scheduled_delivery_at, 14)).sort((a, b) => String(a.scheduled_delivery_at).localeCompare(String(b.scheduled_delivery_at))).slice(0, 8), [maintenance]);

  const lineFriendStatusCounts = useMemo(() => countBy(lineFriends, (friend) => friend.friend_status), [lineFriends]);
  const lineDeliveryCounts = useMemo(() => countBy(lineFriends, (friend) => friend.delivery_permission), [lineFriends]);
  const lineSendStatusCounts = useMemo(() => countBy(lineLogs, (log) => log.send_status), [lineLogs]);
  const recentLineLogs = useMemo(() => [...lineLogs].sort((a, b) => String(b.sent_at ?? b.created_at).localeCompare(String(a.sent_at ?? a.created_at))).slice(0, 8), [lineLogs]);

  const quoteStatusCounts = useMemo(() => countBy(quotes, (quote) => quote.issue_status ?? quote.status), [quotes]);
  const invoiceStatusCounts = useMemo(() => countBy(invoices, (invoice) => invoice.issue_status ?? invoice.status), [invoices]);

  const kpis = [
    { label: '在庫車両数', value: vehicles.length },
    { label: '展示中車両数', value: vehicles.filter((vehicle) => vehicle.status === '展示中').length },
    { label: '商談中車両数', value: vehicles.filter((vehicle) => vehicle.status === '商談中').length },
    { label: '売約済み車両数', value: vehicles.filter((vehicle) => vehicle.status === '売約済み').length },
    { label: '整備中車両数', value: vehicles.filter((vehicle) => vehicle.status === '整備中').length },
    { label: '顧客数', value: customers.length },
    { label: 'LINE連携済み顧客数', value: customers.filter((customer) => customer.line_user_id || customer.line_display_name).length },
    { label: '配信許可顧客数', value: customers.filter((customer) => isDeliveryAllowed(customer.delivery_permission)).length },
    { label: '商談数', value: deals.length },
    { label: '新規商談数', value: deals.filter((deal) => deal.status === '新規').length },
    { label: '進行中商談数', value: deals.filter((deal) => ['連絡済み', '来店予定', '見積済み', '商談中'].includes(deal.status ?? '')).length },
    { label: '成約商談数', value: deals.filter((deal) => deal.status === '成約').length, tone: 'green' as const },
    { label: '失注商談数', value: deals.filter((deal) => deal.status === '失注').length, tone: 'red' as const },
    { label: '見積書数', value: quotes.length },
    { label: '発行済み見積書数', value: quotes.filter((quote) => quote.issue_status === 'issued' || quote.status === 'sent').length },
    { label: '請求書数', value: invoices.length },
    { label: '発行済み請求書数', value: invoices.filter((invoice) => invoice.issue_status === 'issued' || invoice.status === 'sent').length },
    { label: '整備・車検案件数', value: maintenance.length },
    { label: '作業中案件数', value: maintenance.filter((job) => job.status === 'working' || job.status === '作業中').length },
    { label: '完了案件数', value: maintenance.filter((job) => job.status === 'completed' || job.status === '完了').length },
    { label: '次回点検予定あり件数', value: maintenance.filter((job) => Boolean(job.next_inspection_date)).length },
    { label: 'LINE友だち数', value: lineFriends.length },
    { label: 'LINE配信許可数', value: lineFriends.filter((friend) => friend.delivery_permission).length },
    { label: 'ブロック数', value: lineFriends.filter((friend) => friend.friend_status === 'blocked').length, tone: 'red' as const },
    { label: 'LINE送信ログ数', value: lineLogs.length },
    { label: '送信失敗数', value: lineLogs.filter((log) => log.send_status === 'failed').length, tone: 'red' as const },
  ];

  return (
    <AppShell
      activeLabel="分析"
      title="分析"
      description="車両・顧客・商談・整備・LINEの状況を実データで確認します"
    >
      <div className="space-y-6">
        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {isLoading && <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</p>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} tone={kpi.tone} />
          ))}
        </div>

        <Section title="車両分析" description="ステータス、メーカー、保管場所、価格帯ごとの車両数です。">
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownList title="車両ステータス別件数" rows={vehicleStatusCounts} />
            <BreakdownList title="メーカー別件数" rows={vehicleMakerCounts} />
            <BreakdownList title="保管場所別件数" rows={vehicleLocationCounts} />
            <BreakdownList title="価格帯別件数" rows={vehiclePriceCounts} />
          </div>
        </Section>

        <Section title="商談分析" description="商談の進捗、確度、流入元、次回対応の状況です。">
          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            <BreakdownList title="商談ステータス別件数" rows={dealStatusCounts} />
            <BreakdownList title="商談確度別件数" rows={dealProbabilityCounts} />
            <BreakdownList title="流入元別件数" rows={dealSourceCounts} />
          </div>
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <KpiCard label="今後7日以内の次回対応" value={upcomingDeals.length} tone="blue" />
            <KpiCard label="期限超過の次回対応" value={overdueDeals.length} tone="red" />
          </div>
          <h4 className="mb-3 text-sm font-bold text-slate-800">次回対応が近い商談</h4>
          <DataTable headers={['商談タイトル', '顧客名', '対象車両', 'ステータス', '次回対応日', '担当者']} empty={upcomingDeals.length === 0}>
            {upcomingDeals.map((deal) => (
              <tr key={deal.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold"><Link href={`/deals/${deal.id}`} className="text-blue-700 hover:underline">{displayValue(deal.title)}</Link></td>
                <td className="px-4 py-3">{displayValue(customerMap.get(deal.customer_id ?? '')?.name)}</td>
                <td className="px-4 py-3">{vehicleLabel(vehicleMap.get(deal.vehicle_id ?? ''))}</td>
                <td className="px-4 py-3">{displayValue(deal.status)}</td>
                <td className="px-4 py-3">{formatDate(deal.next_action_at)}</td>
                <td className="px-4 py-3">{displayValue(deal.assigned_user_name)}</td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <Section title="整備・車検分析" description="整備案件のステータス、種別、納車予定を確認します。">
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <BreakdownList title="ステータス別件数" rows={maintenanceStatusCounts} />
            <BreakdownList title="種別別件数" rows={maintenanceTypeCounts} />
          </div>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <KpiCard label="今後30日以内の次回点検予定" value={upcomingInspections.length} tone="blue" />
            <KpiCard label="作業中案件" value={workingJobs.length} tone="yellow" />
            <KpiCard label="納車予定が近い案件" value={nearDeliveryJobs.length} tone="green" />
          </div>
          <h4 className="mb-3 text-sm font-bold text-slate-800">納車予定が近い案件</h4>
          <DataTable headers={['受付番号', '顧客名', '対象車両', 'ステータス', '納車予定', '担当者']} empty={nearDeliveryJobs.length === 0}>
            {nearDeliveryJobs.map((job) => (
              <tr key={job.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold"><Link href={`/maintenance/${job.id}`} className="text-blue-700 hover:underline">{displayValue(job.job_no)}</Link></td>
                <td className="px-4 py-3">{displayValue(customerMap.get(job.customer_id ?? '')?.name)}</td>
                <td className="px-4 py-3">{vehicleLabel(vehicleMap.get(job.vehicle_id ?? ''))}</td>
                <td className="px-4 py-3">{labelValue(job.status)}</td>
                <td className="px-4 py-3">{formatDate(job.scheduled_delivery_at)}</td>
                <td className="px-4 py-3">{displayValue(job.assigned_user_name)}</td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <Section title="LINE分析" description="LINE友だち、配信許可、タグ、テンプレート、送信ログを確認します。">
          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            <BreakdownList title="友だち状態別件数" rows={lineFriendStatusCounts} />
            <BreakdownList title="配信許可 / 不許可件数" rows={lineDeliveryCounts} />
            <BreakdownList title="送信ログ 成功 / 失敗件数" rows={lineSendStatusCounts} />
          </div>
          <div className="mb-5 grid gap-4 sm:grid-cols-4">
            <KpiCard label="タグ数" value={lineTags.length} />
            <KpiCard label="テンプレート数" value={lineTemplates.length} />
            <KpiCard label="シナリオ数" value={lineSteps.length} />
            <KpiCard label="一斉配信数" value={lineCampaigns.length} />
          </div>
          <h4 className="mb-3 text-sm font-bold text-slate-800">直近のLINE送信ログ</h4>
          <DataTable headers={['送信日時', '顧客名', 'LINE表示名', 'メッセージ種別', '送信状態', 'エラー']} empty={recentLineLogs.length === 0}>
            {recentLineLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">{formatDate(log.sent_at ?? log.created_at)}</td>
                <td className="px-4 py-3">{displayValue(customerMap.get(log.customer_id ?? '')?.name)}</td>
                <td className="px-4 py-3">{displayValue(log.line_display_name)}</td>
                <td className="px-4 py-3">{displayValue(log.message_type)}</td>
                <td className="px-4 py-3">{labelValue(log.send_status)}</td>
                <td className="px-4 py-3 text-red-700">{displayValue(log.error_message)}</td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <Section title="帳票分析" description="見積書・請求書のステータスと金額を確認します。">
          <div className="mb-5 grid gap-4 lg:grid-cols-2">
            <BreakdownList title="見積書ステータス別件数" rows={quoteStatusCounts} />
            <BreakdownList title="請求書ステータス別件数" rows={invoiceStatusCounts} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard label="見積合計金額" value={formatCurrency(sumBy(quotes, (quote) => quote.total_amount))} tone="blue" />
            <KpiCard label="請求合計金額" value={formatCurrency(sumBy(invoices, (invoice) => invoice.total_amount))} tone="green" />
            <KpiCard label="未入金合計" value={formatCurrency(sumBy(invoices, (invoice) => invoice.unpaid_amount))} tone="red" />
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
