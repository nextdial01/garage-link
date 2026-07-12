'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import SoftDeleteButton from '@/components/SoftDeleteButton';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };
type VehicleRow = {
  id: string;
  store_id: string;
  management_no: string | null;
  vehicle_type: string | null;
  maker: string | null;
  model_name: string | null;
  grade: string | null;
  vin: string | null;
  registration_no: string | null;
  first_registration_month: string | null;
  model_year: number | null;
  displacement_cc: number | null;
  mileage_km: number | null;
  color: string | null;
  inspection_expiry_date: string | null;
  purchase_price: number | null;
  base_price: number | null;
  total_price: number | null;
  market_value: number | null;
  market_source: string | null;
  market_checked_at: string | null;
  market_conditions: string | null;
  market_note: string | null;
  status: string | null;
  location_name: string | null;
  description: string | null;
  internal_memo: string | null;
};
type DealRow = { id: string; customer_id: string | null; deal_no: string | null; title: string | null; status: string | null; next_action_at: string | null };
type CustomerRow = { id: string; name: string | null };
type MaintenanceRow = { id: string; job_no: string | null; job_type: string | null; status: string | null; scheduled_in_at: string | null; scheduled_delivery_at: string | null };
type ListingStatusRow = { id: string; vehicle_id: string; channel: string; status: string; listing_url: string | null; last_checked_at: string | null; error_message: string | null };

type VehicleForm = {
  management_no: string; vehicle_type: string; maker: string; model_name: string; grade: string; vin: string; registration_no: string;
  first_registration_month: string; model_year: string; displacement_cc: string; mileage_km: string; color: string; inspection_expiry_date: string;
  purchase_price: string; base_price: string; total_price: string; market_value: string; market_source: string; market_checked_at: string; market_conditions: string; market_note: string;
  status: string; location_name: string; description: string; internal_memo: string;
};

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
const emptyForm: VehicleForm = {
  management_no: '', vehicle_type: '', maker: '', model_name: '', grade: '', vin: '', registration_no: '', first_registration_month: '',
  model_year: '', displacement_cc: '', mileage_km: '', color: '', inspection_expiry_date: '', purchase_price: '', base_price: '', total_price: '', market_value: '', market_source: '', market_checked_at: '', market_conditions: '', market_note: '',
  status: '在庫中', location_name: '', description: '', internal_memo: '',
};

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}
function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}
function toNullableText(value: string) {
  const trimmed = value.trim();

  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
    return null;
  }

  return trimmed;
}
function toNullableNumber(value: string) {
  if (value.trim() === '') return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}
