 'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ContextHelp from '@/components/ContextHelp';
import {
  InventoryAgeDonut,
  ManagementTrendChart,
  VehicleStatusBars,
  type ChartDatum,
} from '@/components/dashboard/DashboardCharts';
import { buildTodayActionItems, getTodayActionToneClass, type AttentionTone, type TodayActionItem } from '@/lib/dashboard/todayActions';
import { getGarageUiContext } from '@/lib/store/garageUiContext';
import { createClient } from '@/lib/supabase/client';
import {
  SALES_RECOGNITION_OPTIONS,
  type SalesRecognitionBasis,
  type PurchaseRecognitionBasis,
} from '@/lib/store/uiPreferences';

type StoreRow = {
  long_stay_threshold_days: number | null;
  management_target_gross_profit_yen: number | null;
  l_link_onboarding_completed_at: string | null;
  sales_recognition_basis: SalesRecognitionBasis | null;
  purchase_recognition_basis: PurchaseRecognitionBasis | null;
  business_type: string | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  status: string | null;
  location_name: string | null;
  total_price: number | null;
  listing_price: number | null;
  purchase_price: number | null;
  direct_cost_special: number | null;
  direct_cost_accessories: number | null;
  direct_cost_agency: number | null;
  direct_cost_legal: number | null;
  purchase_date: string | null;
  sale_price: number | null;
  sold_date: string | null;
  market_value: number | null;
  market_source: string | null;
  market_checked_at: string | null;
  created_at: string | null;
  is_archived?: boolean | null;
  deleted_at?: string | null;
};

type DealRow = {
  id: string;
  deal_no: string | null;
  title: string | null;
  status: string | null;
  assigned_user_name: string | null;
  next_action_at: string | null;
  created_at: string | null;
  vehicle_id: string | null;
};

type InvoiceRow = {
  id: string;
  vehicle_id: string | null;
  issue_date: string | null;
  issue_status: string | null;
  total_amount: number | null;
};

type MaintenanceRow = {
  id: string;
  reception_no: string | null;
  vehicle_id: string | null;
  job_type: string | null;
  status: string | null;
  scheduled_delivery_at: string | null;
  assigned_user_name: string | null;
};

type AppointmentRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  appointment_type: string | null;
  scheduled_at: string;
  status: string | null;
  assigned_user_name: string | null;
};

type InquiryRow = {
  id: string;
  customer_id: string | null;
  deal_id: string | null;
  answers: Record<string, unknown>;
  submitted_at: string | null;
  source_route: string | null;
  response_status: 'unhandled' | 'in_progress' | 'completed';
  assigned_user_name: string | null;
  next_action_at: string | null;
};

function inquiryAnswerLabel(answers: Record<string, unknown>) {
  const preferredKeys = ['問い合わせ内容', '相談内容', 'お問い合わせ内容', '内容', 'message', 'inquiry', 'question'];
  for (const key of preferredKeys) {
    const value = answers[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  }
  const value = Object.values(answers).find((item) => typeof item === 'string' && item.trim());
  return value ? String(value).slice(0, 80) : '回答内容を確認';
}

type CustomerRow = {
  id: string;
  name: string | null;
  next_action_date: string | null;
};

type ListingStatusRow = {
  vehicle_id: string;
  channel: string;
  status: string;
};

type DashboardState = {
  vehicles: VehicleRow[];
  deals: DealRow[];
  invoices: InvoiceRow[];
  maintenanceJobs: MaintenanceRow[];
  appointments: AppointmentRow[];
  inquiries: InquiryRow[];
  customers: CustomerRow[];
  listingStatuses: ListingStatusRow[];
};

type PeriodKey = 'this_month' | 'last_month' | 'last_3_months' | 'last_12_months';

type MetricCardData = {
  label: string;
  value: string;
  detail: string;
  deltaLabel: string;
  tone?: 'default' | 'good' | 'bad';
};

type ManagementSummary = {
  revenue: number | null;
  grossProfit: number | null;
  grossProfitRate: number | null;
  averageStockDays: number | null;
  salesCount: number;
  validGrossCount: number;
  missingGrossCount: number;
  inventoryTotalCost: number;
  inStockCount: number;
  longStayCount: number;
};

type PeriodRange = {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
};

type IndustryReference = {
  minRate: number;
  maxRate: number;
  label: string;
  source: string;
  year: string;
};

const INDUSTRY_REFERENCES: Partial<Record<string, IndustryReference>> = {
  '中古車販売中心': { minRate: 8, maxRate: 15, label: '中古車販売の初期参考帯', source: 'GARAGE LINK 初期参考帯', year: '2026年' },
  'バイク販売中心': { minRate: 10, maxRate: 18, label: 'バイク販売の初期参考帯', source: 'GARAGE LINK 初期参考帯', year: '2026年' },
  '整備中心': { minRate: 35, maxRate: 55, label: '整備中心店舗の初期参考帯', source: 'GARAGE LINK 初期参考帯', year: '2026年' },
  '鈑金・修理中心': { minRate: 30, maxRate: 50, label: '鈑金・修理の初期参考帯', source: 'GARAGE LINK 初期参考帯', year: '2026年' },
  '複合型': { minRate: 12, maxRate: 25, label: '複合型店舗の初期参考帯', source: 'GARAGE LINK 初期参考帯', year: '2026年' },
};

const emptyState: DashboardState = {
  vehicles: [],
  deals: [],
  invoices: [],
  maintenanceJobs: [],
  appointments: [],
  inquiries: [],
  customers: [],
  listingStatuses: [],
};

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'this_month', label: '今月' },
  { key: 'last_month', label: '前月' },
  { key: 'last_3_months', label: '直近3か月' },
  { key: 'last_12_months', label: '直近12か月' },
];

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value).toLocaleString('ja-JP')}円`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatDays(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value).toLocaleString('ja-JP')}日`;
}

function toJstDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function dateKeyJst(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
}

function todayKeyJst() {
  return dateKeyJst(new Date());
}

function deltaTone(value: number | null, higherIsBetter = true): 'default' | 'good' | 'bad' {
  if (value === null || value === 0) return 'default';
  if (higherIsBetter) return value > 0 ? 'good' : 'bad';
  return value < 0 ? 'good' : 'bad';
}

function formatDelta(value: number | null, formatter: (value: number) => string, higherIsBetter = true) {
  if (value === null || Number.isNaN(value) || value === 0) {
    return { label: '前期間比 ±0', tone: 'default' as const };
  }

  const sign = value > 0 ? '+' : '-';
  return {
    label: `前期間比 ${sign}${formatter(Math.abs(value))}`,
    tone: deltaTone(value, higherIsBetter),
  };
}

function formatDeltaPercent(value: number | null, higherIsBetter = true) {
  if (value === null || Number.isNaN(value) || value === 0) {
    return { label: '前期間比 ±0.0pt', tone: 'default' as const };
  }

  const sign = value > 0 ? '+' : '-';
  return {
    label: `前期間比 ${sign}${Math.abs(value).toFixed(1)}pt`,
    tone: deltaTone(value, higherIsBetter),
  };
}

function isInStockVehicle(vehicle: VehicleRow) {
  return !vehicle.deleted_at
    && !vehicle.is_archived
    && !['売約済み', 'sold', '納車済み', '廃車', 'scrapped'].includes(vehicle.status ?? '');
}

function getPeriodRange(key: PeriodKey, now = new Date()): PeriodRange {
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  if (key === 'this_month') {
    return {
      start: thisMonthStart,
      end: thisMonthEnd,
      previousStart: addMonths(thisMonthStart, -1),
      previousEnd: endOfMonth(addMonths(thisMonthStart, -1)),
    };
  }

  if (key === 'last_month') {
    const start = addMonths(thisMonthStart, -1);
    return {
      start,
      end: endOfMonth(start),
      previousStart: addMonths(start, -1),
      previousEnd: endOfMonth(addMonths(start, -1)),
    };
  }

  if (key === 'last_3_months') {
    const start = addMonths(thisMonthStart, -2);
    return {
      start,
      end: thisMonthEnd,
      previousStart: addMonths(start, -3),
      previousEnd: endOfMonth(addMonths(start, -1)),
    };
  }

  const start = addMonths(thisMonthStart, -11);
  return {
    start,
    end: thisMonthEnd,
    previousStart: addMonths(start, -12),
    previousEnd: endOfMonth(addMonths(start, -1)),
  };
}

function isDateInRange(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  return date >= startOfDay(start) && date <= endOfDay(end);
}

function getSalesBasisLabel(value: SalesRecognitionBasis | null | undefined) {
  return SALES_RECOGNITION_OPTIONS.find((option) => option.value === value)?.label ?? '納車日';
}

function getVehiclePurchaseDate(vehicle: VehicleRow) {
  return toJstDate(vehicle.purchase_date ?? vehicle.created_at);
}

function getVehicleRevenue(vehicle: VehicleRow) {
  return vehicle.sale_price ?? vehicle.total_price ?? vehicle.listing_price ?? null;
}

function getVehicleDirectCostTotal(vehicle: VehicleRow) {
  return (vehicle.direct_cost_special ?? 0) + (vehicle.direct_cost_accessories ?? 0) + (vehicle.direct_cost_agency ?? 0) + (vehicle.direct_cost_legal ?? 0);
}

function getIndustryReference(businessType: string | null | undefined, salesBasis: SalesRecognitionBasis) {
  if (!businessType || salesBasis !== 'delivery') return null;
  return INDUSTRY_REFERENCES[businessType] ?? null;
}

