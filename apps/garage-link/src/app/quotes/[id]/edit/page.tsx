'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import PartLineItemsEditor, { type PartLineItem } from '@/components/parts/PartLineItemsEditor';
import PartPickerModal, { type PickedPart } from '@/components/parts/PartPickerModal';
import { logAudit } from '@/lib/audit/logAudit';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string; role: string | null };

type QuoteDetailRow = {
  id: string;
  store_id: string;
  deal_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  quote_no: string | null;
  title: string | null;
  status: string | null;
  issue_status: string | null;
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
  total_amount: number | null;
  payment_method: string | null;
  loan_request: string | null;
  down_payment: number | null;
  installment_count: number | null;
  payment_due_date: string | null;
  customer_note: string | null;
  internal_memo: string | null;
};

type QuoteItemRow = {
  id: string;
  item_type: string | null;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  tax_rate: number | null;
  amount: number | null;
  part_id: string | null;
  cost_price: number | null;
};

type LinkedInvoiceRow = { id: string };

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

type AmountItem = { key: AmountKey; name: string; itemType: string; negative?: boolean };

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

const emptyAmounts: Record<AmountKey, string> = {
  vehicle_base_price: '', registration_fee: '', delivery_maintenance_fee: '',
  inspection_fee: '', liability_insurance: '', weight_tax: '', stamp_fee: '',
  number_plate_fee: '', recycle_deposit: '', accessories: '', custom_fee: '',
  other_fee: '', discount: '', trade_in: '',
};

const emptyForm: QuoteFormState = {
  deal_id: '', customer_id: '', vehicle_id: '', quote_no: '', title: '',
  status: '下書き', issue_date: '', expiry_date: '', assigned_user_name: '',
  customer_name: '', customer_phone: '', customer_email: '', customer_address: '',
  customer_honorific: '様', vehicle_label: '', vehicle_maker: '', vehicle_model_name: '',
  vehicle_year: '', vehicle_mileage_km: '', vehicle_vin: '',
  vehicle_inspection_expiry_date: '', payment_method: '', loan_request: '',
  down_payment: '', installment_count: '', payment_due_date: '',
  customer_note: '', internal_memo: '',
};

