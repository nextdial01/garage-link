'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import SoftDeleteButton from '@/components/SoftDeleteButton';
import {
  emptyTradeIn,
  TradeInSection,
  TradeInState,
  VehicleCandidate,
  VehicleReplacementSection,
} from '@/components/deals/DealFlowParts';
import { logAudit } from '@/lib/audit/logAudit';
import { createClient } from '@/lib/supabase/client';

type DealRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  deal_no: string | null;
  title: string | null;
  deal_type: string | null;
  status: string | null;
  probability: string | null;
  source: string | null;
  budget: number | null;
  trade_in_status: string | null;
  loan_request: string | null;
  next_action_at: string | null;
  assigned_user_name: string | null;
  line_status: string | null;
  memo: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  delivery_permission: string | boolean | null;
  customer_status: string | null;
  desired_model: string | null;
  budget_min: number | null;
  budget_max: number | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  registration_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  base_price: number | null;
  total_price: number | null;
  status: string | null;
  location_name: string | null;
};

type DealUpdate = {
  vehicle_id?: string | null;
  deal_no?: string | null;
  title?: string | null;
  deal_type?: string | null;
  status?: string | null;
  probability?: string | null;
  source?: string | null;
  budget?: number | null;
  trade_in_status?: string | null;
  loan_request?: string | null;
  next_action_at?: string | null;
  assigned_user_name?: string | null;
  line_status?: string | null;
  memo?: string | null;
};

