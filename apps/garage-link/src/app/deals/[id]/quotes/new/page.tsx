'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  createPaymentItem,
  emptyTradeIn,
  PaymentItem,
  PaymentPlanSection,
  TradeInSection,
  TradeInState,
  VehicleCandidate,
  VehicleReplacementSection,
} from '@/components/deals/DealFlowParts';
import PartPickerModal, { type PickedPart } from '@/components/parts/PartPickerModal';
import { logAudit } from '@/lib/audit/logAudit';
import { DOCUMENT_LIMIT_MESSAGE, assertDocumentLimitAvailable } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';

type DealRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  deal_no: string | null;
  title: string | null;
  assigned_user_name: string | null;
  loan_request: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_type: string | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  registration_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  vin: string | null;
  inspection_expiry_date: string | null;
  base_price: number | null;
  total_price: number | null;
  status: string | null;
};

type QuoteIdRow = {
  id: string;
};

type StoreMemberRow = {
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type QuoteInsert = {
  store_id: string;
  deal_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  quote_no: string;
  title: string | null;
  status: string;
  issue_status: string;
  issue_date: string | null;
  expiry_date: string | null;
  assigned_user_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_honorific: string | null;
  vehicle_label: string | null;
  vehicle_maker: string | null;
  vehicle_model_name: string | null;
  vehicle_year: number | null;
  vehicle_mileage_km: number | null;
  vehicle_vin: string | null;
  vehicle_inspection_expiry_date: string | null;
  subtotal_amount: number;
  tax_amount: number;
  discount_amount: number;
  trade_in_amount: number;
  total_amount: number;
  payment_method: string | null;
  loan_request: string | null;
  down_payment: number;
  installment_count: number | null;
  payment_due_date: string | null;
  customer_note: string | null;
  internal_memo: string | null;
  issued_at: string | null;
  issued_by: string | null;
  pdf_generated_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

type QuoteItemInsert = {
  store_id: string;
  quote_id: string;
  item_order: number;
  item_type: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  amount: number;
  part_id?: string | null;
  cost_price?: number | null;
};

type PartLineItem = {
  localId: string;
  part_id: string | null;
  part_no: string;
  name: string;
  quantity: string;
  unit_price: string;
  cost_price: string;
  tax_rate: string;
};

type AmountKey =
  | 'vehicle_base_price'
  | 'registration_fee'
  | 'delivery_maintenance_fee'
  | 'inspection_fee'
  | 'liability_insurance'
  | 'weight_tax'
  | 'stamp_fee'
  | 'number_plate_fee'
  | 'recycle_deposit'
  | 'accessories'
  | 'custom_fee'
  | 'other_fee'
  | 'discount'
  | 'trade_in';

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const amountItems: Array<{ key: AmountKey; name: string; itemType: string; negative?: boolean }> = [
  { key: 'vehicle_base_price', name: '車両本体価格', itemType: 'vehicle' },
  { key: 'registration_fee', name: '登録代行費用', itemType: 'fee' },
  { key: 'delivery_maintenance_fee', name: '納車整備費用', itemType: 'fee' },
  { key: 'inspection_fee', name: '車検・点検費用', itemType: 'fee' },
  { key: 'liability_insurance', name: '自賠責保険', itemType: 'insurance' },
  { key: 'weight_tax', name: '重量税', itemType: 'tax' },
  { key: 'stamp_fee', name: '印紙代', itemType: 'tax' },
  { key: 'number_plate_fee', name: 'ナンバー代', itemType: 'fee' },
  { key: 'recycle_deposit', name: 'リサイクル預託金', itemType: 'fee' },
  { key: 'accessories', name: '付属品', itemType: 'option' },
  { key: 'custom_fee', name: 'カスタム費用', itemType: 'option' },
  { key: 'other_fee', name: 'その他費用', itemType: 'other' },
  { key: 'discount', name: '値引き', itemType: 'discount', negative: true },
  { key: 'trade_in', name: '下取り金額', itemType: 'trade_in', negative: true },
];

const emptyAmounts: Record<AmountKey, string> = {
  vehicle_base_price: '',
  registration_fee: '',
  delivery_maintenance_fee: '',
  inspection_fee: '',
  liability_insurance: '',
  weight_tax: '',
  stamp_fee: '',
  number_plate_fee: '',
  recycle_deposit: '',
  accessories: '',
  custom_fee: '',
  other_fee: '',
  discount: '',
  trade_in: '',
};

function toNumber(value: string) {
  const numberValue = Number(value);
  return value.trim() === '' || Number.isNaN(numberValue) ? 0 : numberValue;
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function createDocumentNo(prefix: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const time = now
    .toTimeString()
    .slice(0, 8)
    .replaceAll(':', '');
  return `${prefix}-${date}-${time}`;
}

function formatPrice(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function vehicleLabel(vehicle: VehicleRow | null) {
  if (!vehicle) {
    return '';
  }

  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '';
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">
      {children}
    </label>
  );
}

export default function DealQuoteNewPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const router = useRouter();
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [vehicles, setVehicles] = useState<VehicleCandidate[]>([]);
  const [vehicleSearchText, setVehicleSearchText] = useState('');
  const [quoteNo, setQuoteNo] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [internalMemo, setInternalMemo] = useState('');
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>(emptyAmounts);
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([
    createPaymentItem(),
  ]);
  const [tradeIn, setTradeIn] = useState<TradeInState>(emptyTradeIn);
  const [partLineItems, setPartLineItems] = useState<PartLineItem[]>([]);
  const [showPartPicker, setShowPartPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadDeal() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const { data: dealData, error: dealError } = await supabase
          .from<DealRow>('deals')
          .select('id, store_id, customer_id, vehicle_id, deal_no, title, assigned_user_name, loan_request')
          .eq('id', dealId)
          .single();

        if (dealError || !dealData) {
          throw new Error(dealError?.message ?? '商談が見つかりません。');
        }

        setDeal(dealData);

        const [customerResult, vehicleResult, vehiclesResult] = await Promise.all([
          dealData.customer_id
            ? supabase
                .from<CustomerRow>('customers')
                .select('id, name, phone, email, address, customer_type')
                .eq('id', dealData.customer_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          dealData.vehicle_id
            ? supabase
                .from<VehicleRow>('vehicles')
                .select('id, management_no, registration_no, maker, model_name, model_year, mileage_km, vin, inspection_expiry_date, base_price, total_price, status')
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

        setCustomer(customerResult.data);
        setVehicle(vehicleResult.data);
        setVehicles(vehiclesResult.data ?? []);

        if (vehicleResult.data?.base_price !== null && vehicleResult.data?.base_price !== undefined) {
          setAmounts((current) => ({
            ...current,
            vehicle_base_price: String(vehicleResult.data?.base_price ?? ''),
          }));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '商談情報の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDeal();
  }, [dealId]);

  const partsSubtotal = useMemo(
    () =>
      partLineItems.reduce(
        (sum, item) => sum + (parseInt(item.quantity, 10) || 1) * (parseFloat(item.unit_price) || 0),
        0,
      ),
    [partLineItems],
  );

  const summary = useMemo(() => {
    const fixedSubtotal = amountItems
      .filter((item) => !item.negative)
      .reduce((total, item) => total + toNumber(amounts[item.key]), 0);
    const subtotalAmount = fixedSubtotal + partsSubtotal;
    const discountAmount = toNumber(amounts.discount);
    const tradeInAmount = toNumber(amounts.trade_in) + toNumber(tradeIn.tradeInAmount);
    const taxAmount = 0;
    return {
      subtotalAmount,
      discountAmount,
      tradeInAmount,
      taxAmount,
      totalAmount: subtotalAmount + taxAmount - discountAmount - tradeInAmount,
    };
  }, [amounts, tradeIn.tradeInAmount, partsSubtotal]);

  function addPartFromPicker(picked: PickedPart) {
    setShowPartPicker(false);
    setPartLineItems((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        part_id: picked.id,
        part_no: picked.part_no ?? '',
        name: picked.name,
        quantity: '1',
        unit_price: picked.unit_price !== null ? String(picked.unit_price) : '',
        cost_price: picked.cost_price !== null ? String(picked.cost_price) : '',
        tax_rate: '0.1',
      },
    ]);
  }

  function addManualPartItem() {
    setShowPartPicker(false);
    setPartLineItems((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), part_id: null, part_no: '', name: '', quantity: '1', unit_price: '', cost_price: '', tax_rate: '0.1' },
    ]);
  }

  function updatePartItem(localId: string, field: keyof PartLineItem, value: string) {
    setPartLineItems((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, [field]: value } : item)),
    );
  }

  function removePartItem(localId: string) {
    setPartLineItems((prev) => prev.filter((item) => item.localId !== localId));
  }

  function selectReplacementVehicle(nextVehicle: VehicleCandidate) {
    setVehicle({
      id: nextVehicle.id,
      management_no: nextVehicle.management_no,
      registration_no: nextVehicle.registration_no,
      maker: nextVehicle.maker,
      model_name: nextVehicle.model_name,
      model_year: nextVehicle.model_year,
      mileage_km: nextVehicle.mileage_km,
      vin: null,
      inspection_expiry_date: null,
      base_price: null,
      total_price: nextVehicle.total_price,
      status: nextVehicle.status,
    });
  }

  async function saveQuote(issueStatus: 'draft' | 'issued') {
    setErrorMessage('');
    setIsSaving(true);

    try {
      if (!deal) {
        throw new Error('商談情報が見つかりません。');
      }

      const supabase = createClient();
      await assertDocumentLimitAvailable(supabase, deal.store_id);
      const { data: userData } = await supabase.auth.getUser();
      const { data: member } = userData.user?.id
        ? await supabase
            .from<StoreMemberRow>('store_members')
            .select('role, display_name, email')
            .eq('user_id', userData.user.id)
            .eq('store_id', deal.store_id)
            .single()
        : { data: null };
      const now = new Date().toISOString();
      const finalQuoteNo = quoteNo.trim() || createDocumentNo('Q');
      const finalIssueDate = toNullableText(issueDate) ?? now.slice(0, 10);
      const issuedBy = userData.user?.email ?? deal.assigned_user_name;

      const quotePayload: QuoteInsert = {
        store_id: deal.store_id,
        deal_id: deal.id,
        customer_id: deal.customer_id,
        vehicle_id: vehicle?.id ?? deal.vehicle_id,
        quote_no: finalQuoteNo,
        title: deal.title,
        status: issueStatus,
        issue_status: issueStatus,
        issue_date: finalIssueDate,
        expiry_date: toNullableText(expiryDate),
        assigned_user_name: deal.assigned_user_name,
        customer_name: customer?.name ?? null,
        customer_phone: customer?.phone ?? null,
        customer_email: customer?.email ?? null,
        customer_address: customer?.address ?? null,
        customer_honorific: customer?.customer_type === '法人' || customer?.customer_type === 'corporate' ? '御中' : '様',
        vehicle_label: vehicleLabel(vehicle),
        vehicle_maker: vehicle?.maker ?? null,
        vehicle_model_name: vehicle?.model_name ?? null,
        vehicle_year: vehicle?.model_year ?? null,
        vehicle_mileage_km: vehicle?.mileage_km ?? null,
        vehicle_vin: vehicle?.vin ?? null,
        vehicle_inspection_expiry_date: vehicle?.inspection_expiry_date ?? null,
        subtotal_amount: summary.subtotalAmount,
        tax_amount: summary.taxAmount,
        discount_amount: summary.discountAmount,
        trade_in_amount: summary.tradeInAmount,
        total_amount: summary.totalAmount,
        payment_method: null,
        loan_request: deal.loan_request,
        down_payment: 0,
        installment_count: null,
        payment_due_date: null,
        customer_note: toNullableText(customerNote),
        internal_memo: toNullableText(
          [
            internalMemo,
            `支払方法内訳: ${JSON.stringify(paymentItems)}`,
            `下取り情報: ${JSON.stringify(tradeIn)}`,
          ]
            .filter((value) => value.trim() !== '')
            .join('\n')
        ),
        issued_at: issueStatus === 'issued' ? now : null,
        issued_by: issueStatus === 'issued' ? issuedBy : null,
        pdf_generated_at: issueStatus === 'issued' ? now : null,
        cancelled_at: null,
        cancel_reason: null,
      };

      const { data: quote, error: quoteError } = await supabase
        .from<QuoteIdRow>('quotes')
        .insert(quotePayload)
        .select('id')
        .single();

      if (quoteError || !quote?.id) {
        throw new Error(quoteError?.message ?? '見積書の保存に失敗しました。');
      }

      const itemPayloads: QuoteItemInsert[] = amountItems
        .map((item, index) => {
          const amount = toNumber(amounts[item.key]);
          const signedAmount = item.negative ? amount * -1 : amount;
          return {
            store_id: deal.store_id,
            quote_id: quote.id,
            item_order: index + 1,
            item_type: item.itemType,
            name: item.name,
            quantity: 1,
            unit_price: signedAmount,
            tax_rate: 0.1,
            tax_amount: 0,
            amount: signedAmount,
          };
        })
        .filter((item) => item.amount !== 0);

      if (itemPayloads.length > 0) {
        const { error: itemError } = await supabase
          .from<QuoteItemInsert>('quote_items')
          .insert(itemPayloads);

        if (itemError) {
          throw new Error(itemError.message);
        }
      }

      const partItemPayloads: QuoteItemInsert[] = partLineItems
        .filter((item) => item.name.trim())
        .map((item, index) => {
          const qty = parseInt(item.quantity, 10) || 1;
          const price = parseFloat(item.unit_price) || 0;
          const amount = qty * price;
          return {
            store_id: deal.store_id,
            quote_id: quote.id,
            item_order: itemPayloads.length + index + 1,
            item_type: 'part',
            name: item.name.trim(),
            quantity: qty,
            unit_price: price,
            tax_rate: parseFloat(item.tax_rate) || 0.1,
            tax_amount: 0,
            amount,
            part_id: item.part_id ?? null,
            cost_price: item.cost_price.trim() ? Math.round(parseFloat(item.cost_price)) : null,
          };
        });

      if (partItemPayloads.length > 0) {
        const { error: partItemError } = await supabase
          .from<QuoteItemInsert>('quote_items')
          .insert(partItemPayloads);
        if (partItemError) throw new Error(partItemError.message);
      }

      if (issueStatus === 'issued') {
        await logAudit({
          supabase,
          storeId: deal.store_id,
          userId: userData.user?.id ?? null,
          userEmail: userData.user?.email ?? member?.email ?? null,
          userRole: member?.role ?? null,
          userDisplayName: member?.display_name ?? null,
          action: 'issue_quote',
          targetType: 'quote',
          targetId: quote.id,
          targetLabel: finalQuoteNo,
          metadata: {
            deal_id: deal.id,
            total_amount: summary.totalAmount,
            issue_date: finalIssueDate,
          },
        });
        router.push(`/deals/${deal.id}/quotes/preview?quoteId=${quote.id}`);
        return;
      }

      router.push(`/deals/${deal.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '見積書の保存に失敗しました。');
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveQuote('draft');
  }

  return (
    <AppShell
      activeLabel="商談管理"
      title="見積書作成"
      description="この商談に紐づく見積書を作成します"
      actionButton={
        <Link
          href={`/deals/${dealId}`}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          商談詳細に戻る
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-7xl space-y-8">
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
          PDFプレビューでは会社情報・ロゴ・角印が反映されます。
        </p>

        {errorMessage && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <p>{errorMessage}</p>
            {errorMessage === DOCUMENT_LIMIT_MESSAGE && (
              <Link href="/settings/billing" className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100">
                プラン変更を申し込む
              </Link>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">見積基本情報</h3>
                <p className="mt-1 text-sm text-slate-500">
                  商談・顧客・車両情報は自動反映されています。
                </p>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="quote_no">見積番号</FieldLabel>
                  <input
                    id="quote_no"
                    type="text"
                    value={quoteNo}
                    onChange={(event) => setQuoteNo(event.target.value)}
                    placeholder="未入力なら自動採番します"
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="issue_date">発行日</FieldLabel>
                  <input
                    id="issue_date"
                    type="date"
                    value={issueDate}
                    onChange={(event) => setIssueDate(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="expiry_date">有効期限</FieldLabel>
                  <input
                    id="expiry_date"
                    type="date"
                    value={expiryDate}
                    onChange={(event) => setExpiryDate(event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

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
              onSelectVehicle={selectReplacementVehicle}
            />

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">商談・顧客・車両情報</h3>
              </div>
              <dl className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <dt className="text-xs font-bold text-slate-500">商談</dt>
                  <dd className="mt-1 text-sm font-semibold">{deal?.title ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500">顧客名</dt>
                  <dd className="mt-1 text-sm font-semibold">{customer?.name ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500">対象車両</dt>
                  <dd className="mt-1 text-sm font-semibold">{vehicleLabel(vehicle) || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500">車両本体価格</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {vehicle?.base_price ? formatPrice(vehicle.base_price) : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500">支払総額参考</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {vehicle?.total_price ? formatPrice(vehicle.total_price) : '-'}
                  </dd>
                </div>
              </dl>
            </section>

            <TradeInSection tradeIn={tradeIn} setTradeIn={setTradeIn} />

            <PaymentPlanSection
              title="見積合計"
              totalAmount={summary.totalAmount}
              items={paymentItems}
              setItems={setPaymentItems}
            />

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">費用明細</h3>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
                {amountItems.map((item) => (
                  <div key={item.key}>
                    <FieldLabel htmlFor={item.key}>{item.name}</FieldLabel>
                    <input
                      id={item.key}
                      type="number"
                      value={amounts[item.key]}
                      onChange={(event) =>
                        setAmounts((current) => ({
                          ...current,
                          [item.key]: event.target.value,
                        }))
                      }
                      className={`${inputClass} text-right`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">部品・作業明細</h3>
                  {partsSubtotal > 0 && (
                    <p className="mt-1 text-sm text-slate-500">
                      部品小計: <span className="font-bold text-slate-950">{formatPrice(partsSubtotal)}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPartPicker(true)}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                  >
                    部品マスタから追加
                  </button>
                  <button
                    type="button"
                    onClick={addManualPartItem}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    手動で行追加
                  </button>
                </div>
              </div>
              {partLineItems.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-400">
                  部品・作業明細はまだ追加されていません
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">部品名</th>
                        <th className="px-4 py-3 text-right">数量</th>
                        <th className="px-4 py-3 text-right">単価</th>
                        <th className="px-4 py-3 text-right">小計</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {partLineItems.map((item) => {
                        const qty = parseInt(item.quantity, 10) || 1;
                        const price = parseFloat(item.unit_price) || 0;
                        return (
                          <tr key={item.localId}>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updatePartItem(item.localId, 'name', e.target.value)}
                                placeholder="部品名"
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                              />
                              {item.part_no && (
                                <p className="mt-0.5 text-xs text-slate-400">{item.part_no}</p>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updatePartItem(item.localId, 'quantity', e.target.value)}
                                className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-right text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                value={item.unit_price}
                                onChange={(e) => updatePartItem(item.localId, 'unit_price', e.target.value)}
                                placeholder="0"
                                className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-right text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                              />
                            </td>
                            <td className="px-4 py-2 text-right font-bold">
                              {formatPrice(qty * price)}
                            </td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => removePartItem(item.localId)}
                                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 transition hover:bg-red-100"
                              >
                                削除
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {showPartPicker && deal && (
              <PartPickerModal
                storeId={deal.store_id}
                onSelect={addPartFromPicker}
                onAddManual={addManualPartItem}
                onClose={() => setShowPartPicker(false)}
              />
            )}

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-5 px-5 py-6 sm:px-6 lg:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="customer_note">顧客向け備考</FieldLabel>
                  <textarea
                    id="customer_note"
                    rows={5}
                    value={customerNote}
                    onChange={(event) => setCustomerNote(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="internal_memo">社内メモ</FieldLabel>
                  <textarea
                    id="internal_memo"
                    rows={5}
                    value={internalMemo}
                    onChange={(event) => setInternalMemo(event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="ml-auto max-w-md space-y-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
                <div className="flex justify-between text-sm font-semibold">
                  <span>小計</span>
                  <span>{formatPrice(summary.subtotalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>値引き</span>
                  <span>{formatPrice(summary.discountAmount * -1)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>下取り</span>
                  <span>{formatPrice(summary.tradeInAmount * -1)}</span>
                </div>
                <div className="flex justify-between border-t border-blue-200 pt-4 text-lg font-bold text-blue-700">
                  <span>見積合計</span>
                  <span>{formatPrice(summary.totalAmount)}</span>
                </div>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
              <Link
                href={`/deals/${dealId}`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                キャンセル
              </Link>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveQuote('draft')}
                className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                下書き保存
              </button>
              <Link
                href={`/deals/${dealId}/quotes/preview`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                PDFプレビュー
              </Link>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveQuote('issued')}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? '保存中...' : '見積書を発行する'}
              </button>
            </div>
          </>
        )}
      </form>
    </AppShell>
  );
}