function toNullableText(v: string) { return v.trim() === '' ? null : v.trim(); }
function toNumber(v: string) { const n = Number(v); return v.trim() === '' || Number.isNaN(n) ? 0 : n; }
function toNullableNumber(v: string) { if (v.trim() === '') return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function formatPrice(v: number) { return `${v.toLocaleString('ja-JP')}円`; }
function vehicleLabel(v: VehicleOption) { return `${v.maker ?? ''} ${v.model_name ?? ''}`.trim() || v.management_no || '車両名未設定'; }
function customerHonorific(c: CustomerOption) { return c.customer_type === '法人' || c.customer_type === 'corporate' ? '御中' : '様'; }
function dealLabel(d: DealOption) { return `${d.deal_no ? `${d.deal_no} / ` : ''}${d.title ?? '商談名未設定'}`; }

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">{children}</label>;
}

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [formState, setFormState] = useState<QuoteFormState>(emptyForm);
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>(emptyAmounts);
  const [partLineItems, setPartLineItems] = useState<PartLineItem[]>([]);
  const [showPartPicker, setShowPartPicker] = useState(false);

  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [isIssuedQuote, setIsIssuedQuote] = useState(false);

  const beforeRef = useRef({ total_amount: 0, status: '', item_count: 0 });

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === formState.customer_id), [customers, formState.customer_id]);
  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === formState.vehicle_id), [vehicles, formState.vehicle_id]);

  const partsSubtotal = useMemo(() => partLineItems.reduce((sum, item) => {
    return sum + (parseInt(item.quantity, 10) || 1) * (parseFloat(item.unit_price) || 0);
  }, 0), [partLineItems]);

  const summary = useMemo(() => {
    const fixedSubtotal = amountItems
      .filter((item) => !item.negative)
      .reduce((t, item) => t + toNumber(amounts[item.key]), 0);
    const subtotalAmount = fixedSubtotal + partsSubtotal;
    const discountAmount = toNumber(amounts.discount);
    const tradeInAmount = toNumber(amounts.trade_in);
    const taxAmount = 0;
    return { subtotalAmount, taxAmount, discountAmount, tradeInAmount, totalAmount: subtotalAmount + taxAmount - discountAmount - tradeInAmount };
  }, [amounts, partsSubtotal]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        setUserId(userData.user.id);
        setUserEmail(userData.user.email ?? '');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');

        setStoreId(member.store_id);
        setRole(member.role);

        if (member.role === 'viewer') {
          setBlockReason('編集権限がありません。');
          return;
        }

        const [quoteResult, invoiceCheckResult, dealResult, customerResult, vehicleResult, itemResult] =
          await Promise.all([
            supabase
              .from<QuoteDetailRow>('quotes')
              .select('id, store_id, deal_id, customer_id, vehicle_id, quote_no, title, status, issue_status, issue_date, expiry_date, assigned_user_name, customer_name, customer_phone, customer_email, customer_address, customer_honorific, vehicle_label, vehicle_maker, vehicle_model_name, vehicle_year, vehicle_mileage_km, vehicle_vin, vehicle_inspection_expiry_date, total_amount, payment_method, loan_request, down_payment, installment_count, payment_due_date, customer_note, internal_memo')
              .eq('id', id)
              .eq('store_id', member.store_id)
              .single(),
            supabase
              .from<LinkedInvoiceRow>('invoices')
              .select('id')
              .eq('quote_id', id)
              .eq('store_id', member.store_id),
            supabase
              .from<DealOption>('deals')
              .select('id, deal_no, title, customer_id, vehicle_id, assigned_user_name, budget, trade_in_status, loan_request, memo')
              .eq('store_id', member.store_id)
              .order('created_at', { ascending: false }),
            supabase
              .from<CustomerOption>('customers')
              .select('id, name, phone, email, postal_code, address, customer_type, line_display_name')
              .eq('store_id', member.store_id)
              .order('created_at', { ascending: false }),
            supabase
              .from<VehicleOption>('vehicles')
              .select('id, management_no, maker, model_name, model_year, mileage_km, vin, inspection_expiry_date, base_price, total_price, status')
              .eq('store_id', member.store_id)
              .order('created_at', { ascending: false }),
            supabase
              .from<QuoteItemRow>('quote_items')
              .select('id, item_type, name, quantity, unit_price, tax_rate, amount, part_id, cost_price')
              .eq('quote_id', id)
              .eq('store_id', member.store_id)
              .order('item_order', { ascending: true }),
          ]);

        if (quoteResult.error || !quoteResult.data) throw new Error(quoteResult.error?.message ?? '見積書が見つかりません。');
        const quote = quoteResult.data;

        const linkedInvoice = invoiceCheckResult.data?.[0];
        if (linkedInvoice) {
          setLinkedInvoiceId(linkedInvoice.id);
          setBlockReason('この見積書から請求書が作成済みのため、直接編集できません。');
          return;
        }

        if (quote.issue_status === 'cancelled') {
          setBlockReason('この見積書は取消済みのため、編集できません。');
          return;
        }

        setIsIssuedQuote(quote.issue_status === 'issued');

        beforeRef.current = {
          total_amount: quote.total_amount ?? 0,
          status: quote.status ?? '',
          item_count: itemResult.data?.length ?? 0,
        };

        setFormState({
          deal_id: quote.deal_id ?? '',
          customer_id: quote.customer_id ?? '',
          vehicle_id: quote.vehicle_id ?? '',
          quote_no: quote.quote_no ?? '',
          title: quote.title ?? '',
          status: quote.status ?? '下書き',
          issue_date: quote.issue_date ?? '',
          expiry_date: quote.expiry_date ?? '',
          assigned_user_name: quote.assigned_user_name ?? '',
          customer_name: quote.customer_name ?? '',
          customer_phone: quote.customer_phone ?? '',
          customer_email: quote.customer_email ?? '',
          customer_address: quote.customer_address ?? '',
          customer_honorific: quote.customer_honorific ?? '様',
          vehicle_label: quote.vehicle_label ?? '',
          vehicle_maker: quote.vehicle_maker ?? '',
          vehicle_model_name: quote.vehicle_model_name ?? '',
          vehicle_year: quote.vehicle_year !== null ? String(quote.vehicle_year) : '',
          vehicle_mileage_km: quote.vehicle_mileage_km !== null ? String(quote.vehicle_mileage_km) : '',
          vehicle_vin: quote.vehicle_vin ?? '',
          vehicle_inspection_expiry_date: quote.vehicle_inspection_expiry_date ?? '',
          payment_method: quote.payment_method ?? '',
          loan_request: quote.loan_request ?? '',
          down_payment: quote.down_payment !== null ? String(quote.down_payment) : '',
          installment_count: quote.installment_count !== null ? String(quote.installment_count) : '',
          payment_due_date: quote.payment_due_date ?? '',
          customer_note: quote.customer_note ?? '',
          internal_memo: quote.internal_memo ?? '',
        });

        const newAmounts = { ...emptyAmounts };
        for (const item of itemResult.data ?? []) {
          const match = amountItems.find((a) => a.name === item.name);
          if (match && item.amount !== null) {
            newAmounts[match.key] = String(Math.abs(item.amount));
          }
        }
        setAmounts(newAmounts);

        const newParts: PartLineItem[] = (itemResult.data ?? [])
          .filter((item) => item.item_type === 'part' && item.name)
          .map((item) => ({
            localId: item.id,
            part_id: item.part_id ?? null,
            part_no: '',
            name: item.name!,
            quantity: String(item.quantity ?? 1),
            unit_price: String(item.unit_price ?? 0),
            cost_price: item.cost_price !== null ? String(item.cost_price) : '',
            tax_rate: String(item.tax_rate ?? 0.1),
          }));
        setPartLineItems(newParts);

        setDeals(dealResult.data ?? []);
        setCustomers(customerResult.data ?? []);
        setVehicles(vehicleResult.data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '見積書の読み込みに失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [id]);

  function updateField(name: keyof QuoteFormState, value: string) {
    setFormState((current) => {
      if (name === 'deal_id') {
        const deal = deals.find((d) => d.id === value);
        if (!deal) return { ...current, deal_id: value };
        let next: QuoteFormState = {
          ...current, deal_id: deal.id,
          title: deal.title ?? current.title,
          assigned_user_name: deal.assigned_user_name ?? current.assigned_user_name,
          loan_request: deal.loan_request ?? current.loan_request,
        };
        if (deal.customer_id) {
          const c = customers.find((c) => c.id === deal.customer_id);
          if (c) next = { ...next, customer_id: c.id, customer_name: c.name ?? '', customer_phone: c.phone ?? '', customer_email: c.email ?? '', customer_address: c.address ?? '', customer_honorific: customerHonorific(c) };
        }
        if (deal.vehicle_id) {
          const v = vehicles.find((v) => v.id === deal.vehicle_id);
          if (v) {
            next = { ...next, vehicle_id: v.id, vehicle_label: vehicleLabel(v), vehicle_maker: v.maker ?? '', vehicle_model_name: v.model_name ?? '', vehicle_year: v.model_year !== null ? String(v.model_year) : '', vehicle_mileage_km: v.mileage_km !== null ? String(v.mileage_km) : '', vehicle_vin: v.vin ?? '', vehicle_inspection_expiry_date: v.inspection_expiry_date ?? '' };
            if (v.base_price !== null) setAmounts((a) => ({ ...a, vehicle_base_price: String(v.base_price) }));
          }
        }
        return next;
      }
      if (name === 'customer_id') {
        const c = customers.find((c) => c.id === value);
        if (!c) return { ...current, customer_id: value };
        return { ...current, customer_id: c.id, customer_name: c.name ?? '', customer_phone: c.phone ?? '', customer_email: c.email ?? '', customer_address: c.address ?? '', customer_honorific: customerHonorific(c) };
      }
      if (name === 'vehicle_id') {
        const v = vehicles.find((v) => v.id === value);
        if (!v) return { ...current, vehicle_id: value };
        if (v.base_price !== null) setAmounts((a) => ({ ...a, vehicle_base_price: String(v.base_price) }));
        return { ...current, vehicle_id: v.id, vehicle_label: vehicleLabel(v), vehicle_maker: v.maker ?? '', vehicle_model_name: v.model_name ?? '', vehicle_year: v.model_year !== null ? String(v.model_year) : '', vehicle_mileage_km: v.mileage_km !== null ? String(v.mileage_km) : '', vehicle_vin: v.vin ?? '', vehicle_inspection_expiry_date: v.inspection_expiry_date ?? '' };
      }
      return { ...current, [name]: value };
    });
  }

  function addPartFromPicker(picked: PickedPart) {
    setShowPartPicker(false);
    setPartLineItems((prev) => [
      ...prev,
      { localId: `${Date.now()}-${Math.random()}`, part_id: picked.id, part_no: picked.part_no ?? '', name: picked.name, quantity: '1', unit_price: String(picked.unit_price ?? ''), cost_price: String(picked.cost_price ?? ''), tax_rate: '0.1' },
    ]);
  }

  function addManualPartItem() {
    setShowPartPicker(false);
    setPartLineItems((prev) => [
      ...prev,
      { localId: `${Date.now()}-${Math.random()}`, part_id: null, part_no: '', name: '', quantity: '1', unit_price: '', cost_price: '', tax_rate: '0.1' },
    ]);
  }

  async function updateQuote(status: string) {
    setErrorMessage('');
    setIsSaving(true);
    try {
      if (!storeId) throw new Error('所属店舗が見つかりません。');
      if (!formState.quote_no.trim()) throw new Error('見積番号を入力してください。');

      const supabase = createClient();

      const quotePayload = {
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
        vehicle_inspection_expiry_date: toNullableText(formState.vehicle_inspection_expiry_date),
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

      const { error: updateError } = await supabase
        .from<QuoteDetailRow>('quotes')
        .update(quotePayload)
        .eq('id', id)
        .eq('store_id', storeId);
      if (updateError) throw new Error(updateError.message);

      const { error: deleteError } = await supabase
        .from<QuoteItemRow>('quote_items')
        .delete()
        .eq('quote_id', id)
        .eq('store_id', storeId);
      if (deleteError) throw new Error(deleteError.message);

      const itemPayloads: QuoteItemInsert[] = amountItems
        .map((item, index) => {
          const amount = toNumber(amounts[item.key]);
          const signed = item.negative ? amount * -1 : amount;
          return { store_id: storeId, quote_id: id, item_order: index + 1, item_type: item.itemType, name: item.name, quantity: 1, unit_price: signed, tax_rate: 0.1, tax_amount: 0, amount: signed };
        })
        .filter((item) => item.amount !== 0);

      if (itemPayloads.length > 0) {
        const { error } = await supabase.from<QuoteItemInsert>('quote_items').insert(itemPayloads);
        if (error) throw new Error(error.message);
      }

      const partItemPayloads: QuoteItemInsert[] = partLineItems
        .filter((item) => item.name.trim())
        .map((item, index) => {
          const qty = parseInt(item.quantity, 10) || 1;
          const price = parseFloat(item.unit_price) || 0;
          return {
            store_id: storeId, quote_id: id,
            item_order: itemPayloads.length + index + 1,
            item_type: 'part', name: item.name.trim(),
            quantity: qty, unit_price: price,
            tax_rate: parseFloat(item.tax_rate) || 0.1,
            tax_amount: 0, amount: qty * price,
            part_id: item.part_id ?? null,
            cost_price: item.cost_price.trim() ? Math.round(parseFloat(item.cost_price)) : null,
          };
        });

      if (partItemPayloads.length > 0) {
        const { error } = await supabase.from<QuoteItemInsert>('quote_items').insert(partItemPayloads);
        if (error) throw new Error(error.message);
      }

      await logAudit({
        supabase,
        storeId,
        userId,
        userEmail,
        userRole: role ?? undefined,
        action: 'update',
        targetType: 'quote',
        targetId: id,
        targetLabel: formState.quote_no || id,
        beforeData: { total_amount: beforeRef.current.total_amount, status: beforeRef.current.status, item_count: beforeRef.current.item_count },
        afterData: { total_amount: summary.totalAmount, status, item_count: itemPayloads.length + partItemPayloads.length },
      });

      sessionStorage.setItem('flash_quotes', '見積書を更新しました。');
      router.push('/quotes');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '見積書の更新に失敗しました。');
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateQuote(formState.status || '下書き');
  }

  if (isLoading) {
    return (
      <AppShell activeLabel="見積書" title="見積書編集" description="">
        <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">読み込み中...</p>
      </AppShell>
    );
  }

  if (blockReason) {
    return (
      <AppShell activeLabel="見積書" title="見積書編集" description="">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <p className="font-bold text-amber-800">{blockReason}</p>
            {linkedInvoiceId && (
              <p className="mt-2 text-sm text-amber-700">
                請求書の内容を変更したい場合は、請求書を直接編集してください。
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/quotes/${id}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
              見積書詳細に戻る
            </Link>
            {linkedInvoiceId && (
              <Link href={`/invoices/${linkedInvoiceId}`} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                請求書を確認する
              </Link>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeLabel="見積書"
      title={formState.quote_no ? `見積書編集 ${formState.quote_no}` : '見積書編集'}
      description="見積書の内容を編集します"
      actionButton={
        <Link
          href={`/quotes/${id}`}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          キャンセル
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-7xl space-y-8">
        {errorMessage && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}

        {isIssuedQuote && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            この見積書はすでに発行済みです。編集内容は更新履歴に記録されます。
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">見積基本情報</h3>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="quote_no">見積番号</FieldLabel>
              <input id="quote_no" type="text" value={formState.quote_no} onChange={(e) => updateField('quote_no', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="deal_id">商談選択</FieldLabel>
              <select id="deal_id" value={formState.deal_id} onChange={(e) => updateField('deal_id', e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{dealLabel(d)}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="status">見積ステータス</FieldLabel>
              <select id="status" value={formState.status} onChange={(e) => updateField('status', e.target.value)} className={inputClass}>
                {['下書き', '送付済み', '承認済み', '失注', '期限切れ'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="issue_date">発行日</FieldLabel>
              <input id="issue_date" type="date" value={formState.issue_date} onChange={(e) => updateField('issue_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="expiry_date">有効期限</FieldLabel>
              <input id="expiry_date" type="date" value={formState.expiry_date} onChange={(e) => updateField('expiry_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="assigned_user_name">担当者</FieldLabel>
              <input id="assigned_user_name" type="text" value={formState.assigned_user_name} onChange={(e) => updateField('assigned_user_name', e.target.value)} className={inputClass} />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="title">見積タイトル</FieldLabel>
              <input id="title" type="text" value={formState.title} onChange={(e) => updateField('title', e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">顧客情報</h3>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="customer_id">顧客選択</FieldLabel>
              <select id="customer_id" value={formState.customer_id} onChange={(e) => updateField('customer_id', e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name ?? '名称未設定'}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="customer_name">顧客名</FieldLabel>
              <input id="customer_name" type="text" value={formState.customer_name} onChange={(e) => updateField('customer_name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="customer_phone">電話番号</FieldLabel>
              <input id="customer_phone" type="tel" value={formState.customer_phone} onChange={(e) => updateField('customer_phone', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="customer_email">メールアドレス</FieldLabel>
              <input id="customer_email" type="email" value={formState.customer_email} onChange={(e) => updateField('customer_email', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="customer_honorific">敬称</FieldLabel>
              <select id="customer_honorific" value={formState.customer_honorific} onChange={(e) => updateField('customer_honorific', e.target.value)} className={inputClass}>
                {['様', '御中', 'なし'].map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <FieldLabel htmlFor="customer_address">住所</FieldLabel>
              <input id="customer_address" type="text" value={formState.customer_address} onChange={(e) => updateField('customer_address', e.target.value)} className={inputClass} />
            </div>
          </div>
          {selectedCustomer && (
            <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50/70 p-4 sm:mx-6">
              <p className="text-xs font-bold text-slate-500">LINE表示名: <span className="font-semibold text-slate-950">{selectedCustomer.line_display_name ?? '-'}</span></p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">車両情報</h3>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="vehicle_id">車両選択</FieldLabel>
              <select id="vehicle_id" value={formState.vehicle_id} onChange={(e) => updateField('vehicle_id', e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_maker">メーカー</FieldLabel>
              <input id="vehicle_maker" type="text" value={formState.vehicle_maker} onChange={(e) => updateField('vehicle_maker', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_model_name">車種名</FieldLabel>
              <input id="vehicle_model_name" type="text" value={formState.vehicle_model_name} onChange={(e) => updateField('vehicle_model_name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_year">年式</FieldLabel>
              <input id="vehicle_year" type="number" value={formState.vehicle_year} onChange={(e) => updateField('vehicle_year', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_mileage_km">走行距離</FieldLabel>
              <input id="vehicle_mileage_km" type="number" value={formState.vehicle_mileage_km} onChange={(e) => updateField('vehicle_mileage_km', e.target.value)} className={`${inputClass} text-right`} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_vin">車台番号</FieldLabel>
              <input id="vehicle_vin" type="text" value={formState.vehicle_vin} onChange={(e) => updateField('vehicle_vin', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_inspection_expiry_date">車検満了日</FieldLabel>
              <input id="vehicle_inspection_expiry_date" type="date" value={formState.vehicle_inspection_expiry_date} onChange={(e) => updateField('vehicle_inspection_expiry_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="vehicle_label">車両表示名</FieldLabel>
              <input id="vehicle_label" type="text" value={formState.vehicle_label} onChange={(e) => updateField('vehicle_label', e.target.value)} className={inputClass} />
            </div>
          </div>
          {selectedVehicle && (
            <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50/70 p-4 sm:mx-6">
              <p className="text-xs font-bold text-slate-500">支払総額参考: <span className="font-semibold text-slate-950">{selectedVehicle.total_price !== null ? `${selectedVehicle.total_price.toLocaleString('ja-JP')}円` : '-'}</span></p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">費用明細</h3>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            {amountItems.map((item) => (
              <div key={item.key}>
                <FieldLabel htmlFor={item.key}>{item.name}</FieldLabel>
                <input id={item.key} type="number" value={amounts[item.key]} onChange={(e) => setAmounts((a) => ({ ...a, [item.key]: e.target.value }))} className={`${inputClass} text-right`} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">支払条件</h3>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <FieldLabel htmlFor="payment_method">支払方法</FieldLabel>
              <select id="payment_method" value={formState.payment_method} onChange={(e) => updateField('payment_method', e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {['現金', '銀行振込', 'クレジットカード', 'オートローン', '未定'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="loan_request">ローン希望</FieldLabel>
              <select id="loan_request" value={formState.loan_request} onChange={(e) => updateField('loan_request', e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {['あり', 'なし', '未定'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="down_payment">頭金</FieldLabel>
              <input id="down_payment" type="number" value={formState.down_payment} onChange={(e) => updateField('down_payment', e.target.value)} className={`${inputClass} text-right`} />
            </div>
            <div>
              <FieldLabel htmlFor="installment_count">分割回数</FieldLabel>
              <select id="installment_count" value={formState.installment_count} onChange={(e) => updateField('installment_count', e.target.value)} className={inputClass}>
                <option value="">未選択</option>
                {[12, 24, 36, 48, 60, 72, 84].map((n) => <option key={n} value={n}>{n}回</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="payment_due_date">支払期限</FieldLabel>
              <input id="payment_due_date" type="date" value={formState.payment_due_date} onChange={(e) => updateField('payment_due_date', e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">備考・社内メモ</h3>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6">
            <div>
              <FieldLabel htmlFor="customer_note">顧客向け備考</FieldLabel>
              <textarea id="customer_note" rows={5} value={formState.customer_note} onChange={(e) => updateField('customer_note', e.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel htmlFor="internal_memo">社内メモ</FieldLabel>
              <textarea id="internal_memo" rows={5} value={formState.internal_memo} onChange={(e) => updateField('internal_memo', e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
            <div>
              <h3 className="text-lg font-bold text-slate-950">部品・作業明細</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">部品マスタから選択するか、手動で明細を追加します。</p>
            </div>
            <button type="button" onClick={() => setShowPartPicker(true)} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
              + 部品を追加
            </button>
          </div>
          <PartLineItemsEditor items={partLineItems} onChange={setPartLineItems} />
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
                  <span className="text-sm font-bold text-slate-950">見積合計</span>
                  <span className="text-right text-2xl font-bold text-blue-700">{formatPrice(summary.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link href={`/quotes/${id}`} className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
            キャンセル
          </Link>
          <button type="button" disabled={isSaving} onClick={() => void updateQuote('下書き')} className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
            下書き保存
          </button>
          <button type="submit" disabled={isSaving} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {isSaving ? '保存中...' : '見積書を更新する'}
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
