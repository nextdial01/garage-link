'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import JobPartsPanel from '@/components/parts/JobPartsPanel';
import SoftDeleteButton from '@/components/SoftDeleteButton';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string; role: string | null };

type MaintenanceJobRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  job_no: string;
  job_type: string | null;
  status: string | null;
  priority: string | null;
  reception_date: string | null;
  reception_route: string | null;
  assigned_user_name: string | null;
  request_detail: string | null;
  symptoms: string | null;
  work_items: string[] | null;
  planned_parts: string | null;
  work_instruction: string | null;
  scheduled_in_at: string | null;
  scheduled_start_date: string | null;
  scheduled_finish_date: string | null;
  scheduled_delivery_at: string | null;
  actual_in_date: string | null;
  actual_finish_date: string | null;
  actual_delivery_date: string | null;
  loaner_status: string | null;
  labor_amount: number | null;
  parts_amount: number | null;
  inspection_amount: number | null;
  legal_fee_amount: number | null;
  additional_amount: number | null;
  discount_amount: number | null;
  estimated_total_amount: number | null;
  billing_amount: number | null;
  payment_method: string | null;
  estimate_confirm_status: string | null;
  line_notification_enabled: boolean | null;
  remind_before_enabled: boolean | null;
  remind_before_days: number | null;
  estimate_notice_enabled: boolean | null;
  completion_notice_enabled: boolean | null;
  next_inspection_notice_enabled: boolean | null;
  next_inspection_date: string | null;
  line_notice_memo: string | null;
  work_memo: string | null;
  caution_note: string | null;
  customer_message: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  line_display_name: string | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  registration_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  inspection_expiry_date: string | null;
};

