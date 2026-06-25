'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import SoftDeleteButton from '@/components/SoftDeleteButton';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };
type CustomerRow = {
  id: string; store_id: string; customer_type: string | null; name: string | null; kana: string | null; phone: string | null; mobile_phone: string | null;
  email: string | null; postal_code: string | null; address: string | null; gender: string | null; birth_date: string | null; line_user_id: string | null;
  line_display_name: string | null; line_friend_status: string | null; delivery_permission: string | boolean | null; desired_maker: string | null;
  desired_model: string | null; desired_displacement: string | null; budget_min: number | null; budget_max: number | null; desired_purchase_timing: string | null;
  trade_in_status: string | null; customer_status: string | null; assigned_user_name: string | null; next_action_date: string | null; memo: string | null;
};
type DealRow = { id: string; vehicle_id: string | null; deal_no: string | null; title: string | null; status: string | null; next_action_at: string | null; source: string | null; lost_reason: string | null; last_contact_at: string | null; trade_in_status: string | null };
type VehicleRow = { id: string; maker: string | null; model_name: string | null; management_no: string | null; inspection_expiry_date?: string | null; sold_date?: string | null };
type MaintenanceRow = { id: string; vehicle_id: string | null; job_no: string | null; job_type: string | null; status: string | null; actual_delivery_date?: string | null };
type QuoteRow = { id: string; quote_no: string | null; title: string | null; status: string | null; total_amount: number | null; created_at: string | null };
type InvoiceRow = { id: string; invoice_no: string | null; title: string | null; status: string | null; total_amount: number | null; created_at: string | null };
type OwnedVehicleRow = { id: string; maker: string | null; model_name: string | null; management_no: string | null; inspection_expiry_date: string | null; sold_date: string | null };
type LineLogRow = { id: string; message_type: string | null; title: string | null; send_status: string | null; error_message: string | null; sent_at: string | null; created_at: string | null };
type CustomerForm = {
  customer_type: string; name: string; kana: string; phone: string; mobile_phone: string; email: string; postal_code: string; address: string; gender: string; birth_date: string;
  line_user_id: string; line_display_name: string; line_friend_status: string; delivery_permission: string; desired_maker: string; desired_model: string; desired_displacement: string;
  budget_min: string; budget_max: string; desired_purchase_timing: string; trade_in_status: string; customer_status: string; assigned_user_name: string; next_action_date: string; memo: string;
};

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
const emptyForm: CustomerForm = {
  customer_type: '個人', name: '', kana: '', phone: '', mobile_phone: '', email: '', postal_code: '', address: '', gender: '', birth_date: '',
  line_user_id: '', line_display_name: '', line_friend_status: '未連携', delivery_permission: '許可', desired_maker: '', desired_model: '', desired_displacement: '',
  budget_min: '', budget_max: '', desired_purchase_timing: '', trade_in_status: '', customer_status: '見込み', assigned_user_name: '', next_action_date: '', memo: '',
};
function displayValue(value: string | number | null | undefined) { return value === null || value === undefined || value === '' ? '-' : String(value); }
function toNullableText(value: string) { return value.trim() === '' ? null : value.trim(); }
function toNullableNumber(value: string) { if (value.trim() === '') return null; const n = Number(value); return Number.isNaN(n) ? null : n; }
function formatDateTime(value: string | null | undefined) { return value ? value.replace('T', ' ').slice(0, 16) : '-'; }
function vehicleLabel(vehicle: VehicleRow | undefined) {
  if (!vehicle) return '-';
  return `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || vehicle.management_no || '-';
}
function mapCustomerToForm(customer: CustomerRow): CustomerForm {
  return {
    customer_type: customer.customer_type ?? '個人', name: customer.name ?? '', kana: customer.kana ?? '', phone: customer.phone ?? '', mobile_phone: customer.mobile_phone ?? '',
    email: customer.email ?? '', postal_code: customer.postal_code ?? '', address: customer.address ?? '', gender: customer.gender ?? '', birth_date: customer.birth_date ?? '',
    line_user_id: customer.line_user_id ?? '', line_display_name: customer.line_display_name ?? '', line_friend_status: customer.line_friend_status ?? '未連携',
    delivery_permission: customer.delivery_permission === false || customer.delivery_permission === '不許可' ? '不許可' : '許可',
    desired_maker: customer.desired_maker ?? '', desired_model: customer.desired_model ?? '', desired_displacement: customer.desired_displacement ?? '',
    budget_min: customer.budget_min === null ? '' : String(customer.budget_min ?? ''), budget_max: customer.budget_max === null ? '' : String(customer.budget_max ?? ''),
    desired_purchase_timing: customer.desired_purchase_timing ?? '', trade_in_status: customer.trade_in_status ?? '', customer_status: customer.customer_status ?? '見込み',
    assigned_user_name: customer.assigned_user_name ?? '', next_action_date: customer.next_action_date ?? '', memo: customer.memo ?? '',
  };
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="mb-5 text-lg font-bold text-slate-950">{title}</h3>{children}</section>;
}
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? 'md:col-span-2 xl:col-span-3' : ''}><span className="text-sm font-bold text-slate-700">{label}</span><div className="mt-2">{children}</div></label>;
}

const basicLabels: Record<'name' | 'kana' | 'phone' | 'mobile_phone' | 'email' | 'postal_code' | 'address', string> = {
  name: '氏名 / 会社名',
  kana: 'フリガナ',
  phone: '電話番号',
  mobile_phone: '携帯TEL',
  email: 'メール',
  postal_code: '郵便番号',
  address: '住所',
};

const desiredLabels: Record<'desired_maker' | 'desired_model' | 'desired_displacement' | 'budget_min' | 'budget_max', string> = {
  desired_maker: '希望メーカー',
  desired_model: '希望車種',
  desired_displacement: '希望排気量',
  budget_min: '予算下限',
  budget_max: '予算上限',
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [storeId, setStoreId] = useState('');
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [lineLogs, setLineLogs] = useState<LineLogRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [ownedVehicles, setOwnedVehicles] = useState<OwnedVehicleRow[]>([]);
  const [lastContactAt, setLastContactAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const vehicleMap = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  function updateField(name: keyof CustomerForm, value: string) { setForm((current) => ({ ...current, [name]: value })); }

  useEffect(() => {
    async function loadCustomer() {
      try {
        setIsLoading(true); setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');
        const { data: member, error: memberError } = await supabase.from<StoreMemberRow>('store_members').select('store_id').eq('user_id', userData.user.id).single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
        setStoreId(member.store_id);
        const [customerResult, dealResult, vehicleResult, maintenanceResult, logResult, quoteResult, invoiceResult, ownedResult] = await Promise.all([
          supabase.from<CustomerRow & { last_contact_at?: string | null }>('customers').select('*').eq('id', customerId).eq('store_id', member.store_id).single(),
          supabase.from<DealRow>('deals').select('id, vehicle_id, deal_no, title, status, next_action_at, source, lost_reason, last_contact_at, trade_in_status').eq('customer_id', customerId).eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<VehicleRow>('vehicles').select('id, maker, model_name, management_no, inspection_expiry_date, sold_date').eq('store_id', member.store_id),
          supabase.from<MaintenanceRow>('maintenance_jobs').select('id, vehicle_id, job_no, job_type, status, actual_delivery_date').eq('customer_id', customerId).eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<LineLogRow>('line_message_logs').select('id, message_type, title, send_status, error_message, sent_at, created_at').eq('customer_id', customerId).eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<QuoteRow>('quotes').select('id, quote_no, title, status, total_amount, created_at').eq('customer_id', customerId).eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<InvoiceRow>('invoices').select('id, invoice_no, title, status, total_amount, created_at').eq('customer_id', customerId).eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<OwnedVehicleRow>('vehicles').select('id, maker, model_name, management_no, inspection_expiry_date, sold_date').eq('store_id', member.store_id),
        ]);
        if (customerResult.error || !customerResult.data) {
          if (customerResult.error?.message.toLowerCase().includes('0 rows')) setNotFound(true);
          else throw new Error(customerResult.error?.message ?? '顧客が見つかりません。');
          return;
        }
        if (dealResult.error) throw new Error(dealResult.error.message);
        if (vehicleResult.error) throw new Error(vehicleResult.error.message);
        if (maintenanceResult.error) throw new Error(maintenanceResult.error.message);
        setForm(mapCustomerToForm(customerResult.data));
        setLastContactAt((customerResult.data as { last_contact_at?: string | null }).last_contact_at ?? null);
        setDeals(dealResult.data ?? []); setVehicles(vehicleResult.data ?? []); setMaintenance(maintenanceResult.data ?? []); setLineLogs(logResult.error ? [] : (logResult.data ?? []).slice(0, 5));
        setQuotes(quoteResult.error ? [] : (quoteResult.data ?? []));
        setInvoices(invoiceResult.error ? [] : (invoiceResult.data ?? []));
        // 保有・購入車両: この顧客のいずれかの商談で参照された車両を抽出（過去保有も含む）
        const ownedIds = new Set((dealResult.data ?? []).map((d) => d.vehicle_id).filter((v): v is string => !!v));
        setOwnedVehicles(((ownedResult.data ?? []) as OwnedVehicleRow[]).filter((v) => ownedIds.has(v.id)));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '顧客詳細の取得に失敗しました。');
      } finally { setIsLoading(false); }
    }
    void loadCustomer();
  }, [customerId]);

  async function handleSave() {
    try {
      setIsSaving(true); setErrorMessage(''); setSuccessMessage('');
      if (!storeId) throw new Error('所属店舗が見つかりません。');
      const supabase = createClient();
      const { error } = await supabase.from<CustomerRow>('customers').update({
        customer_type: toNullableText(form.customer_type), name: toNullableText(form.name), kana: toNullableText(form.kana), phone: toNullableText(form.phone),
        mobile_phone: toNullableText(form.mobile_phone), email: toNullableText(form.email), postal_code: toNullableText(form.postal_code), address: toNullableText(form.address),
        gender: toNullableText(form.gender), birth_date: form.birth_date || null, line_user_id: toNullableText(form.line_user_id), line_display_name: toNullableText(form.line_display_name),
        line_friend_status: toNullableText(form.line_friend_status), delivery_permission: form.delivery_permission, desired_maker: toNullableText(form.desired_maker),
        desired_model: toNullableText(form.desired_model), desired_displacement: toNullableText(form.desired_displacement), budget_min: toNullableNumber(form.budget_min),
        budget_max: toNullableNumber(form.budget_max), desired_purchase_timing: toNullableText(form.desired_purchase_timing), trade_in_status: toNullableText(form.trade_in_status),
        customer_status: toNullableText(form.customer_status), assigned_user_name: toNullableText(form.assigned_user_name), next_action_date: form.next_action_date || null, memo: toNullableText(form.memo),
      }).eq('id', customerId).eq('store_id', storeId);
      if (error) throw new Error(error.message);
      setSuccessMessage('顧客情報を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '顧客情報の保存に失敗しました。');
    } finally { setIsSaving(false); }
  }

  return (
    <AppShell activeLabel="顧客管理" title="顧客詳細" description="顧客情報・LINE・関連商談を確認、編集します" actionButton={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">{isSaving ? '保存中...' : '保存する'}</button><SoftDeleteButton tableName="customers" rowId={customerId} storeId={storeId} targetType="customer" targetLabel={form.name || '顧客'} redirectHref="/customers" /><Link href="/customers" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">顧客一覧に戻る</Link></div>}>
      {isLoading ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">読み込み中...</p> : notFound ? <p className="rounded-2xl bg-white p-5 text-sm font-semibold text-slate-500 shadow-sm">顧客が見つかりません。</p> : (
        <div className="mx-auto max-w-7xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          {successMessage && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}
          <Section title="顧客基本情報"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="顧客種別"><select className={inputClass} value={form.customer_type} onChange={(e) => updateField('customer_type', e.target.value)}><option>個人</option><option>法人</option></select></Field>
            {(['name','kana','phone','mobile_phone','email','postal_code','address'] as const).map((name) => <Field key={name} label={basicLabels[name]}><input type={name === 'email' ? 'email' : 'text'} className={inputClass} value={form[name]} onChange={(e) => updateField(name, e.target.value)} /></Field>)}
            <Field label="性別"><select className={inputClass} value={form.gender} onChange={(e) => updateField('gender', e.target.value)}><option value="">未選択</option><option>男性</option><option>女性</option><option>回答しない</option></select></Field>
            <Field label="生年月日"><input type="date" className={inputClass} value={form.birth_date} onChange={(e) => updateField('birth_date', e.target.value)} /></Field>
          </div></Section>
          <Section title="LINE情報"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="LINE userId"><input className={inputClass} value={form.line_user_id} onChange={(e) => updateField('line_user_id', e.target.value)} /></Field>
            <Field label="LINE表示名"><input className={inputClass} value={form.line_display_name} onChange={(e) => updateField('line_display_name', e.target.value)} /></Field>
            <Field label="LINE友だち状態"><select className={inputClass} value={form.line_friend_status} onChange={(e) => updateField('line_friend_status', e.target.value)}><option>未連携</option><option>友だち</option><option>ブロック</option></select></Field>
            <Field label="配信許可"><select className={inputClass} value={form.delivery_permission} onChange={(e) => updateField('delivery_permission', e.target.value)}><option>許可</option><option>不許可</option></select></Field>
          </div></Section>
          <Section title="希望条件"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(['desired_maker','desired_model','desired_displacement','budget_min','budget_max'] as const).map((name) => <Field key={name} label={desiredLabels[name]}><input type={name.startsWith('budget') ? 'number' : 'text'} className={inputClass} value={form[name]} onChange={(e) => updateField(name, e.target.value)} /></Field>)}
            <Field label="購入希望時期"><select className={inputClass} value={form.desired_purchase_timing} onChange={(e) => updateField('desired_purchase_timing', e.target.value)}><option value="">未選択</option><option>すぐ</option><option>1ヶ月以内</option><option>3ヶ月以内</option><option>半年以内</option><option>未定</option></select></Field>
            <Field label="下取り有無"><select className={inputClass} value={form.trade_in_status} onChange={(e) => updateField('trade_in_status', e.target.value)}><option value="">未選択</option><option>あり</option><option>なし</option><option>未定</option></select></Field>
          </div></Section>
          <Section title="対応管理"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="顧客ステータス"><select className={inputClass} value={form.customer_status} onChange={(e) => updateField('customer_status', e.target.value)}>{['見込み','商談中','購入済み','失注','対応不要'].map((o)=><option key={o}>{o}</option>)}</select></Field>
            <Field label="担当者"><input className={inputClass} value={form.assigned_user_name} onChange={(e) => updateField('assigned_user_name', e.target.value)} /></Field>
            <Field label="次回対応日"><input type="date" className={inputClass} value={form.next_action_date} onChange={(e) => updateField('next_action_date', e.target.value)} /></Field>
            <Field label="メモ" wide><textarea className={`${inputClass} min-h-28`} value={form.memo} onChange={(e) => updateField('memo', e.target.value)} /></Field>
          </div></Section>
          <Section title="顧客接触状況"><div className="grid gap-4 md:grid-cols-3 text-sm"><div><span className="text-slate-500 text-xs">最終接触日</span><div className="font-bold">{formatDateTime(lastContactAt)}</div></div><div><span className="text-slate-500 text-xs">次回連絡予定</span><div className="font-bold">{displayValue(form.next_action_date)}</div></div><div><span className="text-slate-500 text-xs">LINE連携</span><div className="font-bold">{displayValue(form.line_friend_status)}</div></div></div></Section>
          <Section title="関連商談"><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['商談番号','タイトル','対象車両','ステータス','流入経路','失注理由','最終接触','次回対応','詳細'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{deals.length === 0 ? <tr><td colSpan={9} className="px-4 py-4 text-slate-500">データがありません</td></tr> : deals.map((deal)=><tr key={deal.id}><td className="px-4 py-3">{displayValue(deal.deal_no)}</td><td className="px-4 py-3 font-semibold">{displayValue(deal.title)}</td><td className="px-4 py-3">{vehicleLabel(vehicleMap.get(deal.vehicle_id ?? ''))}</td><td className="px-4 py-3">{displayValue(deal.status)}</td><td className="px-4 py-3">{displayValue(deal.source)}</td><td className="px-4 py-3">{displayValue(deal.lost_reason)}</td><td className="px-4 py-3">{formatDateTime(deal.last_contact_at)}</td><td className="px-4 py-3">{formatDateTime(deal.next_action_at)}</td><td className="px-4 py-3"><Link href={`/deals/${deal.id}`} className="font-bold text-blue-700 hover:underline">詳細</Link></td></tr>)}</tbody></table></div></Section>
          <Section title="見積履歴"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['作成日','見積番号','タイトル','ステータス','合計','詳細'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{quotes.length === 0 ? <tr><td colSpan={6} className="px-4 py-4 text-slate-500">データがありません</td></tr> : quotes.map((q)=><tr key={q.id}><td className="px-4 py-3">{formatDateTime(q.created_at)}</td><td className="px-4 py-3">{displayValue(q.quote_no)}</td><td className="px-4 py-3 font-semibold">{displayValue(q.title)}</td><td className="px-4 py-3">{displayValue(q.status)}</td><td className="px-4 py-3 text-right">{q.total_amount?.toLocaleString() ?? '-'}</td><td className="px-4 py-3"><Link href={`/quotes/${q.id}`} className="font-bold text-blue-700 hover:underline">詳細</Link></td></tr>)}</tbody></table></div></Section>
          <Section title="請求履歴"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['作成日','請求番号','タイトル','ステータス','合計','詳細'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{invoices.length === 0 ? <tr><td colSpan={6} className="px-4 py-4 text-slate-500">データがありません</td></tr> : invoices.map((iv)=><tr key={iv.id}><td className="px-4 py-3">{formatDateTime(iv.created_at)}</td><td className="px-4 py-3">{displayValue(iv.invoice_no)}</td><td className="px-4 py-3 font-semibold">{displayValue(iv.title)}</td><td className="px-4 py-3">{displayValue(iv.status)}</td><td className="px-4 py-3 text-right">{iv.total_amount?.toLocaleString() ?? '-'}</td><td className="px-4 py-3"><Link href={`/invoices/${iv.id}`} className="font-bold text-blue-700 hover:underline">詳細</Link></td></tr>)}</tbody></table></div></Section>
          <Section title="保有・購入車両"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['管理番号','車両','車検満了日','納車日'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{ownedVehicles.length === 0 ? <tr><td colSpan={4} className="px-4 py-4 text-slate-500">データがありません</td></tr> : ownedVehicles.map((v)=><tr key={v.id}><td className="px-4 py-3">{displayValue(v.management_no)}</td><td className="px-4 py-3 font-semibold">{`${v.maker ?? ''} ${v.model_name ?? ''}`.trim() || '-'}</td><td className="px-4 py-3">{displayValue(v.inspection_expiry_date)}</td><td className="px-4 py-3">{displayValue(v.sold_date)}</td></tr>)}</tbody></table></div></Section>
          <Section title="関連整備・車検"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['受付番号','対象車両','種別','ステータス','詳細'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{maintenance.length === 0 ? <tr><td colSpan={5} className="px-4 py-4 text-slate-500">データがありません</td></tr> : maintenance.map((job)=><tr key={job.id}><td className="px-4 py-3">{displayValue(job.job_no)}</td><td className="px-4 py-3">{vehicleLabel(vehicleMap.get(job.vehicle_id ?? ''))}</td><td className="px-4 py-3">{displayValue(job.job_type)}</td><td className="px-4 py-3">{displayValue(job.status)}</td><td className="px-4 py-3"><Link href={`/maintenance/${job.id}`} className="font-bold text-blue-700 hover:underline">詳細</Link></td></tr>)}</tbody></table></div></Section>
          <Section title="LINE送信履歴"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['送信日時','メッセージ種別','タイトル','送信状態','エラー'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{lineLogs.length === 0 ? <tr><td colSpan={5} className="px-4 py-4 text-slate-500">データがありません</td></tr> : lineLogs.map((log)=><tr key={log.id}><td className="px-4 py-3">{formatDateTime(log.sent_at ?? log.created_at)}</td><td className="px-4 py-3">{displayValue(log.message_type)}</td><td className="px-4 py-3">{displayValue(log.title)}</td><td className="px-4 py-3">{displayValue(log.send_status)}</td><td className="px-4 py-3 text-red-700">{displayValue(log.error_message)}</td></tr>)}</tbody></table></div></Section>
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-6"><Link href={`/deals/new?customerId=${customerId}`} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700">この顧客で商談を作成</Link><Link href="/deals" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">LINE案内を作成</Link><Link href="/customers" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">顧客一覧に戻る</Link></div>
        </div>
      )}
    </AppShell>
  );
}
