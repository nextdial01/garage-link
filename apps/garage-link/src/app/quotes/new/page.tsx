'use client';


import { toUserErrorMessage } from '@/lib/errors/user-error';
import Link from 'next/link';
import { saveDocument } from '@/lib/business/saveDocument';
import MasterSelect from '@/components/business/MasterSelect';
import { useBusinessSettings } from '@/lib/business/useBusinessSettings';
import { priceLabel, storedPriceToDisplay, type TaxDisplayMode } from '@/lib/business/money';
import { safeDocumentCalculation, importDocument, documentLine, nonTaxFeeKeys, type DocumentHeader, type StoredDocumentLine } from '@/lib/business/documents';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import PartLineItemsEditor, { type PartLineItem } from '@/components/parts/PartLineItemsEditor';
import PartPickerModal, { type PickedPart } from '@/components/parts/PartPickerModal';
import { DOCUMENT_LIMIT_MESSAGE, assertDocumentLimitAvailable } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';
import { manualPartsDocumentLine } from '@/lib/maintenance/formValues';

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
  maintenance_job_id: string;
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
  tax_display_mode: TaxDisplayMode;
  discount_input_amount: number;
  store_id: string;
  deal_id: string | null;
  maintenance_job_id: string | null;
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
  maintenance_job_id: '',
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
  return `${prefix}-${date}-${time}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
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
  const businessSettings = useBusinessSettings();
  const [documentMode, setDocumentMode] = useState<TaxDisplayMode | null>(null);
  const mode = documentMode ?? businessSettings.mode;
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
  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const [partLineItems, setPartLineItems] = useState<PartLineItem[]>([]);
  const [showPartPicker, setShowPartPicker] = useState(false);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === formState.customer_id);
  }, [customers, formState.customer_id]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((vehicle) => vehicle.id === formState.vehicle_id);
  }, [formState.vehicle_id, vehicles]);

  const summary = useMemo(() => safeDocumentCalculation(amountItems, amounts, partLineItems, mode), [amounts, partLineItems, mode]);

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
          .from<StoreMemberRow>('current_user_active_store_membership')
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

        const copyId = new URLSearchParams(window.location.search).get('copyFrom');
        if (copyId) {
          const [source, sourceItems] = await Promise.all([
            supabase.from<DocumentHeader>('quotes').select('*').eq('id', copyId).eq('store_id', member.store_id).single(),
            supabase.from<StoredDocumentLine>('quote_items').select('*').eq('quote_id', copyId).eq('store_id', member.store_id).order('item_order', {ascending:true}),
          ]);
          if (source.error || !source.data || sourceItems.error) throw new Error(source.error?.message || sourceItems.error?.message || 'コピー元を取得できませんでした。');
          const copied = importDocument(source.data, sourceItems.data ?? []);
          setDocumentMode(copied.mode);
          setPartLineItems(copied.lines);
          setAmounts({...initialAmounts, discount:copied.discount, trade_in:copied.tradeIn});
          setFormState(current => {
            const next={...current};
            for(const key of Object.keys(initialFormState) as (keyof QuoteFormState)[]) {
              if (['quote_no','issue_date','expiry_date','status'].includes(key)) continue;
              if (source.data?.[key] != null) next[key]=String(source.data[key]);
            }
            return next;
          });
          return;
        }

        const initialJobId = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('jobId')
          : null;
        if (initialJobId) {
          const [{ data: jobRow, error: jobError }, { data: jobParts, error: jobPartsError }] = await Promise.all([
            supabase
              .from('maintenance_jobs')
              .select('id, customer_id, vehicle_id, job_no, job_type, request_detail, work_items, work_memo, customer_message, labor_amount, parts_amount, work_details, work_details_version, tax_display_mode, discount_input_amount, discount_amount, inspection_amount, legal_fee_amount, additional_amount')
              .eq('id', initialJobId)
              .eq('store_id', member.store_id)
              .single(),
            supabase
              .from('maintenance_job_parts')
              .select('id, part_id, part_no, name, quantity, unit_price, cost_price, tax_rate, discount_amount, work_memo')
              .eq('job_id', initialJobId)
              .eq('store_id', member.store_id)
              .order('created_at', { ascending: true }),
          ]);
          if (jobError) throw new Error(jobError.message);
          if (jobPartsError) throw new Error(jobPartsError.message);

          const jr = jobRow as {
            id: string;
            customer_id: string | null;
            vehicle_id: string | null;
            job_no: string | null;
            job_type: string | null;
            request_detail: string | null;
            work_items: string[] | null;
            work_memo: string | null;
            customer_message: string | null;
            labor_amount: number | null;
            parts_amount: number | null;
            work_details?: Array<{description:string;quantity:number;unit_price:number;tax_rate:number;tax_category?:'taxable'|'exempt'|'out_of_scope';unit?:string;note?:string}>;
            work_details_version?: number;
            tax_display_mode?: TaxDisplayMode | null;
            discount_input_amount?: number | null;
            discount_amount?: number | null;
            inspection_amount?: number | null;
            legal_fee_amount?: number | null;
            additional_amount?: number | null;
          };
          const customer = (customerResult.data ?? []).find((c) => c.id === jr.customer_id) ?? null;
          const vehicle = (vehicleResult.data ?? []).find((v) => v.id === jr.vehicle_id) ?? null;

          setFormState((current) => ({
            ...current,
            maintenance_job_id: jr.id,
            customer_id: jr.customer_id ?? '',
            vehicle_id: jr.vehicle_id ?? '',
            title: jr.job_no ? `整備見積 ${jr.job_no}` : current.title,
            customer_name: customer?.name ?? current.customer_name,
            customer_phone: customer?.phone ?? current.customer_phone,
            customer_email: customer?.email ?? current.customer_email,
            customer_address: customer?.address ?? current.customer_address,
            vehicle_label: vehicle ? [vehicle.management_no, vehicle.maker, vehicle.model_name].filter(Boolean).join(' / ') : current.vehicle_label,
            vehicle_maker: vehicle?.maker ?? current.vehicle_maker,
            vehicle_model_name: vehicle?.model_name ?? current.vehicle_model_name,
            vehicle_year: vehicle?.model_year ? String(vehicle.model_year) : current.vehicle_year,
            vehicle_mileage_km: vehicle?.mileage_km ? String(vehicle.mileage_km) : current.vehicle_mileage_km,
            vehicle_vin: vehicle?.vin ?? current.vehicle_vin,
            customer_note: [jr.request_detail, jr.customer_message].filter(Boolean).join('\n') || current.customer_note,
            internal_memo: jr.work_memo ?? current.internal_memo,
          }));

          const partRows = (jobParts ?? []) as Array<{
            id: string; part_id: string | null; part_no: string | null; name: string;
            quantity: number; unit_price: number; cost_price: number | null; tax_rate: number; discount_amount: number | null; work_memo: string | null;
          }>;
          const newItems: PartLineItem[] = partRows.map((p) => ({
            localId: `${Date.now()}-${p.id}`,
            part_id: p.part_id,
            part_no: p.part_no ?? '',
            name: p.name,
            quantity: String(p.quantity),
            unit_price: String(p.unit_price),
            cost_price: p.cost_price !== null ? String(p.cost_price) : '',
            tax_rate: String(p.tax_rate ?? 0.1), line_discount_input_amount: String(p.discount_amount ?? 0), note: p.work_memo ?? '',
          }));

          const manualParts = manualPartsDocumentLine(jr.parts_amount, partRows.length);
          if (manualParts) newItems.push(manualParts);

          if (jr.work_details_version === 1) {
            for (const [index, row] of (jr.work_details ?? []).entries()) newItems.push(documentLine({ ...row, name: row.description, item_type: 'labor' }, index));
          } else if (jr.labor_amount && jr.labor_amount > 0) {
            newItems.push({
              localId: `${Date.now()}-labor`,
              part_id: null,
              part_no: '',
              name: '工賃',
              quantity: '1',
              unit_price: String(jr.labor_amount),
              cost_price: '',
              tax_rate: '0.1',
            });
          }
          for (const fee of [
            {name:'車検・点検費用',value:jr.inspection_amount,tax_category:'taxable' as const},
            {name:'法定費用',value:jr.legal_fee_amount,tax_category:'out_of_scope' as const},
            {name:'追加費用',value:jr.additional_amount,tax_category:'taxable' as const},
          ]) if(fee.value) newItems.push(documentLine({name:fee.name,quantity:1,unit_price:fee.value,tax_category:fee.tax_category,tax_rate:fee.tax_category==='taxable'?0.1:0,item_type:'fee'},newItems.length));
          setDocumentMode(jr.tax_display_mode ?? 'included');
          setAmounts(current=>({...current,discount:String(jr.discount_input_amount ?? jr.discount_amount ?? 0)}));
          setPartLineItems(newItems);
        }
      } catch (error) {
        setErrorMessage(toUserErrorMessage(error, '選択肢の取得に失敗しました。'));
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    if (saveError && saveErrorRef.current) {
      saveErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [saveError]);

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
              vehicle_base_price: String(storedPriceToDisplay(vehicle.base_price ?? 0, mode)),
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
            vehicle_base_price: String(storedPriceToDisplay(vehicle.base_price ?? 0, mode)),
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
        unit_price: String(storedPriceToDisplay(picked.unit_price ?? 0, mode)),
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
    setSaveError('');
    setIsSaving(true);

    try {
      if (!storeId) {
        throw new Error('所属店舗が見つかりません。');
      }

      if (!formState.quote_no.trim()) {
        throw new Error('見積番号を入力してください。');
      }

      if (summary.error) throw new Error(summary.error);
      if (businessSettings.loading || businessSettings.error || errorMessage) throw new Error(errorMessage || businessSettings.error || '設定の読み込みをお待ちください。');
      const supabase = createClient();
      await assertDocumentLimitAvailable(supabase, storeId);
      const quotePayload: QuoteInsert = {
        store_id: storeId,
        deal_id: toNullableText(formState.deal_id),
        maintenance_job_id: toNullableText(formState.maintenance_job_id),
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
        tax_display_mode: mode,
        discount_input_amount: summary.discount_input_amount,
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

      await saveDocument('quote',storeId,quotePayload,summary.persisted);

      sessionStorage.setItem('flash_quotes', '見積書を保存しました。');
      router.push('/quotes');
    } catch (error) {
      setSaveError(toUserErrorMessage(error, '見積書の保存に失敗しました。'));
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
      <p className="mb-4 text-sm">金額入力：{mode === 'included' ? '税込' : '税抜'}（保存後は帳票に保持されます）{summary.error && <span role="alert" className="ml-3 text-red-600">{summary.error}</span>}</p>
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
              <MasterSelect id="vehicle_maker" kind="vehicle_maker" value={formState.vehicle_maker} onChange={value=>updateField('vehicle_maker',value)} className={inputClass} />
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
                <FieldLabel htmlFor={item.key}>{item.negative ? item.name : priceLabel(item.name, mode, nonTaxFeeKeys.has(item.key) ? 'out_of_scope' : 'taxable')}</FieldLabel>
                <input
                  id={item.key}
                  min="0" step={item.negative ? "1" : "0.0001"}
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
          <PartLineItemsEditor mode={mode} items={partLineItems} onChange={setPartLineItems} />
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

        <div ref={saveErrorRef} className="space-y-3">
          {saveError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
              {saveError}
            </div>
          )}
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