function mapVehicleToForm(vehicle: VehicleRow): VehicleForm {
  const text = (value: string | null | undefined) => {
    if (value === null || value === undefined || value === 'undefined' || value === 'null') {
      return '';
    }
    return value;
  };

  return {
    management_no: text(vehicle.management_no),
    vehicle_type: text(vehicle.vehicle_type),
    maker: text(vehicle.maker),
    model_name: text(vehicle.model_name),
    grade: vehicle.grade ?? '',
    vin: vehicle.vin ?? '',
    registration_no: vehicle.registration_no ?? '',
    first_registration_month: vehicle.first_registration_month ?? '',
    model_year: vehicle.model_year === null ? '' : String(vehicle.model_year ?? ''),
    displacement_cc: vehicle.displacement_cc === null ? '' : String(vehicle.displacement_cc ?? ''),
    mileage_km: vehicle.mileage_km === null ? '' : String(vehicle.mileage_km ?? ''),
    color: vehicle.color ?? '',
    inspection_expiry_date: vehicle.inspection_expiry_date ?? '',
    purchase_price: vehicle.purchase_price === null ? '' : String(vehicle.purchase_price ?? ''),
    base_price: vehicle.base_price === null ? '' : String(vehicle.base_price ?? ''),
    total_price: vehicle.total_price === null ? '' : String(vehicle.total_price ?? ''),
    market_value: vehicle.market_value === null ? '' : String(vehicle.market_value ?? ''),
    market_source: vehicle.market_source ?? '', market_checked_at: vehicle.market_checked_at ?? '',
    market_conditions: vehicle.market_conditions ?? '', market_note: vehicle.market_note ?? '',
    status: vehicle.status ?? '在庫中',
    location_name: vehicle.location_name ?? '',
    description: vehicle.description ?? '',
    internal_memo: vehicle.internal_memo ?? '',
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="mb-5 text-lg font-bold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? 'md:col-span-2 xl:col-span-3' : ''}><span className="text-sm font-bold text-slate-700">{label}</span><div className="mt-2">{children}</div></label>;
}

const priceLabels: Record<'purchase_price' | 'base_price' | 'total_price', string> = {
  purchase_price: '仕入価格',
  base_price: '車両本体価格',
  total_price: '支払総額',
};

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const [storeId, setStoreId] = useState('');
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [listingStatuses, setListingStatuses] = useState<ListingStatusRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  function updateField(name: keyof VehicleForm, value: string) { setForm((current) => ({ ...current, [name]: value })); }

  useEffect(() => {
    async function loadVehicle() {
      try {
        setIsLoading(true); setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');
        const { data: member, error: memberError } = await supabase.from<StoreMemberRow>('store_members').select('store_id').eq('user_id', userData.user.id).single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
        setStoreId(member.store_id);
        const [vehicleResult, dealResult, customerResult, maintenanceResult, listingResult] = await Promise.all([
          supabase.from<VehicleRow>('vehicles').select('*').eq('id', vehicleId).eq('store_id', member.store_id).single(),
          supabase.from<DealRow>('deals').select('id, customer_id, deal_no, title, status, next_action_at').eq('vehicle_id', vehicleId).eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<CustomerRow>('customers').select('id, name').eq('store_id', member.store_id),
          supabase.from<MaintenanceRow>('maintenance_jobs').select('id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at').eq('vehicle_id', vehicleId).eq('store_id', member.store_id).order('created_at', { ascending: false }),
          supabase.from<ListingStatusRow>('vehicle_listing_statuses').select('id, vehicle_id, channel, status, listing_url, last_checked_at, error_message').eq('vehicle_id', vehicleId).eq('store_id', member.store_id),
        ]);
        if (vehicleResult.error || !vehicleResult.data) {
          if (vehicleResult.error?.message.toLowerCase().includes('0 rows')) setNotFound(true);
          else throw new Error(vehicleResult.error?.message ?? '車両が見つかりません。');
          return;
        }
        if (dealResult.error) throw new Error(dealResult.error.message);
        if (customerResult.error) throw new Error(customerResult.error.message);
        if (maintenanceResult.error) throw new Error(maintenanceResult.error.message);
        if (listingResult.error) throw new Error(listingResult.error.message);
        setForm(mapVehicleToForm(vehicleResult.data));
        setDeals(dealResult.data ?? []);
        setCustomers(customerResult.data ?? []);
        setMaintenance(maintenanceResult.data ?? []);
        setListingStatuses(listingResult.data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '車両詳細の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }
    void loadVehicle();
  }, [vehicleId]);

  async function handleSave() {
    try {
      setIsSaving(true); setErrorMessage(''); setSuccessMessage('');
      if (!storeId) throw new Error('所属店舗が見つかりません。');
      const supabase = createClient();
      const { error } = await supabase.from<VehicleRow>('vehicles').update({
        management_no: toNullableText(form.management_no), vehicle_type: toNullableText(form.vehicle_type), maker: toNullableText(form.maker),
        model_name: toNullableText(form.model_name), grade: toNullableText(form.grade), vin: toNullableText(form.vin), registration_no: toNullableText(form.registration_no),
        first_registration_month: toNullableText(form.first_registration_month), model_year: toNullableNumber(form.model_year), displacement_cc: toNullableNumber(form.displacement_cc),
        mileage_km: toNullableNumber(form.mileage_km), color: toNullableText(form.color), inspection_expiry_date: form.inspection_expiry_date || null,
        purchase_price: toNullableNumber(form.purchase_price), base_price: toNullableNumber(form.base_price), total_price: toNullableNumber(form.total_price),
        market_value: toNullableNumber(form.market_value), market_source: toNullableText(form.market_source), market_checked_at: form.market_checked_at || null,
        market_conditions: toNullableText(form.market_conditions), market_note: toNullableText(form.market_note),
        status: toNullableText(form.status), location_name: toNullableText(form.location_name), description: toNullableText(form.description), internal_memo: toNullableText(form.internal_memo),
      }).eq('id', vehicleId).eq('store_id', storeId);
      if (error) throw new Error(error.message);
      setSuccessMessage('車両情報を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '車両情報の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveListingStatus(channel: string, status: string, listingUrl: string) {
    try {
      setErrorMessage(''); setSuccessMessage('');
      if (!storeId) throw new Error('所属店舗が見つかりません。');
      const supabase = createClient();
      const current = listingStatuses.find((item) => item.channel === channel);
      const { data, error } = await supabase.from<ListingStatusRow>('vehicle_listing_statuses').upsert({
        ...(current?.id ? { id: current.id } : {}), store_id: storeId, vehicle_id: vehicleId, channel, status,
        listing_url: toNullableText(listingUrl), last_checked_at: new Date().toISOString(),
        error_message: status === 'エラー' ? current?.error_message ?? null : null,
      }, { onConflict: 'vehicle_id,channel' }).select('id, vehicle_id, channel, status, listing_url, last_checked_at, error_message').single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('掲載状態を保存できませんでした。');
      setListingStatuses((items) => [...items.filter((item) => item.channel !== channel), data]);
      setSuccessMessage(`${channel}の掲載状態を保存しました。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '掲載状態の保存に失敗しました。');
    }
  }

  function listingStatus(channel: string) {
    return listingStatuses.find((item) => item.channel === channel);
  }

  function listingNextAction(status: string) {
    if (status === '掲載中') return '対応不要';
    if (status === 'エラー') return 'エラー内容を確認';
    if (status === '停止') return '再掲載するか確認';
    return '掲載先を設定';
  }

  return (
    <AppShell activeLabel="車両管理" title="車両詳細" description="車両台帳・価格・関連情報を確認、編集します" actionButton={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">{isSaving ? '保存中...' : '保存する'}</button><SoftDeleteButton tableName="vehicles" rowId={vehicleId} storeId={storeId} targetType="vehicle" targetLabel={form.management_no || `${form.maker} ${form.model_name}`.trim() || '車両'} redirectHref="/vehicles" /><Link href="/vehicles" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">車両一覧に戻る</Link></div>}>
      {isLoading ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">読み込み中...</p> : notFound ? <p className="rounded-2xl bg-white p-5 text-sm font-semibold text-slate-500 shadow-sm">車両が見つかりません。</p> : (
        <div className="mx-auto max-w-7xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          {successMessage && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}
          <Section title="車両基本情報">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {([
                ['management_no','管理番号','text'],['vehicle_type','車両タイプ','text'],['maker','メーカー','text'],['model_name','車種名','text'],['grade','グレード','text'],['vin','車台番号','text'],['registration_no','登録番号','text'],['first_registration_month','初度登録年月','text'],['model_year','年式','number'],['displacement_cc','排気量','number'],['mileage_km','走行距離','number'],['color','色','text'],
              ] as [keyof VehicleForm,string,string][]).map(([name,label,type]) => <Field key={name} label={label}><input type={type} className={inputClass} value={form[name]} onChange={(event) => updateField(name, event.target.value)} /></Field>)}
            </div>
          </Section>
          <Section title="車検・状態">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="車検満了日"><input type="date" className={inputClass} value={form.inspection_expiry_date} onChange={(event) => updateField('inspection_expiry_date', event.target.value)} /></Field>
              <Field label="ステータス"><select className={inputClass} value={form.status} onChange={(event) => updateField('status', event.target.value)}>{['在庫中','展示中','商談中','整備中','売約済み','納車済み'].map((option) => <option key={option}>{option}</option>)}</select></Field>
              <Field label="保管場所"><input className={inputClass} value={form.location_name} onChange={(event) => updateField('location_name', event.target.value)} /></Field>
              <Field label="説明" wide><textarea className={`${inputClass} min-h-24`} value={form.description} onChange={(event) => updateField('description', event.target.value)} /></Field>
              <Field label="社内メモ" wide><textarea className={`${inputClass} min-h-24`} value={form.internal_memo} onChange={(event) => updateField('internal_memo', event.target.value)} /></Field>
            </div>
          </Section>
          <Section title="価格情報">
            <div className="grid gap-4 md:grid-cols-3">
              {(['purchase_price','base_price','total_price'] as const).map((name) => <Field key={name} label={priceLabels[name]}><input type="number" className={`${inputClass} text-right`} value={form[name]} onChange={(event) => updateField(name, event.target.value)} /></Field>)}
            </div>
          </Section>
          <Section title="相場確認">
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">相場は参考情報です。出所・確認日・条件がない数字は相場として扱いません。</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="参考相場"><input type="number" className={`${inputClass} text-right`} value={form.market_value} onChange={(event) => updateField('market_value', event.target.value)} placeholder="未確認" /></Field>
              <Field label="出どころ"><input className={inputClass} value={form.market_source} onChange={(event) => updateField('market_source', event.target.value)} placeholder="例：Goo小売 / AA / 自店実績" /></Field>
              <Field label="確認日"><input type="date" className={inputClass} value={form.market_checked_at} onChange={(event) => updateField('market_checked_at', event.target.value)} /></Field>
              <Field label="検索条件" wide><input className={inputClass} value={form.market_conditions} onChange={(event) => updateField('market_conditions', event.target.value)} placeholder="例：2021年・5万km・大阪府" /></Field>
              <Field label="相場メモ" wide><textarea className={`${inputClass} min-h-20`} value={form.market_note} onChange={(event) => updateField('market_note', event.target.value)} placeholder="価格を決めた理由など" /></Field>
            </div>
            <p className="mt-4 text-sm font-bold text-slate-700">{form.market_value && form.market_source && form.market_checked_at ? `参考相場 ${Number(form.market_value).toLocaleString()}円（${form.market_source}・${form.market_checked_at}確認）` : '相場未確認'}</p>
          </Section>
          <Section title="掲載状況">
            <p className="mb-4 text-sm text-slate-500">外部媒体との自動連携前でも、今どこに掲載しているかを記録できます。</p>
            <div className="space-y-3">
              {['Goo', 'カーセンサー', '自社サイト', 'Google'].map((channel) => {
                const current = listingStatus(channel);
                const currentStatus = current?.status ?? '未掲載';
                return <div key={channel} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_170px_1.5fr_auto] md:items-center">
                  <div><p className="font-bold text-slate-950">{channel}</p><p className="mt-1 text-xs text-slate-500">次にすること: {listingNextAction(currentStatus)}</p>{current?.last_checked_at && <p className="mt-1 text-xs text-slate-400">確認: {formatDateTime(current.last_checked_at)}</p>}</div>
                  <select aria-label={`${channel}の掲載状態`} className={inputClass} defaultValue={currentStatus} id={`listing-status-${channel}`}>
                    {['未掲載', '掲載中', 'エラー', '停止'].map((option) => <option key={option}>{option}</option>)}
                  </select>
                  <input aria-label={`${channel}の掲載URL`} className={inputClass} defaultValue={current?.listing_url ?? ''} id={`listing-url-${channel}`} placeholder="掲載URL（任意）" />
                  <button type="button" onClick={() => { const status = document.getElementById(`listing-status-${channel}`) as HTMLSelectElement | null; const url = document.getElementById(`listing-url-${channel}`) as HTMLInputElement | null; void saveListingStatus(channel, status?.value ?? '未掲載', url?.value ?? ''); }} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">保存</button>
                </div>;
              })}
            </div>
          </Section>
          <Section title="関連商談">
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['商談番号','商談タイトル','顧客名','ステータス','次回対応日','詳細'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{deals.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>データがありません</td></tr> : deals.map((deal)=><tr key={deal.id}><td className="px-4 py-3">{displayValue(deal.deal_no)}</td><td className="px-4 py-3 font-semibold">{displayValue(deal.title)}</td><td className="px-4 py-3">{displayValue(customerMap.get(deal.customer_id ?? '')?.name)}</td><td className="px-4 py-3">{displayValue(deal.status)}</td><td className="px-4 py-3">{formatDateTime(deal.next_action_at)}</td><td className="px-4 py-3"><Link href={`/deals/${deal.id}`} className="text-sm font-bold text-blue-700 hover:underline">詳細</Link></td></tr>)}</tbody></table></div>
          </Section>
          <Section title="関連整備・車検">
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['受付番号','種別','ステータス','入庫予定','納車予定','詳細'].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{maintenance.length === 0 ? <tr><td className="px-4 py-4 text-slate-500" colSpan={6}>データがありません</td></tr> : maintenance.map((job)=><tr key={job.id}><td className="px-4 py-3">{displayValue(job.job_no)}</td><td className="px-4 py-3">{displayValue(job.job_type)}</td><td className="px-4 py-3">{displayValue(job.status)}</td><td className="px-4 py-3">{formatDateTime(job.scheduled_in_at)}</td><td className="px-4 py-3">{formatDateTime(job.scheduled_delivery_at)}</td><td className="px-4 py-3"><Link href={`/maintenance/${job.id}`} className="text-sm font-bold text-blue-700 hover:underline">詳細</Link></td></tr>)}</tbody></table></div>
          </Section>
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-6">
            <Link href={`/deals/new?vehicleId=${vehicleId}`} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700">この車両で商談を作成</Link>
            <Link href="/vehicles" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">車両一覧に戻る</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