function buildManagementSummary(
  range: { start: Date; end: Date },
  salesBasis: SalesRecognitionBasis,
  vehicles: VehicleRow[],
  deals: DealRow[],
  invoices: InvoiceRow[],
  longStayThreshold: number,
) {
  const inStockVehicles = vehicles.filter(isInStockVehicle);
  const today = startOfDay(new Date());
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const soldDealMap = new Map<string, DealRow>();

  deals
    .filter((deal) => deal.status === '成約' && deal.vehicle_id)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .forEach((deal) => {
      if (!deal.vehicle_id || soldDealMap.has(deal.vehicle_id)) return;
      soldDealMap.set(deal.vehicle_id, deal);
    });

  let revenue = 0;
  let grossProfit = 0;
  let revenueCount = 0;
  let validGrossCount = 0;
  let missingGrossCount = 0;
  let stockDaysTotal = 0;
  let stockDaysCount = 0;

  if (salesBasis === 'invoice') {
    invoices
      .filter((invoice) => invoice.issue_status !== 'draft' && isDateInRange(toJstDate(invoice.issue_date), range.start, range.end))
      .forEach((invoice) => {
        const invoiceRevenue = invoice.total_amount ?? null;
        if (invoiceRevenue !== null) {
          revenue += invoiceRevenue;
          revenueCount += 1;
        }

        const vehicle = invoice.vehicle_id ? vehicleMap.get(invoice.vehicle_id) : null;
        const purchasePrice = vehicle ? (vehicle.purchase_price ?? 0) + getVehicleDirectCostTotal(vehicle) : null;
        const purchaseDate = vehicle ? getVehiclePurchaseDate(vehicle) : null;
        const issueDate = toJstDate(invoice.issue_date);

        if (invoiceRevenue !== null && purchasePrice !== null) {
          grossProfit += invoiceRevenue - purchasePrice;
          validGrossCount += 1;
        } else {
          missingGrossCount += 1;
        }

        if (purchaseDate && issueDate) {
          stockDaysTotal += Math.max(0, Math.round((startOfDay(issueDate).getTime() - startOfDay(purchaseDate).getTime()) / 86400000));
          stockDaysCount += 1;
        }
      });
  } else {
    vehicles.forEach((vehicle) => {
      const basisDate =
        salesBasis === 'delivery'
          ? toJstDate(vehicle.sold_date)
          : toJstDate(soldDealMap.get(vehicle.id)?.created_at ?? null);

      if (!isDateInRange(basisDate, range.start, range.end)) return;

      const revenueValue = getVehicleRevenue(vehicle);
      if (revenueValue !== null) {
        revenue += revenueValue;
        revenueCount += 1;
      }

      const purchaseTotal = vehicle.purchase_price === null ? null : vehicle.purchase_price + getVehicleDirectCostTotal(vehicle);
      if (revenueValue !== null && purchaseTotal !== null) {
        grossProfit += revenueValue - purchaseTotal;
        validGrossCount += 1;
      } else {
        missingGrossCount += 1;
      }

      const purchaseDate = getVehiclePurchaseDate(vehicle);
      if (purchaseDate && basisDate) {
        stockDaysTotal += Math.max(0, Math.round((startOfDay(basisDate).getTime() - startOfDay(purchaseDate).getTime()) / 86400000));
        stockDaysCount += 1;
      }
    });
  }

  const inventoryTotalCost = inStockVehicles.reduce((sum, vehicle) => sum + (vehicle.purchase_price ?? 0) + getVehicleDirectCostTotal(vehicle), 0);
  const longStayCount = inStockVehicles.filter((vehicle) => {
    const purchaseDate = getVehiclePurchaseDate(vehicle);
    if (!purchaseDate) return false;
    const diff = Math.round((today.getTime() - startOfDay(purchaseDate).getTime()) / 86400000);
    return diff > longStayThreshold;
  }).length;

  return {
    revenue: revenueCount > 0 ? revenue : null,
    grossProfit: validGrossCount > 0 ? grossProfit : null,
    grossProfitRate: revenue > 0 && validGrossCount > 0 ? (grossProfit / revenue) * 100 : null,
    averageStockDays: stockDaysCount > 0 ? stockDaysTotal / stockDaysCount : null,
    salesCount: revenueCount,
    validGrossCount,
    missingGrossCount,
    inventoryTotalCost,
    inStockCount: inStockVehicles.length,
    longStayCount,
  } satisfies ManagementSummary;
}

function NumberCard({ label, value, detail, deltaLabel, tone = 'default' }: MetricCardData) {
  const toneClass =
    tone === 'good'
      ? 'text-green-700'
      : tone === 'bad'
        ? 'text-red-700'
        : 'text-slate-950';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-black text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p>
      <p className="mt-1 text-xs font-black text-slate-700">{deltaLabel}</p>
    </section>
  );
}

function KpiCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-black text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-400">{detail}</p>
    </section>
  );
}

