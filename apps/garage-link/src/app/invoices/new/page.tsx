'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PartLineItemsEditor, { type PartLineItem } from '@/components/parts/PartLineItemsEditor';
import PartPickerModal, { type PickedPart } from '@/components/parts/PartPickerModal';
import { DOCUMENT_LIMIT_MESSAGE, assertDocumentLimitAvailable } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type CustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  customer_type: string | null;
};

type VehicleOption = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  vin: string | null;
  base_price: number | null;
  total_price: number | null;
  status: string | null;
};

type DealOption = {
  id: string;
  deal_no: string | null;
  title: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
};

type QuoteOption = {
  id: string;
  quote_no: string | null;
  customer_name: string | null;
  vehicle_label: string | null;
  total_amount: number | null;
};

type QuoteItemRow = {
  id: string;
  item_type: string | null;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  amount: number | null;
};

type InvoiceInsert = {
  store_id: string;
  deal_id: string | null;
  quote_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  invoice_no: string;
  title: string | null;
  status: string;
  issue_status: string;
  issue_date: string | null;
  payment_due_date: string | null;
  assigned_user_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_postal_code: string | null;
  customer_address: string | null;
  customer_honorific: string | null;
  vehicle_label: string | null;
  vehicle_maker: string | null;
  vehicle_model_name: string | null;
  vehicle_year: number | null;
  vehicle_mileage_km: number | null;
  vehicle_vin: string | null;
  subtotal_amount: number;
  tax_amount: number;
  discount_amount: number;
  trade_in_amount: number;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  memo: string | null;
  internal_memo: string | null;
};

type InvoiceIdRow = { id: string };