type StoreMemberRow = {
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type QuoteHistoryRow = {
  id: string;
  quote_no: string | null;
  status: string | null;
  issue_status: string | null;
  issue_date: string | null;
  issued_at: string | null;
  total_amount: number | null;
};

type InvoiceHistoryRow = {
  id: string;
  invoice_no: string | null;
  status: string | null;
  issue_status: string | null;
  issue_date: string | null;
  payment_due_date: string | null;
  issued_at: string | null;
  total_amount: number | null;
};

type DocumentCancelUpdate = {
  issue_status: string;
  cancelled_at: string;
  cancel_reason: string;
};

type LineDraftRow = {
  id: string;
  message_type: string | null;
  title: string | null;
  status: string | null;
  scheduled_at: string | null;
  created_at: string | null;
};

type LineLogRow = {
  id: string;
  message_type: string | null;
  title: string | null;
  send_status: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type DealForm = {
  deal_no: string;
  title: string;
  deal_type: string;
  status: string;
  probability: string;
  source: string;
  budget: string;
  trade_in_status: string;
  loan_request: string;
  next_action_at: string;
  assigned_user_name: string;
  line_status: string;
  memo: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const emptyDealForm: DealForm = {
  deal_no: '',
  title: '',
  deal_type: '',
  status: '新規',
  probability: '',
  source: '',
  budget: '',
  trade_in_status: '',
  loan_request: '',
  next_action_at: '',
  assigned_user_name: '',
  line_status: '',
  memo: '',
};

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}円`;
}

function formatMileage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}km`;
}

function toInputDateTime(value: string | null | undefined) {
  return value ? value.slice(0, 16) : '';
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function toNullableNumber(value: string) {
  if (value.trim() === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function mapDealToForm(deal: DealRow): DealForm {
  return {
    deal_no: deal.deal_no ?? '',
    title: deal.title ?? '',
    deal_type: deal.deal_type ?? '',
    status: deal.status ?? '新規',
    probability: deal.probability ?? '',
    source: deal.source ?? '',
    budget: deal.budget === null ? '' : String(deal.budget ?? ''),
    trade_in_status: deal.trade_in_status ?? '',
    loan_request: deal.loan_request ?? '',
    next_action_at: toInputDateTime(deal.next_action_at),
    assigned_user_name: deal.assigned_user_name ?? '',
    line_status: deal.line_status ?? '',
    memo: deal.memo ?? '',
  };
}

function formatBudget(min: number | null, max: number | null) {
  if (min === null && max === null) {
    return '-';
  }

  if (min !== null && max !== null) {
    return `${min.toLocaleString('ja-JP')}円〜${max.toLocaleString('ja-JP')}円`;
  }

  if (min !== null) {
    return `${min.toLocaleString('ja-JP')}円〜`;
  }

  return `〜${(max ?? 0).toLocaleString('ja-JP')}円`;
}

function issueStatusLabel(status: string | null | undefined) {
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

function issueStatusClass(status: string | null | undefined) {
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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">
        {displayValue(value)}
      </dd>
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      </div>
      <div className="px-5 py-6 sm:px-6">{children}</div>
    </section>
  );
}

function FormField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'md:col-span-2 xl:col-span-4' : ''}>
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [dealForm, setDealForm] = useState<DealForm>(emptyDealForm);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [vehicles, setVehicles] = useState<VehicleCandidate[]>([]);
  const [vehicleSearchText, setVehicleSearchText] = useState('');
  const [showVehicleSearch, setShowVehicleSearch] = useState(false);
  const [tradeIn, setTradeIn] = useState<TradeInState>(emptyTradeIn);
  const [quotes, setQuotes] = useState<QuoteHistoryRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceHistoryRow[]>([]);
  const [lineDrafts, setLineDrafts] = useState<LineDraftRow[]>([]);
  const [lineLogs, setLineLogs] = useState<LineLogRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDeal, setIsSavingDeal] = useState(false);
  const [isUpdatingVehicle, setIsUpdatingVehicle] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const tradeInRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    async function loadDeal() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const { data: dealData, error: dealError } = await supabase
          .from<DealRow>('deals')
          .select(
            'id, store_id, customer_id, vehicle_id, deal_no, title, deal_type, status, probability, source, budget, trade_in_status, loan_request, next_action_at, assigned_user_name, line_status, memo'
          )
          .eq('id', dealId)
          .single();

        if (dealError || !dealData) {
          throw new Error(dealError?.message ?? '商談が見つかりません。');
        }

        setDeal(dealData);

        setDealForm(mapDealToForm(dealData));

        const [customerResult, vehicleResult, vehiclesResult, quotesResult, invoicesResult, draftsResult, logsResult] = await Promise.all([
          dealData.customer_id
            ? supabase
                .from<CustomerRow>('customers')
                .select(
                  'id, name, phone, email, line_user_id, line_display_name, delivery_permission, customer_status, desired_model, budget_min, budget_max'
                )
                .eq('id', dealData.customer_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          dealData.vehicle_id
            ? supabase
                .from<VehicleRow>('vehicles')
                .select(
                  'id, management_no, registration_no, maker, model_name, model_year, mileage_km, base_price, total_price, status, location_name'
                )
                .eq('id', dealData.vehicle_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from<VehicleCandidate>('vehicles')
            .select(
              'id, management_no, registration_no, maker, model_name, model_year, mileage_km, total_price, status'
            )
            .eq('store_id', dealData.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<QuoteHistoryRow>('quotes')
            .select('id, quote_no, status, issue_status, issue_date, issued_at, total_amount')
            .eq('deal_id', dealData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from<InvoiceHistoryRow>('invoices')
            .select('id, invoice_no, status, issue_status, issue_date, payment_due_date, issued_at, total_amount')
            .eq('deal_id', dealData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from<LineDraftRow>('line_message_drafts')
            .select('id, message_type, title, status, scheduled_at, created_at')
            .eq('deal_id', dealData.id)
            .eq('store_id', dealData.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<LineLogRow>('line_message_logs')
            .select('id, message_type, title, send_status, error_message, sent_at, created_at')
            .eq('deal_id', dealData.id)
            .eq('store_id', dealData.store_id)
            .order('created_at', { ascending: false }),
        ]);

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        if (vehicleResult.error) {
          throw new Error(vehicleResult.error.message);
        }

        if (vehiclesResult.error) {
          throw new Error(vehiclesResult.error.message);
        }

        if (quotesResult.error) {
          throw new Error(quotesResult.error.message);
        }

        if (invoicesResult.error) {
          throw new Error(invoicesResult.error.message);
        }

        setCustomer(customerResult.data);
        setVehicle(vehicleResult.data);
        setVehicles(vehiclesResult.data ?? []);
        setQuotes(quotesResult.data ?? []);
        setInvoices(invoicesResult.data ?? []);
        setLineDrafts(draftsResult.error ? [] : (draftsResult.data ?? []).slice(0, 5));
        setLineLogs(logsResult.error ? [] : (logsResult.data ?? []).slice(0, 5));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '商談詳細の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDeal();
  }, [dealId, reloadKey]);

  const vehicleName = useMemo(() => {
    if (!vehicle) {
      return '-';
    }

    return `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || '-';
  }, [vehicle]);

  function updateDealField(name: keyof DealForm, value: string) {
    setDealForm((current) => ({ ...current, [name]: value }));
  }

  async function saveDealOverview() {
    if (!deal) {
      return;
    }

    try {
      setIsSavingDeal(true);
      setErrorMessage('');
      setSuccessMessage('');
      const supabase = createClient();
      const payload: DealUpdate = {
        deal_no: toNullableText(dealForm.deal_no),
        title: toNullableText(dealForm.title),
        deal_type: toNullableText(dealForm.deal_type),
        status: toNullableText(dealForm.status),
        probability: toNullableText(dealForm.probability),
        source: toNullableText(dealForm.source),
        budget: toNullableNumber(dealForm.budget),
        trade_in_status: toNullableText(dealForm.trade_in_status),
        loan_request: toNullableText(dealForm.loan_request),
        next_action_at: dealForm.next_action_at || null,
        assigned_user_name: toNullableText(dealForm.assigned_user_name),
        line_status: toNullableText(dealForm.line_status),
        memo: toNullableText(dealForm.memo),
      };
      const { error } = await supabase
        .from<DealUpdate>('deals')
        .update(payload)
        .eq('id', deal.id)
        .eq('store_id', deal.store_id);
      if (error) {
        throw new Error(error.message);
      }
      setDeal({ ...deal, ...payload } as DealRow);
      setSuccessMessage('商談情報を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '商談情報の保存に失敗しました。');
    } finally {
      setIsSavingDeal(false);
    }
  }

  async function replaceDealVehicle(nextVehicle: VehicleCandidate) {
    if (!deal) {
      return;
    }

    setIsUpdatingVehicle(true);
    setErrorMessage('');

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from<DealUpdate>('deals')
        .update({ vehicle_id: nextVehicle.id })
        .eq('id', deal.id);

      if (error) {
        throw new Error(error.message);
      }

      setDeal({ ...deal, vehicle_id: nextVehicle.id });
      setVehicle({
        id: nextVehicle.id,
        management_no: nextVehicle.management_no,
        registration_no: nextVehicle.registration_no,
        maker: nextVehicle.maker,
        model_name: nextVehicle.model_name,
        model_year: nextVehicle.model_year,
        mileage_km: nextVehicle.mileage_km,
        base_price: null,
        total_price: nextVehicle.total_price,
        status: nextVehicle.status,
        location_name: null,
      });
      setShowVehicleSearch(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '車両の差し替えに失敗しました。');
    } finally {
      setIsUpdatingVehicle(false);
    }
  }

  async function cancelDocument(tableName: 'quotes' | 'invoices', documentId: string) {
    const confirmed = window.confirm('この帳票を取消済みにします。よろしいですか？');

    if (!confirmed) {
      return;
    }

    setErrorMessage('');

    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from<DocumentCancelUpdate>(tableName)
        .update({
          issue_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: '画面から取消',
        })
        .eq('id', documentId);

      if (error) {
        throw new Error(error.message);
      }

      const { data: member } = userData.user?.id && deal?.store_id
        ? await supabase
            .from<StoreMemberRow>('store_members')
            .select('role, display_name, email')
            .eq('user_id', userData.user.id)
            .eq('store_id', deal.store_id)
            .single()
        : { data: null };

      await logAudit({
        supabase,
        storeId: deal?.store_id ?? null,
        userId: userData.user?.id ?? null,
        userEmail: userData.user?.email ?? member?.email ?? null,
        userRole: member?.role ?? null,
        userDisplayName: member?.display_name ?? null,
        action: tableName === 'quotes' ? 'cancel_quote' : 'cancel_invoice',
        targetType: tableName === 'quotes' ? 'quote' : 'invoice',
        targetId: documentId,
        targetLabel: tableName === 'quotes' ? '見積書取消' : '請求書取消',
        metadata: { cancel_reason: '画面から取消' },
      });

      setReloadKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '帳票の取消に失敗しました。');
    }
  }

  return (
    <AppShell
      activeLabel="商談管理"
      title="商談詳細"
      description="商談ごとの顧客・車両・対応状況を確認します"
      actionButton={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveDealOverview()}
            disabled={isSavingDeal || !deal}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isSavingDeal ? '保存中...' : '保存する'}
          </button>
          <Link
            href={`/deals/${dealId}/line/new`}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
          >
            LINE案内を作成
          </Link>
          <SoftDeleteButton
            tableName="deals"
            rowId={dealId}
            storeId={deal?.store_id ?? ''}
            targetType="deal"
            targetLabel={dealForm.title || dealForm.deal_no || '商談'}
            redirectHref="/deals"
          />
          <Link
            href="/deals"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            商談一覧に戻る
          </Link>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-8">
        {errorMessage && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {successMessage}
          </p>
        )}
        {!isLoading && customer && !customer.line_user_id && (
          <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-800">
            この顧客はLINE友だちと未紐付けです。LINE案内は下書きのみ作成できます。
          </p>
        )}

        {isLoading ? (
          <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </p>
        ) : (
          <>
            <DetailCard title="商談概要">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <FormField label="商談番号"><input className={inputClass} value={dealForm.deal_no} onChange={(event) => updateDealField('deal_no', event.target.value)} /></FormField>
                <FormField label="タイトル"><input className={inputClass} value={dealForm.title} onChange={(event) => updateDealField('title', event.target.value)} /></FormField>
                <FormField label="商談種別"><select className={inputClass} value={dealForm.deal_type} onChange={(event) => updateDealField('deal_type', event.target.value)}><option value="">未選択</option>{['購入相談','見積依頼','来店予約','買取査定','車検・整備相談','カスタム相談','その他'].map((option) => <option key={option}>{option}</option>)}</select></FormField>
                <FormField label="ステータス"><select className={inputClass} value={dealForm.status} onChange={(event) => updateDealField('status', event.target.value)}>{['新規','連絡済み','来店予定','見積済み','商談中','成約','失注'].map((option) => <option key={option}>{option}</option>)}</select></FormField>
                <FormField label="確度"><select className={inputClass} value={dealForm.probability} onChange={(event) => updateDealField('probability', event.target.value)}><option value="">未選択</option>{['高','中','低','未定'].map((option) => <option key={option}>{option}</option>)}</select></FormField>
                <FormField label="流入元"><input className={inputClass} value={dealForm.source} onChange={(event) => updateDealField('source', event.target.value)} /></FormField>
                <FormField label="予算"><input type="number" className={`${inputClass} text-right`} value={dealForm.budget} onChange={(event) => updateDealField('budget', event.target.value)} /></FormField>
                <FormField label="下取り有無"><select className={inputClass} value={dealForm.trade_in_status} onChange={(event) => updateDealField('trade_in_status', event.target.value)}><option value="">未選択</option><option>あり</option><option>なし</option><option>未定</option></select></FormField>
                <FormField label="ローン希望"><select className={inputClass} value={dealForm.loan_request} onChange={(event) => updateDealField('loan_request', event.target.value)}><option value="">未選択</option><option>あり</option><option>なし</option><option>未定</option></select></FormField>
                <FormField label="次回対応日"><input type="datetime-local" className={inputClass} value={dealForm.next_action_at} onChange={(event) => updateDealField('next_action_at', event.target.value)} /></FormField>
                <FormField label="担当者"><input className={inputClass} value={dealForm.assigned_user_name} onChange={(event) => updateDealField('assigned_user_name', event.target.value)} /></FormField>
                <FormField label="LINE状態"><select className={inputClass} value={dealForm.line_status} onChange={(event) => updateDealField('line_status', event.target.value)}><option value="">未選択</option>{['未案内','案内済み','返信あり','返信なし','ブロック'].map((option) => <option key={option}>{option}</option>)}</select></FormField>
                <FormField label="メモ" wide><textarea className={`${inputClass} min-h-28`} value={dealForm.memo} onChange={(event) => updateDealField('memo', event.target.value)} /></FormField>
              </div>
            </DetailCard>

            <DetailCard title="顧客情報">
              <dl className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="顧客名" value={customer?.name} />
                <DetailItem label="電話番号" value={customer?.phone} />
                <DetailItem label="メールアドレス" value={customer?.email} />
                <DetailItem label="LINE表示名" value={customer?.line_display_name} />
                <DetailItem label="配信許可" value={customer?.delivery_permission === false || customer?.delivery_permission === '不許可' ? '不許可' : '許可'} />
                <DetailItem label="顧客ステータス" value={customer?.customer_status} />
                <DetailItem label="希望車種" value={customer?.desired_model} />
                <DetailItem
                  label="予算"
                  value={customer ? formatBudget(customer.budget_min, customer.budget_max) : '-'}
                />
              </dl>
              {customer && (
                <div className="mt-5">
                  <Link href={`/customers/${customer.id}`} className="text-sm font-bold text-blue-700 hover:underline">
                    顧客詳細を開く
                  </Link>
                </div>
              )}
            </DetailCard>

            <DetailCard title="対象車両">
              <dl className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="管理番号" value={vehicle?.management_no} />
                <DetailItem label="登録番号" value={vehicle?.registration_no} />
                <DetailItem label="メーカー" value={vehicle?.maker} />
                <DetailItem label="車種名" value={vehicle?.model_name} />
                <DetailItem label="年式" value={vehicle?.model_year} />
                <DetailItem label="走行距離" value={formatMileage(vehicle?.mileage_km)} />
                <DetailItem label="車両本体価格" value={formatPrice(vehicle?.base_price)} />
                <DetailItem label="支払総額" value={formatPrice(vehicle?.total_price)} />
                <DetailItem label="ステータス" value={vehicle?.status} />
                <DetailItem label="保管場所" value={vehicle?.location_name} />
                <DetailItem label="対象車両" value={vehicleName} />
              </dl>
              {vehicle && (
                <div className="mt-5">
                  <Link href={`/vehicles/${vehicle.id}`} className="text-sm font-bold text-blue-700 hover:underline">
                    車両詳細を開く
                  </Link>
                </div>
              )}
            </DetailCard>

            {showVehicleSearch && (
              <VehicleReplacementSection
                currentVehicle={
                  vehicle
                    ? {
                        id: vehicle.id,
                        management_no: vehicle.management_no,
                        registration_no: vehicle.registration_no,
                        maker: vehicle.maker,
                        model_name: vehicle.model_name,
                        model_year: vehicle.model_year,
                        mileage_km: vehicle.mileage_km,
                        total_price: vehicle.total_price,
                        status: vehicle.status,
                      }
                    : null
                }
                vehicles={vehicles}
                searchText={vehicleSearchText}
                setSearchText={setVehicleSearchText}
                onSelectVehicle={(nextVehicle) => void replaceDealVehicle(nextVehicle)}
                actionLabel={isUpdatingVehicle ? '更新中...' : '差し替え確定'}
              />
            )}

            <div ref={(node) => { tradeInRef.current = node; }}>
              <TradeInSection tradeIn={tradeIn} setTradeIn={setTradeIn} />
            </div>

            <DetailCard title="商談メモ">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">対応履歴メモ</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {displayValue(deal?.memo)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">社内メモ</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">-</p>
                </div>
              </div>
            </DetailCard>

            <DetailCard title="帳票履歴">
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-slate-700">見積書</h4>
                  {quotes.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      まだ見積書は作成されていません。
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                          <tr>
                            <th className="px-4 py-3">見積番号</th>
                            <th className="px-4 py-3">発行状態</th>
                            <th className="px-4 py-3">発行日</th>
                            <th className="px-4 py-3">合計</th>
                            <th className="px-4 py-3">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {quotes.map((quote) => (
                            <tr key={quote.id}>
                              <td className="px-4 py-3 font-semibold">{displayValue(quote.quote_no)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${issueStatusClass(quote.issue_status)}`}>
                                  {issueStatusLabel(quote.issue_status)}
                                </span>
                              </td>
                              <td className="px-4 py-3">{displayValue(quote.issue_date ?? quote.issued_at?.slice(0, 10))}</td>
                              <td className="px-4 py-3 font-bold">{formatPrice(quote.total_amount)}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Link href={`/deals/${dealId}/quotes/preview?quoteId=${quote.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                                    プレビュー
                                  </Link>
                                  {quote.issue_status !== 'cancelled' && (
                                    <button type="button" onClick={() => void cancelDocument('quotes', quote.id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100">
                                      取消
                                    </button>
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

                <div>
                  <h4 className="text-sm font-bold text-slate-700">請求書</h4>
                  {invoices.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      まだ請求書は作成されていません。
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                          <tr>
                            <th className="px-4 py-3">請求番号</th>
                            <th className="px-4 py-3">発行状態</th>
                            <th className="px-4 py-3">発行日</th>
                            <th className="px-4 py-3">支払期限</th>
                            <th className="px-4 py-3">合計</th>
                            <th className="px-4 py-3">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {invoices.map((invoice) => (
                            <tr key={invoice.id}>
                              <td className="px-4 py-3 font-semibold">{displayValue(invoice.invoice_no)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${issueStatusClass(invoice.issue_status)}`}>
                                  {issueStatusLabel(invoice.issue_status)}
                                </span>
                              </td>
                              <td className="px-4 py-3">{displayValue(invoice.issue_date ?? invoice.issued_at?.slice(0, 10))}</td>
                              <td className="px-4 py-3">{displayValue(invoice.payment_due_date)}</td>
                              <td className="px-4 py-3 font-bold">{formatPrice(invoice.total_amount)}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Link href={`/deals/${dealId}/invoices/preview?invoiceId=${invoice.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                                    プレビュー
                                  </Link>
                                  {invoice.issue_status !== 'cancelled' && (
                                    <button type="button" onClick={() => void cancelDocument('invoices', invoice.id)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100">
                                      取消
                                    </button>
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
              </div>
            </DetailCard>

            <DetailCard title="LINE履歴">
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-700">LINE下書き</h4>
                  {lineDrafts.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">下書きはありません。</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                          <tr><th className="px-4 py-3">作成日</th><th className="px-4 py-3">種別</th><th className="px-4 py-3">タイトル</th><th className="px-4 py-3">状態</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lineDrafts.map((draft) => (
                            <tr key={draft.id}><td className="px-4 py-3">{displayValue(draft.created_at?.replace('T', ' ').slice(0, 16))}</td><td className="px-4 py-3">{displayValue(draft.message_type)}</td><td className="px-4 py-3">{displayValue(draft.title)}</td><td className="px-4 py-3">{displayValue(draft.status)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700">LINE送信ログ</h4>
                  {lineLogs.length === 0 ? (
                    <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">送信ログはありません。</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[620px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                          <tr><th className="px-4 py-3">送信日</th><th className="px-4 py-3">種別</th><th className="px-4 py-3">タイトル</th><th className="px-4 py-3">状態</th><th className="px-4 py-3">エラー</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lineLogs.map((log) => (
                            <tr key={log.id}><td className="px-4 py-3">{displayValue((log.sent_at ?? log.created_at)?.replace('T', ' ').slice(0, 16))}</td><td className="px-4 py-3">{displayValue(log.message_type)}</td><td className="px-4 py-3">{displayValue(log.title)}</td><td className="px-4 py-3">{displayValue(log.send_status)}</td><td className="px-4 py-3 text-red-700">{displayValue(log.error_message)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </DetailCard>

            <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={`/deals/${dealId}/quotes/new`}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                >
                  見積書を作成
                </Link>
                <Link
                  href={`/deals/${dealId}/invoices/new`}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
                >
                  請求書を作成
                </Link>
                <Link
                  href={`/deals/${dealId}/line/new`}
                  className="inline-flex items-center justify-center rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
                >
                  LINE案内を作成
                </Link>
                <button
                  type="button"
                  onClick={() => setShowVehicleSearch((current) => !current)}
                  className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100"
                >
                  車両を差し替える
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTradeIn({ ...tradeIn, enabled: 'あり' });
                    tradeInRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100"
                >
                  下取り車両を登録
                </button>
                <Link
                  href={`/deals/${dealId}/line/new`}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  LINEで案内
                </Link>
                <Link
                  href="/deals"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  商談一覧に戻る
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