function ImprovementCard({ title, detail, tone }: { title: string; detail: string; tone: AttentionTone }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${getTodayActionToneClass(tone)}`}>
      <p className="text-sm font-black text-slate-950">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardState>(emptyState);
  const [isLoading, setIsLoading] = useState(true);
  const [managementError, setManagementError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [role, setRole] = useState('');
  const [memberDisplayName, setMemberDisplayName] = useState('');
  const [storeInfo, setStoreInfo] = useState<StoreRow | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('this_month');
  const [isHydrated, setIsHydrated] = useState(false);
  const todayKey = todayKeyJst();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsHydrated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    async function loadSummary() {
      setIsLoading(true);
      setErrorMessage('');
      setManagementError('');

      try {
        const supabase = createClient();
        const context = await getGarageUiContext();
        if (!context.storeId) throw new Error('所属店舗が見つかりません。');

        setRole(context.role);
        setMemberDisplayName(context.displayName);

        const isManagementRole = context.role === 'owner' || context.role === 'admin';

        const [
          vehicles,
          deals,
          invoices,
          maintenanceJobs,
          appointments,
          inquiries,
          customers,
          listingStatuses,
          storeResult,
        ] = await Promise.all([
          supabase
            .from<VehicleRow>('vehicles')
            .select('id, management_no, maker, model_name, status, location_name, total_price, listing_price, purchase_price, direct_cost_special, direct_cost_accessories, direct_cost_agency, direct_cost_legal, purchase_date, sale_price, sold_date, market_value, market_source, market_checked_at, created_at, is_archived, deleted_at')
            .eq('store_id', context.storeId)
            .order('created_at', { ascending: false }),
          supabase
            .from<DealRow>('deals')
            .select('id, deal_no, title, status, assigned_user_name, next_action_at, created_at, vehicle_id')
            .eq('store_id', context.storeId)
            .order('created_at', { ascending: false }),
          isManagementRole
            ? supabase
                .from<InvoiceRow>('invoices')
                .select('id, vehicle_id, issue_date, issue_status, total_amount')
                .eq('store_id', context.storeId)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from<MaintenanceRow>('maintenance_jobs')
            .select('id, reception_no, vehicle_id, job_type, status, scheduled_delivery_at, assigned_user_name')
            .eq('store_id', context.storeId)
            .order('scheduled_delivery_at', { ascending: true }),
          supabase
            .from<AppointmentRow>('appointments')
            .select('id, customer_id, vehicle_id, appointment_type, scheduled_at, status, assigned_user_name')
            .eq('store_id', context.storeId)
            .order('scheduled_at', { ascending: true }),
          supabase
            .from<InquiryRow>('line_form_responses')
            .select('id, customer_id, deal_id, answers, submitted_at, source_route, response_status, assigned_user_name, next_action_at')
            .eq('store_id', context.storeId)
            .order('submitted_at', { ascending: false }),
          supabase
            .from<CustomerRow>('customers')
            .select('id, name, next_action_date')
            .eq('store_id', context.storeId),
          supabase
            .from<ListingStatusRow>('vehicle_listing_statuses')
            .select('vehicle_id, channel, status')
            .eq('store_id', context.storeId),
          supabase
            .from<StoreRow>('stores')
            .select(
              isManagementRole
                ? 'long_stay_threshold_days, management_target_gross_profit_yen, l_link_onboarding_completed_at, sales_recognition_basis, purchase_recognition_basis, business_type'
                : 'long_stay_threshold_days, l_link_onboarding_completed_at, business_type',
            )
            .eq('id', context.storeId)
            .single(),
        ]);

        setSummary({
          vehicles: vehicles.data ?? [],
          deals: deals.data ?? [],
          invoices: invoices.data ?? [],
          maintenanceJobs: maintenanceJobs.data ?? [],
          appointments: appointments.data ?? [],
          inquiries: inquiries.data ?? [],
          customers: customers.data ?? [],
          listingStatuses: listingStatuses.data ?? [],
        });

        if (storeResult.error) {
          setStoreInfo(null);
        } else {
          setStoreInfo(storeResult.data ?? null);
        }

        if (isManagementRole && invoices.error) {
          setManagementError('経営数字の取得に失敗しました。');
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'ダッシュボードの取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadSummary();
  }, []);

  const longStayThreshold = storeInfo?.long_stay_threshold_days ?? 90;
  const isManagementVisible = role === 'owner' || role === 'admin';
  const isLLinkConnected = Boolean(storeInfo?.l_link_onboarding_completed_at);
  const salesBasis = storeInfo?.sales_recognition_basis ?? 'delivery';
  const periodRange = useMemo(() => getPeriodRange(selectedPeriod), [selectedPeriod]);

  const soldListedCount = useMemo(() => {
    const publishedIds = new Set(
      summary.listingStatuses.filter((item) => item.status === '掲載中').map((item) => item.vehicle_id),
    );

    return summary.vehicles.filter((vehicle) => ['売約済み', '納車済み'].includes(vehicle.status ?? '') && publishedIds.has(vehicle.id)).length;
  }, [summary.listingStatuses, summary.vehicles]);

  const listingErrorCount = summary.listingStatuses.filter((item) => item.status === 'エラー').length;
  const marketMissingCount = summary.vehicles.filter((vehicle) => vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at).length;
  const overdueDealCount = summary.deals.filter((deal) => {
    const nextActionDate = deal.next_action_at?.slice(0, 10);
    return nextActionDate && nextActionDate < todayKey && !['成約', '失注'].includes(deal.status ?? '');
  }).length;
  const todayAppointmentCount = summary.appointments.filter((appointment) => appointment.scheduled_at.slice(0, 10) === todayKey).length;
  const upcomingMaintenanceCount = summary.maintenanceJobs.filter((job) => {
    const scheduledDate = job.scheduled_delivery_at?.slice(0, 10);
    return scheduledDate && scheduledDate <= todayKey && !['completed', 'delivered', '完了', '納車済み'].includes(job.status ?? '');
  }).length;

  const unhandledInquiryCount = summary.inquiries.filter((inquiry) => inquiry.response_status === 'unhandled').length;
  const inProgressInquiryCount = summary.inquiries.filter((inquiry) => inquiry.response_status === 'in_progress').length;
  const openInquiries = summary.inquiries.filter((inquiry) => inquiry.response_status !== 'completed');
  const openInquiryCount = openInquiries.length;
  const overdueInquiryCount = openInquiries.filter((inquiry) => inquiry.next_action_at && inquiry.next_action_at < new Date().toISOString()).length;
  const openInquiryPreview = [...openInquiries]
    .sort((a, b) => {
      if (a.next_action_at && b.next_action_at) return a.next_action_at.localeCompare(b.next_action_at);
      if (a.next_action_at) return -1;
      if (b.next_action_at) return 1;
      return (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '');
    })
    .slice(0, 3);

  const todayActions = useMemo<TodayActionItem[]>(
    () => buildTodayActionItems({
      appointments: summary.appointments,
      deals: summary.deals,
      maintenanceJobs: summary.maintenanceJobs,
      vehicles: summary.vehicles,
      listingStatuses: summary.listingStatuses,
      customers: summary.customers,
      todayKey,
      memberRole: role,
      memberDisplayName,
      longStayThresholdDays: longStayThreshold,
    }),
    [longStayThreshold, memberDisplayName, role, summary.appointments, summary.customers, summary.deals, summary.listingStatuses, summary.maintenanceJobs, summary.vehicles, todayKey],
  );

  const todayActionsPreview = todayActions.slice(0, 5);
  const urgentTodayActionCount = todayActions.filter((item) => item.status === 'urgent').length;

  const industryReference = useMemo(() => getIndustryReference(storeInfo?.business_type, salesBasis), [salesBasis, storeInfo?.business_type]);

  const currentManagement = useMemo(
    () =>
      buildManagementSummary(
        { start: periodRange.start, end: periodRange.end },
        salesBasis,
        summary.vehicles,
        summary.deals,
        summary.invoices,
        longStayThreshold,
      ),
    [longStayThreshold, periodRange.end, periodRange.start, salesBasis, summary.deals, summary.invoices, summary.vehicles],
  );

  const previousManagement = useMemo(
    () =>
      buildManagementSummary(
        { start: periodRange.previousStart, end: periodRange.previousEnd },
        salesBasis,
        summary.vehicles,
        summary.deals,
        summary.invoices,
        longStayThreshold,
      ),
    [longStayThreshold, periodRange.previousEnd, periodRange.previousStart, salesBasis, summary.deals, summary.invoices, summary.vehicles],
  );

  const inventoryAgeData = useMemo<ChartDatum[]>(() => {
    const buckets = [0, 0, 0, 0];
    const today = startOfDay(new Date());
    summary.vehicles.filter(isInStockVehicle).forEach((vehicle) => {
      const purchaseDate = getVehiclePurchaseDate(vehicle);
      if (!purchaseDate) {
        buckets[0] += 1;
        return;
      }
      const days = Math.max(0, Math.floor((today.getTime() - startOfDay(purchaseDate).getTime()) / 86400000));
      if (days <= 30) buckets[0] += 1;
      else if (days <= 60) buckets[1] += 1;
      else if (days <= 90) buckets[2] += 1;
      else buckets[3] += 1;
    });
    return [
      { label: '0〜30日', value: buckets[0], color: '#22c55e' },
      { label: '31〜60日', value: buckets[1], color: '#3b82f6' },
      { label: '61〜90日', value: buckets[2], color: '#f59e0b' },
      { label: '91日以上', value: buckets[3], color: '#ef4444' },
    ];
  }, [summary.vehicles]);

  const vehicleStatusData = useMemo<ChartDatum[]>(() => {
    const counts = new Map<string, number>([
      ['在庫中', 0],
      ['商談中', 0],
      ['整備中', 0],
      ['売約済み', 0],
      ['納車済み', 0],
    ]);
    summary.vehicles
      .filter((vehicle) => !vehicle.deleted_at && !vehicle.is_archived)
      .forEach((vehicle) => {
        const rawStatus = vehicle.status ?? '';
        const label = ['売約済み', 'sold'].includes(rawStatus)
          ? '売約済み'
          : ['納車済み', 'delivered'].includes(rawStatus)
            ? '納車済み'
            : ['商談中', 'negotiating'].includes(rawStatus)
              ? '商談中'
              : ['整備中', 'maintenance'].includes(rawStatus)
                ? '整備中'
                : '在庫中';
        counts.set(label, (counts.get(label) ?? 0) + 1);
      });
    return [
      { label: '在庫中', value: counts.get('在庫中') ?? 0, color: '#3b82f6' },
      { label: '商談中', value: counts.get('商談中') ?? 0, color: '#8b5cf6' },
      { label: '整備中', value: counts.get('整備中') ?? 0, color: '#f59e0b' },
      { label: '売約済み', value: counts.get('売約済み') ?? 0, color: '#14b8a6' },
      { label: '納車済み', value: counts.get('納車済み') ?? 0, color: '#64748b' },
    ];
  }, [summary.vehicles]);

  const managementTrendData = useMemo(
    () => Array.from({ length: 6 }, (_, index) => {
      const monthStart = addMonths(startOfMonth(new Date()), index - 5);
      const result = buildManagementSummary(
        { start: monthStart, end: endOfMonth(monthStart) },
        salesBasis,
        summary.vehicles,
        summary.deals,
        summary.invoices,
        longStayThreshold,
      );
      return {
        label: `${monthStart.getMonth() + 1}月`,
        revenue: result.revenue ?? 0,
        grossProfit: result.grossProfit ?? 0,
      };
    }),
    [longStayThreshold, salesBasis, summary.deals, summary.invoices, summary.vehicles],
  );

  const improvementPoints = useMemo(() => {
    const items: Array<{ title: string; detail: string; tone: AttentionTone }> = [];

    if (currentManagement.grossProfitRate !== null && currentManagement.grossProfitRate < 10) {
      items.push({
        title: '粗利率がかなり薄めです',
        detail: `${selectedPeriod === 'this_month' ? '今月' : '選択期間'}の粗利率は${formatPercent(currentManagement.grossProfitRate)}です。長期在庫 ${currentManagement.longStayCount}台の値付け見直しを先に行うのが安全です。`,
        tone: 'red',
      });
    }

    if (overdueDealCount > 0) {
      items.push({
        title: '商談の次回連絡が止まっています',
        detail: `${overdueDealCount}件の次回連絡予定日が過ぎています。まず今日の商談一覧で上から処理するのが早いです。`,
        tone: 'red',
      });
    }

    if (currentManagement.longStayCount > 0) {
      items.push({
        title: '長期在庫の見直し余地があります',
        detail: `${currentManagement.longStayCount}台が${longStayThreshold}日を超えています。価格見直し・掲載先確認・販促強化の順で見るのがおすすめです。`,
        tone: 'amber',
      });
    }

    if (soldListedCount > 0 || listingErrorCount > 0) {
      items.push({
        title: '掲載管理の改善余地があります',
        detail: `売約後掲載中 ${soldListedCount}台 / 掲載エラー ${listingErrorCount}件です。公開先の整理だけでも問い合わせ品質が上がります。`,
        tone: 'red',
      });
    }

    if (marketMissingCount > 0) {
      items.push({
        title: '相場確認が未完了の車両があります',
        detail: `${marketMissingCount}台で相場確認が未完了です。価格見直しの前に、相場金額と確認日を入れておくと判断しやすくなります。`,
        tone: 'amber',
      });
    }

    if (isLLinkConnected && openInquiryCount > 0) {
      items.push({
        title: '未完了の問い合わせがあります',
        detail: `${openInquiryCount}件が未対応または対応中です。担当者と次回対応日時を確認できます。`,
        tone: 'blue',
      });
    }

    if (items.length === 0 && upcomingMaintenanceCount > 0) {
      items.push({
        title: '整備・車検の期限確認が必要です',
        detail: `${upcomingMaintenanceCount}件が納車予定日を迎えているか過ぎています。整備タブで担当と進捗を合わせると安心です。`,
        tone: 'blue',
      });
    }

    if (items.length === 0) {
      items.push({
        title: '大きな滞留は見えていません',
        detail: '今日の対応と長期在庫、掲載管理は落ち着いています。次は粗利と回転を継続して見る段階です。',
        tone: 'blue',
      });
    }

    return items.slice(0, 3);
  }, [
    currentManagement.grossProfitRate,
    currentManagement.longStayCount,
    isLLinkConnected,
    listingErrorCount,
    longStayThreshold,
    marketMissingCount,
    overdueDealCount,
    selectedPeriod,
    soldListedCount,
    openInquiryCount,
    upcomingMaintenanceCount,
  ]);

  const targetDelta =
    storeInfo?.management_target_gross_profit_yen == null || currentManagement.grossProfit == null
      ? null
      : currentManagement.grossProfit - storeInfo.management_target_gross_profit_yen;

  const metricCards = useMemo<MetricCardData[]>(() => {
    const revenueDelta = formatDelta(
      currentManagement.revenue !== null && previousManagement.revenue !== null
        ? currentManagement.revenue - previousManagement.revenue
        : null,
      (value) => `${Math.round(value).toLocaleString('ja-JP')}円`,
    );

    const grossDelta = formatDelta(
      currentManagement.grossProfit !== null && previousManagement.grossProfit !== null
        ? currentManagement.grossProfit - previousManagement.grossProfit
        : null,
      (value) => `${Math.round(value).toLocaleString('ja-JP')}円`,
    );

    const grossRateDelta = formatDeltaPercent(
      currentManagement.grossProfitRate !== null && previousManagement.grossProfitRate !== null
        ? currentManagement.grossProfitRate - previousManagement.grossProfitRate
        : null,
    );

    const stockDaysDelta = formatDelta(
      currentManagement.averageStockDays !== null && previousManagement.averageStockDays !== null
        ? currentManagement.averageStockDays - previousManagement.averageStockDays
        : null,
      (value) => `${Math.round(value).toLocaleString('ja-JP')}日`,
      false,
    );

    return [
      {
        label: '売上',
        value: formatCurrency(currentManagement.revenue),
        detail: `${getSalesBasisLabel(salesBasis)}基準 / ${currentManagement.salesCount}件を集計`,
        deltaLabel: revenueDelta.label,
        tone: revenueDelta.tone,
      },
      {
        label: '粗利額',
        value: formatCurrency(currentManagement.grossProfit),
        detail:
          currentManagement.missingGrossCount > 0
            ? `暫定値 / 集計済み ${currentManagement.validGrossCount}件・入力不足 ${currentManagement.missingGrossCount}件`
            : `集計済み ${currentManagement.validGrossCount}件`,
        deltaLabel:
          targetDelta === null
            ? grossDelta.label
            : `目標差 ${targetDelta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(targetDelta))} / ${grossDelta.label}`,
        tone: targetDelta !== null ? deltaTone(targetDelta) : grossDelta.tone,
      },
      {
        label: '粗利率',
        value: formatPercent(currentManagement.grossProfitRate),
        detail: '※参考値 / 入力済みの直接原価を含みます',
        deltaLabel: grossRateDelta.label,
        tone: grossRateDelta.tone,
      },
      {
        label: '平均在庫日数',
        value: formatDays(currentManagement.averageStockDays),
        detail: `${getSalesBasisLabel(salesBasis)}までの日数平均`,
        deltaLabel: stockDaysDelta.label,
        tone: stockDaysDelta.tone,
      },
    ];
  }, [currentManagement, previousManagement, salesBasis, targetDelta]);

  return (
    <AppShell
      activeLabel="ダッシュボード"
      title="ホーム"
      description="今日の来店、商談、整備期限、在庫注意点をすぐ確認できます"
      actionButton={
        <Link href="/vehicles/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
          車両を登録
        </Link>
      }
    >
      {!isHydrated ? (
        <div data-testid="dashboard-hydration-fallback" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500 shadow-sm">
          ダッシュボードを読み込んでいます...
        </div>
      ) : (
        <div className="space-y-6">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">本日の状況</h2>
          <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
            <span>{todayKey}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{isLoading ? '読み込み中' : '最新'}</span>
          </div>
        </section>

        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-950">今日やること</h3>
              <ContextHelp title="今日やること" description="期限超過や本日対応など、優先度が高い業務から表示します。" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">緊急 {urgentTodayActionCount}件</span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">全{todayActions.length}件</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {todayActionsPreview.map((action) => (
              <Link key={action.id} href={action.href} className={`rounded-xl border px-4 py-3 transition hover:shadow-sm ${getTodayActionToneClass(action.tone)}`}>
                <p className="text-sm font-black text-slate-950">{action.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">{action.detail}</p>
              </Link>
            ))}
            {todayActionsPreview.length === 0 && (
              <p className="rounded-xl bg-green-50 px-4 py-4 text-sm font-bold text-green-800">今日の優先対応はありません。</p>
            )}
          </div>
          {todayActions.length > 5 && (
            <div className="mt-4">
              <Link href="/dashboard/today-actions" className="text-sm font-black text-blue-700 hover:underline">
                残り{todayActions.length - 5}件をすべて見る
              </Link>
            </div>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="今日の来店・試乗予約" value={`${todayAppointmentCount}件`} detail="当日の予約" />
          <KpiCard label="商談の次回連絡" value={`${overdueDealCount}件`} detail="期日超過" />
          <KpiCard label="車検・整備の期限" value={`${upcomingMaintenanceCount}件`} detail="今日までに確認" />
          <KpiCard label="長期在庫" value={`${currentManagement.longStayCount}台`} detail={`${longStayThreshold}日超えだけ表示`} />
          <KpiCard label="掲載・相場の要確認" value={`${listingErrorCount + soldListedCount + marketMissingCount}件`} detail="掲載エラー・売約後掲載・相場未確認" />
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <InventoryAgeDonut data={inventoryAgeData} thresholdDays={longStayThreshold} />
          <VehicleStatusBars data={vehicleStatusData} />
        </div>

        {isManagementVisible && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-950">改善ポイント</h3>
                <ContextHelp title="改善ポイント" description="経営数字、期限超過、長期在庫、掲載状況から、先に見直す項目を表示します。" />
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{improvementPoints.length}件</span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {improvementPoints.map((item) => (
                <ImprovementCard key={item.title} title={item.title} detail={item.detail} tone={item.tone} />
              ))}
            </div>
          </section>
        )}

        {isManagementVisible && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-950">経営数字</h3>
                <ContextHelp title="経営数字" description="売上基準と入力済みの直接原価から集計します。業界比較は店舗差があるため参考値です。" />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">オーナー・管理者限定</span>
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedPeriod(option.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                      selectedPeriod === option.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              <span className="rounded-full bg-slate-100 px-3 py-1">
                売上基準 {getSalesBasisLabel(salesBasis)}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1">
                目標粗利 {formatCurrency(storeInfo?.management_target_gross_profit_yen ?? null)}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1">
                長期在庫閾値 {longStayThreshold}日
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1">
                業態 {storeInfo?.business_type ?? '未設定'}
              </span>
            </div>

            {managementError ? (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{managementError}</p>
            ) : (
              <>
                <div className="mt-4">
                  <ManagementTrendChart data={managementTrendData} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {metricCards.map((card) => (
                    <NumberCard key={card.label} {...card} />
                  ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-900">集計状態</p>
                    <p className="mt-2 text-sm text-slate-600">
                      集計件数 {currentManagement.salesCount}件 / 粗利計算済み {currentManagement.validGrossCount}件 / 入力不足 {currentManagement.missingGrossCount}件
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-900">その他の数字</p>
                    <p className="mt-2 text-sm text-slate-600">
                      在庫総額 {formatCurrency(currentManagement.inventoryTotalCost)} / 在庫台数 {currentManagement.inStockCount}台
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-900">業界参考値</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {industryReference ? `${industryReference.label} ${industryReference.minRate.toFixed(1)}〜${industryReference.maxRate.toFixed(1)}%` : '条件が合う参考値がまだ未設定です'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {industryReference ? `${industryReference.source} / ${industryReference.year} / ※参考値` : '業態・基準が合うときだけ表示します'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-900">見方</p>
                    <p className="mt-2 text-sm text-slate-600">
                      店舗ごとの運用差があるため、粗利率の高低判定は参考値として見てください。
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {isLLinkConnected && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-950">L-LINK連携の問い合わせ</h3>
                <ContextHelp title="L-LINK連携の問い合わせ" description="L-LINK連携済み店舗だけに表示し、未完了の問い合わせを次回対応順に確認できます。" />
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">未完了 {openInquiryCount}件</span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <KpiCard label="未対応" value={`${unhandledInquiryCount}件`} detail="まだ対応を開始していない" />
              <KpiCard label="対応中" value={`${inProgressInquiryCount}件`} detail="担当者が対応中" />
              <KpiCard label="次回対応超過" value={`${overdueInquiryCount}件`} detail="予定日時を超えた未完了" />
            </div>
            <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {openInquiryPreview.length === 0 ? (
                <p className="px-4 py-5 text-sm font-bold text-slate-500">未完了の問い合わせはありません。</p>
              ) : openInquiryPreview.map((inquiry) => (
                <Link key={inquiry.id} href="/inquiries" className="flex flex-col gap-2 px-4 py-4 transition hover:bg-blue-50/60 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{inquiryAnswerLabel(inquiry.answers)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">担当: {inquiry.assigned_user_name ?? '未設定'} / 受付: {inquiry.submitted_at ? new Date(inquiry.submitted_at).toLocaleString('ja-JP') : '-'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs font-bold">
                    <span className={inquiry.response_status === 'in_progress' ? 'rounded-full bg-blue-50 px-2.5 py-1 text-blue-700' : 'rounded-full bg-amber-50 px-2.5 py-1 text-amber-800'}>{inquiry.response_status === 'in_progress' ? '対応中' : '未対応'}</span>
                    <span className={inquiry.next_action_at && inquiry.next_action_at < new Date().toISOString() ? 'text-red-700' : 'text-slate-500'}>次回: {inquiry.next_action_at ? new Date(inquiry.next_action_at).toLocaleString('ja-JP') : '未設定'}</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4 text-right"><Link href="/inquiries" className="text-sm font-bold text-blue-700 hover:underline">問い合わせ一覧を開く</Link></div>
          </section>
        )}

        </div>
      )}
    </AppShell>
  );
}