type InvoiceItemInsert = {
  store_id: string;
  invoice_id: string;
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

function createDocumentNo(prefix: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const time = now.toTimeString().slice(0, 8).replaceAll(':', '');
  return `${prefix}-${date}-${time}`;
}

function toNumber(value: string) {
  const v = Number(value);
  return value.trim() === '' || Number.isNaN(v) ? 0 : v;
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function toNullableNumber(value: string) {
  if (value.trim() === '') return null;
  const v = Number(value);
  return Number.isNaN(v) ? null : v;
}

function formatPrice(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function vehicleDisplayLabel(v: VehicleOption) {
  const name = `${v.maker ?? ''} ${v.model_name ?? ''}`.trim();
  return name || v.management_no || '車両名未設定';
}

function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [invoiceNo, setInvoiceNo] = useState(() => createDocumentNo('INV'));
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('下書き');
  const [issueDate, setIssueDate] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [assignedUser, setAssignedUser] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerHonorific, setCustomerHonorific] = useState('様');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [vehicleMaker, setVehicleMaker] = useState('');
  const [vehicleModelName, setVehicleModelName] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleMileageKm, setVehicleMileageKm] = useState('');
  const [vehicleVin, setVehicleVin] = useState('');
  const [dealId, setDealId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>(emptyAmounts);
  const [memo, setMemo] = useState('');
  const [internalMemo, setInternalMemo] = useState('');
  const [partLineItems, setPartLineItems] = useState<PartLineItem[]>([]);
  const [showPartPicker, setShowPartPicker] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true);
      setErrorMessage('');
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');

        setStoreId(member.store_id);

        const initialQuoteId =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('quoteId')
            : null;

        const [customerResult, vehicleResult, dealResult, quoteResult] = await Promise.all([
          supabase
            .from<CustomerOption>('customers')
            .select('id, name, phone, email, postal_code, address, customer_type')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<VehicleOption>('vehicles')
            .select('id, management_no, maker, model_name, model_year, mileage_km, vin, base_price, total_price, status')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<DealOption>('deals')
            .select('id, deal_no, title, customer_id, vehicle_id')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<QuoteOption>('quotes')
            .select('id, quote_no, customer_name, vehicle_label, total_amount')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
        ]);

        if (customerResult.error) throw new Error(customerResult.error.message);
        if (vehicleResult.error) throw new Error(vehicleResult.error.message);
        if (dealResult.error) throw new Error(dealResult.error.message);
        if (quoteResult.error) throw new Error(quoteResult.error.message);

        setCustomers(customerResult.data ?? []);
        setVehicles(vehicleResult.data ?? []);
        setDeals(dealResult.data ?? []);
        setQuotes(quoteResult.data ?? []);

        if (initialQuoteId) {
          setQuoteId(initialQuoteId);
          await importQuoteItems(initialQuoteId, member.store_id);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '選択肢の取得に失敗しました。');
      } finally {
        setIsLoadingOptions(false);
      }
    }
    void loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((c) => c.id === id);
    if (c) {
      setCustomerName(c.name ?? '');
      setCustomerPhone(c.phone ?? '');
      setCustomerEmail(c.email ?? '');
      setCustomerAddress(c.address ?? '');
      setCustomerHonorific(
        c.customer_type === '法人' || c.customer_type === 'corporate' ? '御中' : '様'
      );
    }
  }

  function applyVehicle(id: string) {
    setVehicleId(id);
    const v = vehicles.find((v) => v.id === id);
    if (v) {
      setVehicleLabel(vehicleDisplayLabel(v));
      setVehicleMaker(v.maker ?? '');
      setVehicleModelName(v.model_name ?? '');
      setVehicleYear(v.model_year !== null ? String(v.model_year) : '');
      setVehicleMileageKm(v.mileage_km !== null ? String(v.mileage_km) : '');
      setVehicleVin(v.vin ?? '');
      if (v.base_price !== null) {
        setAmounts((prev) => ({ ...prev, vehicle_base_price: String(v.base_price) }));
      }
    }
  }

  async function importQuoteItems(selectedQuoteId: string, overrideStoreId?: string) {
    const effectiveStoreId = overrideStoreId ?? storeId;
    if (!selectedQuoteId || !effectiveStoreId) return;
    try {
      const supabase = createClient();
      const { data: items } = await supabase
        .from<QuoteItemRow>('quote_items')
        .select('id, item_type, name, quantity, unit_price, tax_rate, tax_amount, amount')
        .eq('quote_id', selectedQuoteId)
        .eq('store_id', effectiveStoreId)
        .order('item_order', { ascending: true });

      if (!items || items.length === 0) return;

      const newAmounts = { ...emptyAmounts };
      const newParts: PartLineItem[] = [];

      for (const item of items) {
        const matchKey = amountItems.find((a) => a.name === item.name);
        if (matchKey && item.amount !== null) {
          const absAmount = Math.abs(item.amount);
          newAmounts[matchKey.key] = String(absAmount);
        } else if (item.item_type === 'part' && item.name) {
          newParts.push({
            localId: `import-${item.id}`,
            part_id: null,
            part_no: '',
            name: item.name,
            quantity: String(item.quantity ?? 1),
            unit_price: String(item.unit_price ?? 0),
            cost_price: '',
            tax_rate: String(item.tax_rate ?? 0.1),
          });
        }
      }

      setAmounts(newAmounts);
      setPartLineItems(newParts);
    } catch {
      // silently ignore import errors
    }
  }

  const partsSubtotal = useMemo(() => {
    return partLineItems.reduce((sum, item) => {
      const qty = parseInt(item.quantity, 10) || 1;
      const price = parseFloat(item.unit_price) || 0;
      return sum + qty * price;
    }, 0);
  }, [partLineItems]);

  const summary = useMemo(() => {
    const fixedSubtotal = amountItems
      .filter((item) => !item.negative)
      .reduce((total, item) => total + toNumber(amounts[item.key]), 0);
    const subtotalAmount = fixedSubtotal + partsSubtotal;
    const discountAmount = toNumber(amounts.discount);
    const tradeInAmount = toNumber(amounts.trade_in);
    const taxAmount = 0;
    const totalAmount = subtotalAmount + taxAmount - discountAmount - tradeInAmount;
    return { subtotalAmount, taxAmount, discountAmount, tradeInAmount, totalAmount };
  }, [amounts, partsSubtotal]);

  function addPartFromPicker(picked: PickedPart) {
    setShowPartPicker(false);
    setPartLineItems((prev) => [
      ...prev,
      {
        localId: `${Date.now()}-${Math.random()}`,
        part_id: picked.id,
        part_no: picked.part_no ?? '',
        name: picked.name,
        quantity: '1',
        unit_price: String(picked.unit_price ?? ''),
        cost_price: String(picked.cost_price ?? ''),
        tax_rate: '0.1',
      },
    ]);
  }

  function addManualPartItem() {
    setShowPartPicker(false);
    setPartLineItems((prev) => [
      ...prev,
      { localId: `${Date.now()}-${Math.random()}`, part_id: null, part_no: '', name: '', quantity: '1', unit_price: '', cost_price: '', tax_rate: '0.1' },
    ]);
  }

  async function saveInvoice(issueStatus: 'draft' | 'issued') {
    setErrorMessage('');
    setIsSaving(true);

    try {
      if (!storeId) throw new Error('所属店舗が見つかりません。');
      if (!customerName.trim()) throw new Error('顧客名は必須です。顧客を選択するか、顧客名を入力してください。');

      const supabase = createClient();
      await assertDocumentLimitAvailable(supabase, storeId);

      const finalInvoiceNo = invoiceNo.trim() || createDocumentNo('INV');

      const invoicePayload: InvoiceInsert = {
        store_id: storeId,
        deal_id: toNullableText(dealId),
        quote_id: toNullableText(quoteId),
        customer_id: toNullableText(customerId),
        vehicle_id: toNullableText(vehicleId),
        invoice_no: finalInvoiceNo,
        title: toNullableText(title),
        status: issueStatus,
        issue_status: issueStatus,
        issue_date: toNullableText(issueDate),
        payment_due_date: toNullableText(paymentDueDate),
        assigned_user_name: toNullableText(assignedUser),
        customer_name: toNullableText(customerName),
        customer_phone: toNullableText(customerPhone),
        customer_email: toNullableText(customerEmail),
        customer_postal_code: null,
        customer_address: toNullableText(customerAddress),
        customer_honorific: toNullableText(customerHonorific),
        vehicle_label: toNullableText(vehicleLabel),
        vehicle_maker: toNullableText(vehicleMaker),
        vehicle_model_name: toNullableText(vehicleModelName),
        vehicle_year: toNullableNumber(vehicleYear),
        vehicle_mileage_km: toNullableNumber(vehicleMileageKm),
        vehicle_vin: toNullableText(vehicleVin),
        subtotal_amount: summary.subtotalAmount,
        tax_amount: summary.taxAmount,
        discount_amount: summary.discountAmount,
        trade_in_amount: summary.tradeInAmount,
        total_amount: summary.totalAmount,
        paid_amount: 0,
        unpaid_amount: summary.totalAmount,
        memo: toNullableText(memo),
        internal_memo: toNullableText(internalMemo),
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from<InvoiceIdRow>('invoices')
        .insert(invoicePayload)
        .select('id')
        .single();

      if (invoiceError || !invoice?.id) throw new Error(invoiceError?.message ?? '請求書の保存に失敗しました。');

      const itemPayloads: InvoiceItemInsert[] = amountItems
        .map((item, index) => {
          const amount = toNumber(amounts[item.key]);
          const signedAmount = item.negative ? amount * -1 : amount;
          return {
            store_id: storeId,
            invoice_id: invoice.id,
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
          .from<InvoiceItemInsert>('invoice_items')
          .insert(itemPayloads);
        if (itemError) throw new Error(itemError.message);
      }

      const partItemPayloads: InvoiceItemInsert[] = partLineItems
        .filter((item) => item.name.trim())
        .map((item, index) => {
          const qty = parseInt(item.quantity, 10) || 1;
          const price = parseFloat(item.unit_price) || 0;
          return {
            store_id: storeId,
            invoice_id: invoice.id,
            item_order: itemPayloads.length + index + 1,
            item_type: 'part',
            name: item.name.trim(),
            quantity: qty,
            unit_price: price,
            tax_rate: parseFloat(item.tax_rate) || 0.1,
            tax_amount: 0,
            amount: qty * price,
            part_id: item.part_id ?? null,
            cost_price: item.cost_price.trim() ? Math.round(parseFloat(item.cost_price)) : null,
          };
        });

      if (partItemPayloads.length > 0) {
        const { error: partItemError } = await supabase
          .from<InvoiceItemInsert>('invoice_items')
          .insert(partItemPayloads);
        if (partItemError) throw new Error(partItemError.message);
      }

      router.push(`/invoices/${invoice.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '請求書の保存に失敗しました。');
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveInvoice('draft');
  }

  return (
    <AppShell
      activeLabel="請求書"
      title="請求書作成"
      description="顧客・車両・諸費用をもとに請求書を作成します"
      actionButton={
        <Link
          href="/invoices"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          一覧に戻る
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-7xl space-y-8">
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

        {isLoadingOptions && (
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
            選択肢を読み込み中です...
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">請求基本情報</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">請求番号、発行日、支払期限を設定します。</p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="invoice_no">請求番号</FieldLabel>
              <input id="invoice_no" type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="例：INV-20260101-120000" className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="status">ステータス</FieldLabel>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                {['下書き', '送付済み', '入金待ち', '一部入金', '入金済み', '期限超過', 'キャンセル'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="issue_date">発行日</FieldLabel>
              <input id="issue_date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="payment_due_date">支払期限</FieldLabel>
              <input id="payment_due_date" type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="assigned_user">担当者</FieldLabel>
              <input id="assigned_user" type="text" value={assignedUser} onChange={(e) => setAssignedUser(e.target.value)} placeholder="例：山田" className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="quote_id">関連見積書（任意）</FieldLabel>
              <select
                id="quote_id"
                value={quoteId}
                onChange={async (e) => {
                  setQuoteId(e.target.value);
                  if (e.target.value) await importQuoteItems(e.target.value);
                }}
                className={inputClass}
              >
                <option value="">未選択</option>
                {quotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quote_no ?? q.id} {q.customer_name ? `/ ${q.customer_name}` : ''}
                  </option>
                ))}
              </select>
              {quoteId && <p className="mt-1 text-xs text-slate-500">選択すると費用明細が自動入力されます</p>}
            </div>
            <div>
              <FieldLabel htmlFor="deal_id">関連商談（任意）</FieldLabel>
              <select id="deal_id" value={dealId} onChange={(e) => setDealId(e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.deal_no ? `${d.deal_no} / ` : ''}{d.title ?? '商談名未設定'}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="title">請求タイトル（任意）</FieldLabel>
              <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：CB400SF 請求書" className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">顧客情報</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">顧客選択で自動入力されます。顧客名は必須です。</p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="customer_id">顧客選択</FieldLabel>
              <select id="customer_id" value={customerId} onChange={(e) => applyCustomer(e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name ?? '名称未設定'}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="customer_name" required>顧客名</FieldLabel>
              <input id="customer_name" type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="customer_phone">電話番号</FieldLabel>
              <input id="customer_phone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="customer_email">メールアドレス</FieldLabel>
              <input id="customer_email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="customer_honorific">敬称</FieldLabel>
              <select id="customer_honorific" value={customerHonorific} onChange={(e) => setCustomerHonorific(e.target.value)} className={inputClass}>
                {['様', '御中', 'なし'].map((h) => (<option key={h} value={h}>{h}</option>))}
              </select>
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="customer_address">住所</FieldLabel>
              <input id="customer_address" type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">車両情報（任意）</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">車両を紐づけると車両情報が自動入力されます。</p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="vehicle_id">車両選択</FieldLabel>
              <select id="vehicle_id" value={vehicleId} onChange={(e) => applyVehicle(e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{vehicleDisplayLabel(v)}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_maker">メーカー</FieldLabel>
              <input id="vehicle_maker" type="text" value={vehicleMaker} onChange={(e) => setVehicleMaker(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_model_name">車種名</FieldLabel>
              <input id="vehicle_model_name" type="text" value={vehicleModelName} onChange={(e) => setVehicleModelName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_year">年式</FieldLabel>
              <input id="vehicle_year" type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_mileage_km">走行距離</FieldLabel>
              <input id="vehicle_mileage_km" type="number" value={vehicleMileageKm} onChange={(e) => setVehicleMileageKm(e.target.value)} className={`${inputClass} text-right`} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_vin">車台番号</FieldLabel>
              <input id="vehicle_vin" type="text" value={vehicleVin} onChange={(e) => setVehicleVin(e.target.value)} className={inputClass} />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="vehicle_label">車両表示名</FieldLabel>
              <input id="vehicle_label" type="text" value={vehicleLabel} onChange={(e) => setVehicleLabel(e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">費用明細</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">車両本体価格、登録費用、整備費用、保険、税金、値引きなどを入力します。</p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            {amountItems.map((item) => (
              <div key={item.key}>
                <FieldLabel htmlFor={item.key}>{item.name}</FieldLabel>
                <input
                  id={item.key}
                  type="number"
                  value={amounts[item.key]}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [item.key]: e.target.value }))}
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
              <p className="mt-1 text-sm leading-6 text-slate-500">部品マスタから選択するか、手動で明細を追加します。</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPartPicker(true)}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
            >
              + 部品を追加
            </button>
          </div>
          <PartLineItemsEditor items={partLineItems} onChange={setPartLineItems} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">備考・社内メモ</h3>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6">
            <div>
              <FieldLabel htmlFor="memo">顧客向け備考</FieldLabel>
              <textarea id="memo" rows={4} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例：お支払いは支払期限までにお願いいたします。" className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="internal_memo">社内メモ</FieldLabel>
              <textarea id="internal_memo" rows={4} value={internalMemo} onChange={(e) => setInternalMemo(e.target.value)} placeholder="例：ローン承認後に請求書送付予定。" className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-blue-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">金額サマリー</h3>
          </div>
          <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1fr_420px]">
            <div className="rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">
              金額は入力内容からリアルタイムで集計します。値引きと下取りは合計から差し引きます。
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
              <div className="space-y-3">
                {([
                  ['小計', summary.subtotalAmount],
                  ['消費税', summary.taxAmount],
                  ['値引き', summary.discountAmount * -1],
                  ['下取り', summary.tradeInAmount * -1],
                ] as [string, number][]).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-slate-600">{label}</span>
                    <span className="text-right text-sm font-bold text-slate-950">{formatPrice(value)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 border-t border-blue-200 pt-4">
                  <span className="text-sm font-bold text-slate-950">請求合計</span>
                  <span className="text-right text-2xl font-bold text-blue-700">{formatPrice(summary.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link href="/invoices" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
            キャンセル
          </Link>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void saveInvoice('draft')}
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            下書き保存
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? '保存中...' : '請求書を作成する'}
          </button>
        </div>
      </form>

      {showPartPicker && (
        <PartPickerModal
          storeId={storeId}
          onSelect={addPartFromPicker}
          onAddManual={addManualPartItem}
          onClose={() => setShowPartPicker(false)}
        />
      )}
    </AppShell>
  );
}