type MaintenanceFormState = {
  job_no: string;
  job_type: string;
  status: string;
  priority: string;
  reception_date: string;
  reception_route: string;
  assigned_user_name: string;
  request_detail: string;
  symptoms: string;
  work_items: string;
  planned_parts: string;
  work_instruction: string;
  scheduled_in_at: string;
  scheduled_start_date: string;
  scheduled_finish_date: string;
  scheduled_delivery_at: string;
  actual_in_date: string;
  actual_finish_date: string;
  actual_delivery_date: string;
  loaner_status: string;
  labor_amount: string;
  parts_amount: string;
  inspection_amount: string;
  legal_fee_amount: string;
  additional_amount: string;
  discount_amount: string;
  estimated_total_amount: string;
  billing_amount: string;
  payment_method: string;
  estimate_confirm_status: string;
  line_notification_enabled: string;
  remind_before_enabled: string;
  remind_before_days: string;
  estimate_notice_enabled: string;
  completion_notice_enabled: string;
  next_inspection_notice_enabled: string;
  next_inspection_date: string;
  line_notice_memo: string;
  work_memo: string;
  caution_note: string;
  customer_message: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const emptyForm: MaintenanceFormState = {
  job_no: '',
  job_type: '車検',
  status: 'received',
  priority: 'normal',
  reception_date: '',
  reception_route: '',
  assigned_user_name: '',
  request_detail: '',
  symptoms: '',
  work_items: '',
  planned_parts: '',
  work_instruction: '',
  scheduled_in_at: '',
  scheduled_start_date: '',
  scheduled_finish_date: '',
  scheduled_delivery_at: '',
  actual_in_date: '',
  actual_finish_date: '',
  actual_delivery_date: '',
  loaner_status: '',
  labor_amount: '',
  parts_amount: '',
  inspection_amount: '',
  legal_fee_amount: '',
  additional_amount: '',
  discount_amount: '',
  estimated_total_amount: '',
  billing_amount: '',
  payment_method: '',
  estimate_confirm_status: '',
  line_notification_enabled: 'false',
  remind_before_enabled: 'false',
  remind_before_days: '',
  estimate_notice_enabled: 'false',
  completion_notice_enabled: 'false',
  next_inspection_notice_enabled: 'false',
  next_inspection_date: '',
  line_notice_memo: '',
  work_memo: '',
  caution_note: '',
  customer_message: '',
};

const statusOptions = [
  ['received', '受付済み'],
  ['estimating', '見積中'],
  ['waiting', '作業待ち'],
  ['working', '作業中'],
  ['completed', '完了'],
  ['delivered', '納車済み'],
  ['cancelled', 'キャンセル'],
];

const priorityOptions = [
  ['normal', '通常'],
  ['high', '高'],
  ['urgent', '緊急'],
];

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function toInputDateTime(value: string | null) {
  return value ? value.slice(0, 16) : '';
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function toNullableNumber(value: string) {
  return value.trim() === '' ? null : Number(value);
}

function statusLabel(status: string) {
  return statusOptions.find(([value]) => value === status)?.[1] ?? status;
}

function getStatusClass(status: string) {
  switch (status) {
    case 'working':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case 'completed':
    case 'delivered':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'cancelled':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
  }
}

function mapJobToForm(job: MaintenanceJobRow): MaintenanceFormState {
  return {
    job_no: job.job_no ?? '',
    job_type: job.job_type ?? '車検',
    status: job.status ?? 'received',
    priority: job.priority ?? 'normal',
    reception_date: job.reception_date ?? '',
    reception_route: job.reception_route ?? '',
    assigned_user_name: job.assigned_user_name ?? '',
    request_detail: job.request_detail ?? '',
    symptoms: job.symptoms ?? '',
    work_items: (job.work_items ?? []).join(', '),
    planned_parts: job.planned_parts ?? '',
    work_instruction: job.work_instruction ?? '',
    scheduled_in_at: toInputDateTime(job.scheduled_in_at),
    scheduled_start_date: job.scheduled_start_date ?? '',
    scheduled_finish_date: job.scheduled_finish_date ?? '',
    scheduled_delivery_at: toInputDateTime(job.scheduled_delivery_at),
    actual_in_date: job.actual_in_date ?? '',
    actual_finish_date: job.actual_finish_date ?? '',
    actual_delivery_date: job.actual_delivery_date ?? '',
    loaner_status: job.loaner_status ?? '',
    labor_amount: job.labor_amount === null ? '' : String(job.labor_amount ?? ''),
    parts_amount: job.parts_amount === null ? '' : String(job.parts_amount ?? ''),
    inspection_amount: job.inspection_amount === null ? '' : String(job.inspection_amount ?? ''),
    legal_fee_amount: job.legal_fee_amount === null ? '' : String(job.legal_fee_amount ?? ''),
    additional_amount: job.additional_amount === null ? '' : String(job.additional_amount ?? ''),
    discount_amount: job.discount_amount === null ? '' : String(job.discount_amount ?? ''),
    estimated_total_amount: job.estimated_total_amount === null ? '' : String(job.estimated_total_amount ?? ''),
    billing_amount: job.billing_amount === null ? '' : String(job.billing_amount ?? ''),
    payment_method: job.payment_method ?? '',
    estimate_confirm_status: job.estimate_confirm_status ?? '',
    line_notification_enabled: job.line_notification_enabled ? 'true' : 'false',
    remind_before_enabled: job.remind_before_enabled ? 'true' : 'false',
    remind_before_days: job.remind_before_days === null ? '' : String(job.remind_before_days ?? ''),
    estimate_notice_enabled: job.estimate_notice_enabled ? 'true' : 'false',
    completion_notice_enabled: job.completion_notice_enabled ? 'true' : 'false',
    next_inspection_notice_enabled: job.next_inspection_notice_enabled ? 'true' : 'false',
    next_inspection_date: job.next_inspection_date ?? '',
    line_notice_memo: job.line_notice_memo ?? '',
    work_memo: job.work_memo ?? '',
    caution_note: job.caution_note ?? '',
    customer_message: job.customer_message ?? '',
  };
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'md:col-span-2 xl:col-span-3' : ''}>
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function InfoItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{displayValue(value)}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      </div>
      <div className="grid gap-4 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export default function MaintenanceDetailPage() {
  const params = useParams<{ id: string }>();
  const maintenanceId = params.id;
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [job, setJob] = useState<MaintenanceJobRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [form, setForm] = useState<MaintenanceFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function loadDetail() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗を取得できませんでした。');
        setStoreId(member.store_id);
        setRole(member.role ?? '');

        const { data: jobData, error: jobError } = await supabase
          .from<MaintenanceJobRow>('maintenance_jobs')
          .select('*')
          .eq('id', maintenanceId)
          .eq('store_id', member.store_id)
          .single();

        if (jobError || !jobData) {
          setJob(null);
          return;
        }

        setJob(jobData);
        setForm(mapJobToForm(jobData));

        const [customerResult, vehicleResult] = await Promise.all([
          jobData.customer_id
            ? supabase
                .from<CustomerRow>('customers')
                .select('id, name, phone, email, line_display_name')
                .eq('id', jobData.customer_id)
                .eq('store_id', member.store_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          jobData.vehicle_id
            ? supabase
                .from<VehicleRow>('vehicles')
                .select('id, management_no, registration_no, maker, model_name, model_year, mileage_km, inspection_expiry_date')
                .eq('id', jobData.vehicle_id)
                .eq('store_id', member.store_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
        ]);

        setCustomer(customerResult.data ?? null);
        setVehicle(vehicleResult.data ?? null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '整備・車検詳細の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDetail();
  }, [maintenanceId]);

  function updateField(name: keyof MaintenanceFormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSave() {
    if (!storeId) {
      setErrorMessage('所属店舗を取得できていません。');
      return;
    }

    try {
      setIsSaving(true);
      setMessage('');
      setErrorMessage('');
      const supabase = createClient();
      const { error } = await supabase
        .from<MaintenanceJobRow>('maintenance_jobs')
        .update({
          job_no: form.job_no,
          job_type: form.job_type,
          status: form.status,
          priority: form.priority,
          reception_date: form.reception_date || null,
          reception_route: toNullableText(form.reception_route),
          assigned_user_name: toNullableText(form.assigned_user_name),
          request_detail: toNullableText(form.request_detail),
          symptoms: toNullableText(form.symptoms),
          work_items: form.work_items.split(',').map((item) => item.trim()).filter(Boolean),
          planned_parts: toNullableText(form.planned_parts),
          work_instruction: toNullableText(form.work_instruction),
          scheduled_in_at: form.scheduled_in_at || null,
          scheduled_start_date: form.scheduled_start_date || null,
          scheduled_finish_date: form.scheduled_finish_date || null,
          scheduled_delivery_at: form.scheduled_delivery_at || null,
          actual_in_date: form.actual_in_date || null,
          actual_finish_date: form.actual_finish_date || null,
          actual_delivery_date: form.actual_delivery_date || null,
          loaner_status: toNullableText(form.loaner_status),
          labor_amount: toNullableNumber(form.labor_amount),
          parts_amount: toNullableNumber(form.parts_amount),
          inspection_amount: toNullableNumber(form.inspection_amount),
          legal_fee_amount: toNullableNumber(form.legal_fee_amount),
          additional_amount: toNullableNumber(form.additional_amount),
          discount_amount: toNullableNumber(form.discount_amount),
          estimated_total_amount: toNullableNumber(form.estimated_total_amount),
          billing_amount: toNullableNumber(form.billing_amount),
          payment_method: toNullableText(form.payment_method),
          estimate_confirm_status: toNullableText(form.estimate_confirm_status),
          line_notification_enabled: form.line_notification_enabled === 'true',
          remind_before_enabled: form.remind_before_enabled === 'true',
          remind_before_days: toNullableNumber(form.remind_before_days),
          estimate_notice_enabled: form.estimate_notice_enabled === 'true',
          completion_notice_enabled: form.completion_notice_enabled === 'true',
          next_inspection_notice_enabled: form.next_inspection_notice_enabled === 'true',
          next_inspection_date: form.next_inspection_date || null,
          line_notice_memo: toNullableText(form.line_notice_memo),
          work_memo: toNullableText(form.work_memo),
          caution_note: toNullableText(form.caution_note),
          customer_message: toNullableText(form.customer_message),
        })
        .eq('id', maintenanceId)
        .eq('store_id', storeId);

      if (error) throw new Error(error.message);
      setMessage('保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      activeLabel="整備・車検"
      title="整備・車検詳細"
      description="登録済みの整備・車検案件を確認・編集します"
      actionButton={
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !job}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? '保存中...' : '保存する'}
          </button>
          <SoftDeleteButton
            tableName="maintenance_jobs"
            rowId={maintenanceId}
            storeId={storeId}
            targetType="maintenance_job"
            targetLabel={form.job_no || '整備・車検案件'}
            redirectHref="/maintenance"
          />
          <Link href="/maintenance" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
            一覧に戻る
          </Link>
        </div>
      }
    >
      {message && <p className="mb-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</p>}
      {errorMessage && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">読み込み中...</section>
      ) : !job ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h3 className="text-xl font-bold text-slate-950">整備・車検案件が見つかりません</h3>
          <Link href="/maintenance" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
            一覧に戻る
          </Link>
        </section>
      ) : (
        <div className="space-y-6">
          <Section title="基本情報">
            <Field label="受付番号"><input className={inputClass} value={form.job_no} onChange={(event) => updateField('job_no', event.target.value)} /></Field>
            <Field label="種別"><select className={inputClass} value={form.job_type} onChange={(event) => updateField('job_type', event.target.value)}>{['車検', '点検', '整備', '修理', 'カスタム', 'その他'].map((option) => <option key={option}>{option}</option>)}</select></Field>
            <Field label="ステータス"><select className={inputClass} value={form.status} onChange={(event) => updateField('status', event.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="優先度"><select className={inputClass} value={form.priority} onChange={(event) => updateField('priority', event.target.value)}>{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="受付日"><input type="date" className={inputClass} value={form.reception_date} onChange={(event) => updateField('reception_date', event.target.value)} /></Field>
            <Field label="受付経路"><input className={inputClass} value={form.reception_route} onChange={(event) => updateField('reception_route', event.target.value)} /></Field>
            <Field label="担当者"><input className={inputClass} value={form.assigned_user_name} onChange={(event) => updateField('assigned_user_name', event.target.value)} /></Field>
            <div className="flex items-end">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(form.status)}`}>{statusLabel(form.status)}</span>
            </div>
          </Section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Section title="顧客情報">
              <InfoItem label="顧客名" value={customer?.name} />
              <InfoItem label="電話番号" value={customer?.phone} />
              <InfoItem label="メール" value={customer?.email} />
              <InfoItem label="LINE表示名" value={customer?.line_display_name} />
            </Section>

            <Section title="対象車両">
              <InfoItem label="管理番号" value={vehicle?.management_no} />
              <InfoItem label="登録番号" value={vehicle?.registration_no} />
              <InfoItem label="メーカー" value={vehicle?.maker} />
              <InfoItem label="車種名" value={vehicle?.model_name} />
              <InfoItem label="年式" value={vehicle?.model_year} />
              <InfoItem label="走行距離" value={vehicle?.mileage_km ? `${vehicle.mileage_km.toLocaleString()}km` : null} />
              <InfoItem label="車検満了日" value={vehicle?.inspection_expiry_date} />
            </Section>
          </section>

          <Section title="作業内容">
            <Field label="依頼内容" wide><textarea className={`${inputClass} min-h-28`} value={form.request_detail} onChange={(event) => updateField('request_detail', event.target.value)} /></Field>
            <Field label="症状" wide><textarea className={`${inputClass} min-h-28`} value={form.symptoms} onChange={(event) => updateField('symptoms', event.target.value)} /></Field>
            <Field label="作業項目"><input className={inputClass} value={form.work_items} onChange={(event) => updateField('work_items', event.target.value)} placeholder="例：車検, オイル交換" /></Field>
            <Field label="使用予定部品"><textarea className={`${inputClass} min-h-28`} value={form.planned_parts} onChange={(event) => updateField('planned_parts', event.target.value)} /></Field>
            <Field label="作業指示" wide><textarea className={`${inputClass} min-h-28`} value={form.work_instruction} onChange={(event) => updateField('work_instruction', event.target.value)} /></Field>
          </Section>

          <Section title="スケジュール">
            <Field label="入庫予定"><input type="datetime-local" className={inputClass} value={form.scheduled_in_at} onChange={(event) => updateField('scheduled_in_at', event.target.value)} /></Field>
            <Field label="作業開始予定"><input type="date" className={inputClass} value={form.scheduled_start_date} onChange={(event) => updateField('scheduled_start_date', event.target.value)} /></Field>
            <Field label="完了予定"><input type="date" className={inputClass} value={form.scheduled_finish_date} onChange={(event) => updateField('scheduled_finish_date', event.target.value)} /></Field>
            <Field label="納車予定"><input type="datetime-local" className={inputClass} value={form.scheduled_delivery_at} onChange={(event) => updateField('scheduled_delivery_at', event.target.value)} /></Field>
            <Field label="実入庫日"><input type="date" className={inputClass} value={form.actual_in_date} onChange={(event) => updateField('actual_in_date', event.target.value)} /></Field>
            <Field label="実完了日"><input type="date" className={inputClass} value={form.actual_finish_date} onChange={(event) => updateField('actual_finish_date', event.target.value)} /></Field>
            <Field label="実納車日"><input type="date" className={inputClass} value={form.actual_delivery_date} onChange={(event) => updateField('actual_delivery_date', event.target.value)} /></Field>
            <Field label="代車状況"><input className={inputClass} value={form.loaner_status} onChange={(event) => updateField('loaner_status', event.target.value)} /></Field>
          </Section>

          <Section title="金額">
            {[
              ['labor_amount', '工賃'],
              ['parts_amount', '部品代'],
              ['inspection_amount', '車検費用'],
              ['legal_fee_amount', '法定費用'],
              ['additional_amount', '追加費用'],
              ['discount_amount', '値引き'],
              ['estimated_total_amount', '見積合計'],
              ['billing_amount', '請求金額'],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  className={`${inputClass} text-right`}
                  value={form[key as keyof MaintenanceFormState]}
                  onChange={(event) => updateField(key as keyof MaintenanceFormState, event.target.value)}
                />
              </Field>
            ))}
            <Field label="支払方法"><input className={inputClass} value={form.payment_method} onChange={(event) => updateField('payment_method', event.target.value)} /></Field>
            <Field label="見積確認状況"><input className={inputClass} value={form.estimate_confirm_status} onChange={(event) => updateField('estimate_confirm_status', event.target.value)} /></Field>
          </Section>

          <Section title="LINE通知">
            {[
              ['line_notification_enabled', 'LINE通知有無'],
              ['remind_before_enabled', '事前リマインド'],
              ['estimate_notice_enabled', '見積案内'],
              ['completion_notice_enabled', '完了案内'],
              ['next_inspection_notice_enabled', '次回車検案内'],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <select className={inputClass} value={form[key as keyof MaintenanceFormState]} onChange={(event) => updateField(key as keyof MaintenanceFormState, event.target.value)}>
                  <option value="true">有効</option>
                  <option value="false">無効</option>
                </select>
              </Field>
            ))}
            <Field label="事前リマインド日数"><input type="number" className={`${inputClass} text-right`} value={form.remind_before_days} onChange={(event) => updateField('remind_before_days', event.target.value)} /></Field>
            <Field label="次回車検日"><input type="date" className={inputClass} value={form.next_inspection_date} onChange={(event) => updateField('next_inspection_date', event.target.value)} /></Field>
            <Field label="LINE通知メモ" wide><textarea className={`${inputClass} min-h-28`} value={form.line_notice_memo} onChange={(event) => updateField('line_notice_memo', event.target.value)} /></Field>
          </Section>

          <Section title="メモ">
            <Field label="作業メモ" wide><textarea className={`${inputClass} min-h-28`} value={form.work_memo} onChange={(event) => updateField('work_memo', event.target.value)} /></Field>
            <Field label="注意事項" wide><textarea className={`${inputClass} min-h-28`} value={form.caution_note} onChange={(event) => updateField('caution_note', event.target.value)} /></Field>
            <Field label="顧客向けメッセージ" wide><textarea className={`${inputClass} min-h-28`} value={form.customer_message} onChange={(event) => updateField('customer_message', event.target.value)} /></Field>
          </Section>

          {storeId && maintenanceId && (
            <JobPartsPanel
              jobId={maintenanceId}
              storeId={storeId}
              canEdit={!role || role === 'owner' || role === 'admin' || role === 'implementer' || role === 'staff'}
              onTotalChange={(total) => updateField('parts_amount', String(total))}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}
