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

type DealOption = {
  id: string;
  deal_no: string | null;
  title: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  assigned_user_name: string | null;
  budget: number | null;
  trade_in_status: string | null;
  loan_request: string | null;
  memo: string | null;
};

type CustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  customer_type: string | null;
  line_display_name: string | null;
};

type VehicleOption = {
  id: string;
  management_no: string | null;
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

type QuoteFormState = {
  deal_id: string;
  customer_id: string;
  vehicle_id: string;
  quote_no: string;
  title: string;
  status: string;
  issue_date: string;
  expiry_date: string;
  assigned_user_name: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  customer_honorific: string;
  vehicle_label: string;
  vehicle_maker: string;
  vehicle_model_name: string;
  vehicle_year: string;
  vehicle_mileage_km: string;
  vehicle_vin: string;
  vehicle_inspection_expiry_date: string;
  payment_method: string;
  loan_request: string;
  down_payment: string;
  installment_count: string;
  payment_due_date: string;
  customer_note: string;
  internal_memo: string;
};

type QuoteInsert = {
  store_id: string;
  deal_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  quote_no: string;
  title: string | null;
  status: string;
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
};

type QuoteIdRow = {
  id: string;
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

type AmountItem = {
  key: AmountKey;
  name: string;
  itemType: string;
  negative?: boolean;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const amountItems: AmountItem[] = [
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

const initialFormState: QuoteFormState = {
  deal_id: '',
  customer_id: '',
  vehicle_id: '',
  quote_no: '',
  title: '',
  status: '下書き',
  issue_date: '',
  expiry_date: '',
  assigned_user_name: '',
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  customer_address: '',
  customer_honorific: '様',
  vehicle_label: '',
  vehicle_maker: '',
  vehicle_model_name: '',
  vehicle_year: '',
  vehicle_mileage_km: '',
  vehicle_vin: '',
  vehicle_inspection_expiry_date: '',
  payment_method: '',
  loan_request: '',
  down_payment: '',
  installment_count: '',
  payment_due_date: '',
  customer_note: '',
  internal_memo: '',
};

const initialAmounts: Record<AmountKey, string> = {
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

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function toNumber(value: string) {
  if (value.trim() === '') {
    return 0;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function toNullableNumber(value: string) {
  if (value.trim() === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function formatPrice(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function vehicleLabel(vehicle: VehicleOption) {
  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '車両名未設定';
}

function customerHonorific(customer: CustomerOption) {
  return customer.customer_type === '法人' || customer.customer_type === 'corporate'
    ? '御中'
    : '様';
}

function dealLabel(deal: DealOption) {
  const dealNo = deal.deal_no ? `${deal.deal_no} / ` : '';
  return `${dealNo}${deal.title ?? '商談名未設定'}`;
}

function applyCustomerToForm(
  current: QuoteFormState,
  customer: CustomerOption | undefined,
  customerId: string
): QuoteFormState {
  if (!customer) {
    return {
      ...current,
      customer_id: customerId,
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_address: '',
      customer_honorific: '様',
    };
  }

  return {
    ...current,
    customer_id: customer.id,
    customer_name: customer.name ?? '',
    customer_phone: customer.phone ?? '',
    customer_email: customer.email ?? '',
    customer_address: customer.address ?? '',
    customer_honorific: customerHonorific(customer),
  };
}

function applyVehicleToForm(
  current: QuoteFormState,
  vehicle: VehicleOption | undefined,
  vehicleId: string
): QuoteFormState {
  if (!vehicle) {
    return {
      ...current,
      vehicle_id: vehicleId,
      vehicle_label: '',
      vehicle_maker: '',
      vehicle_model_name: '',
      vehicle_year: '',
      vehicle_mileage_km: '',
      vehicle_vin: '',
      vehicle_inspection_expiry_date: '',
    };
  }

  return {
    ...current,
    vehicle_id: vehicle.id,
    vehicle_label: vehicleLabel(vehicle),
    vehicle_maker: vehicle.maker ?? '',
    vehicle_model_name: vehicle.model_name ?? '',
    vehicle_year:
      vehicle.model_year !== null && vehicle.model_year !== undefined
        ? String(vehicle.model_year)
        : '',
    vehicle_mileage_km:
      vehicle.mileage_km !== null && vehicle.mileage_km !== undefined
        ? String(vehicle.mileage_km)
        : '',
    vehicle_vin: vehicle.vin ?? '',
    vehicle_inspection_expiry_date: vehicle.inspection_expiry_date ?? '',
  };
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">
      {children}
    </label>
  );
}

function PreviewItem({
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
        {value === null || value === undefined || value === '' ? '-' : value}
      </dd>
    </div>
  );
}

export default function NewQuotePage() {
  const router = useRouter();
  const [formState, setFormState] = useState<QuoteFormState>(() => ({
    ...initialFormState,
    quote_no: createDocumentNo('Q'),
  }));
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>(initialAmounts);
  const [storeId, setStoreId] = useState('');
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [partLineItems, setPartLineItems] = useState<PartLineItem[]>([]);
  const [showPartPicker, setShowPartPicker] = useState(false);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === formState.customer_id);
  }, [customers, formState.customer_id]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((vehicle) => vehicle.id === formState.vehicle_id);
  }, [formState.vehicle_id, vehicles]);

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
    const totalAmount =
      subtotalAmount + taxAmount - discountAmount - tradeInAmount;

    return {
      subtotalAmount,
      taxAmount,
      discountAmount,
      tradeInAmount,
      totalAmount,
    };
  }, [amounts, partsSubtotal]);

  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true);
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

        setStoreId(member.store_id);

        const [dealResult, customerResult, vehicleResult] = await Promise.all([
          supabase
            .from<DealOption>('deals')
            .select(
              'id, deal_no, title, customer_id, vehicle_id, assigned_user_name, budget, trade_in_status, loan_request, memo'
            )
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<CustomerOption>('customers')
            .select(
              'id, name, phone, email, postal_code, address, customer_type, line_display_name'
            )
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<VehicleOption>('vehicles')
            .select(
              'id, management_no, maker, model_name, model_year, mileage_km, vin, inspection_expiry_date, base_price, total_price, status'
            )
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
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

        setDeals(dealResult.data ?? []);
        setCustomers(customerResult.data ?? []);
        setVehicles(vehicleResult.data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '選択肢の取得に失敗しました。');
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadOptions();
  }, []);

  function updateField(name: keyof QuoteFormState, value: string) {
    setFormState((current) => {
      if (name === 'deal_id') {
        const deal = deals.find((item) => item.id === value);

        if (!deal) {
          return { ...current, deal_id: value };
        }

        let nextState: QuoteFormState = {
          ...current,
          deal_id: deal.id,
          title: deal.title ?? current.title,
          assigned_user_name: deal.assigned_user_name ?? current.assigned_user_name,
          loan_request: deal.loan_request ?? current.loan_request,
        };

        if (deal.customer_id) {
          nextState = applyCustomerToForm(
            nextState,
            customers.find((customer) => customer.id === deal.customer_id),
            deal.customer_id
          );
        }

        if (deal.vehicle_id) {
          const vehicle = vehicles.find((item) => item.id === deal.vehicle_id);
          nextState = applyVehicleToForm(nextState, vehicle, deal.vehicle_id);

          if (vehicle?.base_price !== null && vehicle?.base_price !== undefined) {
            setAmounts((currentAmounts) => ({
              ...currentAmounts,
              vehicle_base_price: String(vehicle.base_price),
            }));
          }
        }

        return nextState;
      }

      if (name === 'customer_id') {
        return applyCustomerToForm(
          current,
          customers.find((customer) => customer.id === value),
          value
        );
      }

      if (name === 'vehicle_id') {
        const vehicle = vehicles.find((item) => item.id === value);

        if (vehicle?.base_price !== null && vehicle?.base_price !== undefined) {
          setAmounts((currentAmounts) => ({
            ...currentAmounts,
            vehicle_base_price: String(vehicle.base_price),
          }));
        }

        return applyVehicleToForm(current, vehicle, value);
      }

      return {
        ...current,
        [name]: value,
      };
    });
  }

  function updateAmount(key: AmountKey, value: string) {
    setAmounts((current) => ({
      ...current,
      [key]: value,
    }));
  }

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

  async function saveQuote(status: string) {
    setErrorMessage('');
    setIsSaving(true);

    try {
      if (!storeId) {
        throw new Error('所属店舗が見つかりません。');
      }

      if (!formState.quote_no.trim()) {
        throw new Error('見積番号を入力してください。');
      }

      const supabase = createClient();
      await assertDocumentLimitAvailable(supabase, storeId);
      const quotePayload: QuoteInsert = {
        store_id: storeId,
        deal_id: toNullableText(formState.deal_id),
        customer_id: toNullableText(formState.customer_id),
        vehicle_id: toNullableText(formState.vehicle_id),
        quote_no: formState.quote_no.trim(),
        title: toNullableText(formState.title),
        status,
        issue_date: toNullableText(formState.issue_date),
        expiry_date: toNullableText(formState.expiry_date),
        assigned_user_name: toNullableText(formState.assigned_user_name),
        customer_name: toNullableText(formState.customer_name),
        customer_phone: toNullableText(formState.customer_phone),
        customer_email: toNullableText(formState.customer_email),
        customer_address: toNullableText(formState.customer_address),
        customer_honorific: toNullableText(formState.customer_honorific),
        vehicle_label: toNullableText(formState.vehicle_label),
        vehicle_maker: toNullableText(formState.vehicle_maker),
        vehicle_model_name: toNullableText(formState.vehicle_model_name),
        vehicle_year: toNullableNumber(formState.vehicle_year),
        vehicle_mileage_km: toNullableNumber(formState.vehicle_mileage_km),
        vehicle_vin: toNullableText(formState.vehicle_vin),
        vehicle_inspection_expiry_date: toNullableText(
          formState.vehicle_inspection_expiry_date
        ),
        subtotal_amount: summary.subtotalAmount,
        tax_amount: summary.taxAmount,
        discount_amount: summary.discountAmount,
        trade_in_amount: summary.tradeInAmount,
        total_amount: summary.totalAmount,
        payment_method: toNullableText(formState.payment_method),
        loan_request: toNullableText(formState.loan_request),
        down_payment: toNumber(formState.down_payment),
        installment_count: toNullableNumber(formState.installment_count),
        payment_due_date: toNullableText(formState.payment_due_date),
        customer_note: toNullableText(formState.customer_note),
        internal_memo: toNullableText(formState.internal_memo),
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
          const enteredAmount = toNumber(amounts[item.key]);
          const signedAmount = item.negative ? enteredAmount * -1 : enteredAmount;

          return {
            store_id: storeId,
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
          return {
            store_id: storeId,
            quote_id: quote.id,
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
          .from<QuoteItemInsert>('quote_items')
          .insert(partItemPayloads);
        if (partItemError) throw new Error(partItemError.message);
      }

      router.push(`/quotes/${quote.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '見積書の保存に失敗しました。');
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveQuote(formState.status || '下書き');
  }

  return (
    <AppShell
      activeLabel="見積書"
      title="見積書作成"
      description="顧客・車両・諸費用をもとに見積書を作成します"
      actionButton={
        <Link
          href="/quotes"
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
            商談・顧客・車両の選択肢を読み込み中です...
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">見積基本情報</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              見積番号、発行日、有効期限、紐付ける商談を設定します。
            </p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="quote_no">見積番号</FieldLabel>
              <input
                id="quote_no"
                type="text"
                value={formState.quote_no}
                onChange={(event) => updateField('quote_no', event.target.value)}
                placeholder="例：Q-2026-000001"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="deal_id">商談選択</FieldLabel>
              <select
                id="deal_id"
                value={formState.deal_id}
                onChange={(event) => updateField('deal_id', event.target.value)}
                className={inputClass}
              >
                <option value="">未選択</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {dealLabel(deal)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="status">見積ステータス</FieldLabel>
              <select
                id="status"
                value={formState.status}
                onChange={(event) => updateField('status', event.target.value)}
                className={inputClass}
              >
                {['下書き', '送付済み', '承認済み', '失注', '期限切れ'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="issue_date">発行日</FieldLabel>
              <input
                id="issue_date"
                type="date"
                value={formState.issue_date}
                onChange={(event) => updateField('issue_date', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="expiry_date">有効期限</FieldLabel>
              <input
                id="expiry_date"
                type="date"
                value={formState.expiry_date}
                onChange={(event) => updateField('expiry_date', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="assigned_user_name">担当者</FieldLabel>
              <input
                id="assigned_user_name"
                type="text"
                value={formState.assigned_user_name}
                onChange={(event) =>
                  updateField('assigned_user_name', event.target.value)
                }
                placeholder="例：山田"
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="title">見積タイトル</FieldLabel>
              <input
                id="title"
                type="text"
                value={formState.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="例：CB400SF 見積書"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">顧客情報</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              見積書に記載する顧客情報を設定します。
            </p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="customer_id">顧客選択</FieldLabel>
              <select
                id="customer_id"
                value={formState.customer_id}
                onChange={(event) => updateField('customer_id', event.target.value)}
                className={inputClass}
              >
                <option value="">未選択</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name ?? '名称未設定'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="customer_name">顧客名</FieldLabel>
              <input
                id="customer_name"
                type="text"
                value={formState.customer_name}
                onChange={(event) => updateField('customer_name', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="customer_phone">電話番号</FieldLabel>
              <input
                id="customer_phone"
                type="tel"
                value={formState.customer_phone}
                onChange={(event) => updateField('customer_phone', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="customer_email">メールアドレス</FieldLabel>
              <input
                id="customer_email"
                type="email"
                value={formState.customer_email}
                onChange={(event) => updateField('customer_email', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="customer_honorific">敬称</FieldLabel>
              <select
                id="customer_honorific"
                value={formState.customer_honorific}
                onChange={(event) =>
                  updateField('customer_honorific', event.target.value)
                }
                className={inputClass}
              >
                {['様', '御中', 'なし'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="customer_address">住所</FieldLabel>
              <input
                id="customer_address"
                type="text"
                value={formState.customer_address}
                onChange={(event) =>
                  updateField('customer_address', event.target.value)
                }
                className={inputClass}
              />
            </div>
          </div>
          <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:mx-6">
            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <PreviewItem label="顧客名" value={formState.customer_name} />
              <PreviewItem label="電話番号" value={formState.customer_phone} />
              <PreviewItem label="メールアドレス" value={formState.customer_email} />
              <PreviewItem label="LINE表示名" value={selectedCustomer?.line_display_name} />
            </dl>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">車両情報</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              見積対象の車両情報を設定します。
            </p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="vehicle_id">車両選択</FieldLabel>
              <select
                id="vehicle_id"
                value={formState.vehicle_id}
                onChange={(event) => updateField('vehicle_id', event.target.value)}
                className={inputClass}
              >
                <option value="">未選択</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicleLabel(vehicle)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_maker">メーカー</FieldLabel>
              <input
                id="vehicle_maker"
                type="text"
                value={formState.vehicle_maker}
                onChange={(event) => updateField('vehicle_maker', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_model_name">車種名</FieldLabel>
              <input
                id="vehicle_model_name"
                type="text"
                value={formState.vehicle_model_name}
                onChange={(event) =>
                  updateField('vehicle_model_name', event.target.value)
                }
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_year">年式</FieldLabel>
              <input
                id="vehicle_year"
                type="number"
                value={formState.vehicle_year}
                onChange={(event) => updateField('vehicle_year', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_mileage_km">走行距離</FieldLabel>
              <input
                id="vehicle_mileage_km"
                type="number"
                value={formState.vehicle_mileage_km}
                onChange={(event) =>
                  updateField('vehicle_mileage_km', event.target.value)
                }
                className={`${inputClass} text-right`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_vin">車台番号</FieldLabel>
              <input
                id="vehicle_vin"
                type="text"
                value={formState.vehicle_vin}
                onChange={(event) => updateField('vehicle_vin', event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_inspection_expiry_date">車検満了日</FieldLabel>
              <input
                id="vehicle_inspection_expiry_date"
                type="date"
                value={formState.vehicle_inspection_expiry_date}
                onChange={(event) =>
                  updateField('vehicle_inspection_expiry_date', event.target.value)
                }
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_label">車両表示名</FieldLabel>
              <input
                id="vehicle_label"
                type="text"
                value={formState.vehicle_label}
                onChange={(event) => updateField('vehicle_label', event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:mx-6">
            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <PreviewItem label="管理番号" value={selectedVehicle?.management_no} />
              <PreviewItem label="メーカー・車種" value={formState.vehicle_label} />
              <PreviewItem label="支払総額参考" value={selectedVehicle?.total_price ? formatPrice(selectedVehicle.total_price) : '-'} />
              <PreviewItem label="ステータス" value={selectedVehicle?.status} />
            </dl>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">費用明細</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              車両本体価格、登録費用、整備費用、保険、税金、値引きなどを入力します。
            </p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            {amountItems.map((item) => (
              <div key={item.key}>
                <FieldLabel htmlFor={item.key}>{item.name}</FieldLabel>
                <input
                  id={item.key}
                  type="number"
                  value={amounts[item.key]}
                  onChange={(event) => updateAmount(item.key, event.target.value)}
                  className={`${inputClass} text-right`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">支払条件</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              支払い方法やローン希望を登録します。
            </p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="payment_method">支払方法</FieldLabel>
              <select
                id="payment_method"
                value={formState.payment_method}
                onChange={(event) => updateField('payment_method', event.target.value)}
                className={inputClass}
              >
                <option value="">未選択</option>
                {['現金', '銀行振込', 'クレジットカード', 'オートローン', '未定'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="loan_request">ローン希望</FieldLabel>
              <select
                id="loan_request"
                value={formState.loan_request}
                onChange={(event) => updateField('loan_request', event.target.value)}
                className={inputClass}
              >
                <option value="">未選択</option>
                {['あり', 'なし', '未定'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="down_payment">頭金</FieldLabel>
              <input
                id="down_payment"
                type="number"
                value={formState.down_payment}
                onChange={(event) => updateField('down_payment', event.target.value)}
                className={`${inputClass} text-right`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="installment_count">分割回数</FieldLabel>
              <select
                id="installment_count"
                value={formState.installment_count}
                onChange={(event) =>
                  updateField('installment_count', event.target.value)
                }
                className={inputClass}
              >
                <option value="">未選択</option>
                {[12, 24, 36, 48, 60, 72, 84].map((option) => (
                  <option key={option} value={option}>
                    {option}回
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="payment_due_date">支払期限</FieldLabel>
              <input
                id="payment_due_date"
                type="date"
                value={formState.payment_due_date}
                onChange={(event) =>
                  updateField('payment_due_date', event.target.value)
                }
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">備考・社内メモ</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              顧客向けの備考と、社内用メモを登録します。
            </p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6">
            <div>
              <FieldLabel htmlFor="customer_note">顧客向け備考</FieldLabel>
              <textarea
                id="customer_note"
                rows={5}
                value={formState.customer_note}
                onChange={(event) => updateField('customer_note', event.target.value)}
                placeholder="例：本見積は発行日より14日間有効です。"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel htmlFor="internal_memo">社内メモ</FieldLabel>
              <textarea
                id="internal_memo"
                rows={5}
                value={formState.internal_memo}
                onChange={(event) => updateField('internal_memo', event.target.value)}
                placeholder="例：価格相談あり。下取り車確認予定。"
                className={inputClass}
              />
            </div>
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

        <section className="rounded-2xl border border-blue-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">金額サマリー</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              見積金額の合計を確認します。
            </p>
          </div>
          <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1fr_420px]">
            <div className="rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">
              金額は入力内容からリアルタイムで集計します。値引きと下取りは合計から差し引きます。
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
              <div className="space-y-3">
                {[
                  ['小計', summary.subtotalAmount],
                  ['消費税', summary.taxAmount],
                  ['値引き', summary.discountAmount * -1],
                  ['下取り', summary.tradeInAmount * -1],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-slate-600">
                      {label}
                    </span>
                    <span className="text-right text-sm font-bold text-slate-950">
                      {formatPrice(Number(value))}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 border-t border-blue-200 pt-4">
                  <span className="text-sm font-bold text-slate-950">見積合計</span>
                  <span className="text-right text-2xl font-bold text-blue-700">
                    {formatPrice(summary.totalAmount)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            href="/quotes"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            キャンセル
          </Link>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void saveQuote('下書き')}
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            下書き保存
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? '保存中...' : '見積書を作成する'}
          </button>
        </div>

        <p className="text-xs text-slate-500">
          ※ 見積書を保存後、詳細画面からPDFを発行できます。
        </p>
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
