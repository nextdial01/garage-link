'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };
type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  line_display_name: string | null;
  delivery_permission: string | boolean | null;
};
type VehicleRow = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  grade: string | null;
  vin: string | null;
  registration_no: string | null;
  mileage_km: number | null;
  inspection_expiry_date: string | null;
  status: string | null;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const initialForm = {
  customer_id: '',
  vehicle_id: '',
  job_no: '',
  job_type: '車検',
  status: 'received',
  priority: 'normal',
  reception_date: '',
  reception_route: 'LINE',
  assigned_user_name: '',
  request_detail: '',
  symptoms: '',
  work_items: '',
  planned_parts: '',
  work_instruction: '',
  scheduled_in_date: '',
  scheduled_in_time: '',
  scheduled_start_date: '',
  scheduled_finish_date: '',
  scheduled_delivery_date: '',
  scheduled_delivery_time: '',
  actual_in_date: '',
  actual_finish_date: '',
  actual_delivery_date: '',
  loaner_status: '不要',
  labor_amount: '',
  parts_amount: '',
  inspection_amount: '',
  legal_fee_amount: '',
  additional_amount: '',
  discount_amount: '',
  estimated_total_amount: '',
  billing_amount: '',
  payment_method: '未定',
  estimate_confirm_status: '未確認',
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

function toNumber(value: string) {
  return value === '' ? 0 : Number(value);
}

function toDateTime(date: string, time: string) {
  if (!date) return null;
  return `${date}T${time || '00:00'}:00`;
}

function displayValue(value: string | number | boolean | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

export default function NewMaintenancePage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [form, setForm] = useState(initialForm);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadOptions() {
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗を取得できませんでした。');
        setStoreId(member.store_id);

        const [customerResult, vehicleResult] = await Promise.all([
          supabase.from<CustomerRow>('customers').select('id, name, phone, mobile_phone, email, line_display_name, delivery_permission').eq('store_id', member.store_id),
          supabase.from<VehicleRow>('vehicles').select('id, management_no, maker, model_name, grade, vin, registration_no, mileage_km, inspection_expiry_date, status').eq('store_id', member.store_id),
        ]);
        if (customerResult.error) throw new Error(customerResult.error.message);
        if (vehicleResult.error) throw new Error(vehicleResult.error.message);
        setCustomers(customerResult.data ?? []);
        setVehicles(vehicleResult.data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '選択肢の取得に失敗しました。');
      }
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    if (saveError && saveErrorRef.current) {
      saveErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [saveError]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === form.customer_id) ?? null,
    [customers, form.customer_id]
  );
  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === form.vehicle_id) ?? null,
    [vehicles, form.vehicle_id]
  );

  function updateField(name: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSave() {
    try {
      setSaveError('');
      setIsSaving(true);
      if (!storeId) throw new Error('所属店舗を取得できていません。');
      if (!form.job_no.trim()) throw new Error('受付番号を入力してください。');
      if (!form.customer_id) throw new Error('顧客を選択してください。');
      if (!form.vehicle_id) throw new Error('対象車両を選択してください。');

      const supabase = createClient();
      const { error } = await supabase.from('maintenance_jobs').insert({
        store_id: storeId,
        customer_id: form.customer_id || null,
        vehicle_id: form.vehicle_id || null,
        job_no: form.job_no,
        job_type: form.job_type,
        status: form.status,
        priority: form.priority,
        reception_date: form.reception_date || null,
        reception_route: form.reception_route,
        assigned_user_name: form.assigned_user_name || null,
        request_detail: form.request_detail || null,
        symptoms: form.symptoms || null,
        work_items: form.work_items.split(',').map((item) => item.trim()).filter(Boolean),
        planned_parts: form.planned_parts || null,
        work_instruction: form.work_instruction || null,
        scheduled_in_at: toDateTime(form.scheduled_in_date, form.scheduled_in_time),
        scheduled_start_date: form.scheduled_start_date || null,
        scheduled_finish_date: form.scheduled_finish_date || null,
        scheduled_delivery_at: toDateTime(form.scheduled_delivery_date, form.scheduled_delivery_time),
        actual_in_date: form.actual_in_date || null,
        actual_finish_date: form.actual_finish_date || null,
        actual_delivery_date: form.actual_delivery_date || null,
        loaner_status: form.loaner_status,
        labor_amount: toNumber(form.labor_amount),
        parts_amount: toNumber(form.parts_amount),
        inspection_amount: toNumber(form.inspection_amount),
        legal_fee_amount: toNumber(form.legal_fee_amount),
        additional_amount: toNumber(form.additional_amount),
        discount_amount: toNumber(form.discount_amount),
        estimated_total_amount: toNumber(form.estimated_total_amount),
        billing_amount: toNumber(form.billing_amount),
        payment_method: form.payment_method,
        estimate_confirm_status: form.estimate_confirm_status,
        line_notification_enabled: form.line_notification_enabled === 'true',
        remind_before_enabled: form.remind_before_enabled === 'true',
        remind_before_days: form.remind_before_days === '' ? null : Number(form.remind_before_days),
        estimate_notice_enabled: form.estimate_notice_enabled === 'true',
        completion_notice_enabled: form.completion_notice_enabled === 'true',
        next_inspection_notice_enabled: form.next_inspection_notice_enabled === 'true',
        next_inspection_date: form.next_inspection_date || null,
        line_notice_memo: form.line_notice_memo || null,
        work_memo: form.work_memo || null,
        caution_note: form.caution_note || null,
        customer_message: form.customer_message || null,
      });

      if (error) throw new Error(error.message);
      sessionStorage.setItem('flash_maintenance', '整備案件を登録しました。');
      router.push('/maintenance');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      activeLabel="整備・車検"
      title="整備・車検登録"
      description="車検・点検・整備・修理・カスタム作業の予定と進捗を登録します"
      actionButton={<Link href="/maintenance" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">一覧に戻る</Link>}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">受付基本情報</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label><span className="text-sm font-bold text-slate-700">受付番号</span><input className={`${inputClass} mt-2`} value={form.job_no} onChange={(e) => updateField('job_no', e.target.value)} placeholder="例：M-2026-000001" /></label>
            <label><span className="text-sm font-bold text-slate-700">受付種別</span><select className={`${inputClass} mt-2`} value={form.job_type} onChange={(e) => updateField('job_type', e.target.value)}>{['車検','法定点検','一般整備','修理','カスタム','オイル交換','その他'].map((v)=><option key={v}>{v}</option>)}</select></label>
            <label><span className="text-sm font-bold text-slate-700">受付日</span><input type="date" className={`${inputClass} mt-2`} value={form.reception_date} onChange={(e) => updateField('reception_date', e.target.value)} /></label>
            <label><span className="text-sm font-bold text-slate-700">受付経路</span><select className={`${inputClass} mt-2`} value={form.reception_route} onChange={(e) => updateField('reception_route', e.target.value)}>{['LINE','電話','来店','メール','Webフォーム','紹介','その他'].map((v)=><option key={v}>{v}</option>)}</select></label>
            <label><span className="text-sm font-bold text-slate-700">ステータス</span><select className={`${inputClass} mt-2`} value={form.status} onChange={(e) => updateField('status', e.target.value)}>{[['received','受付'],['estimating','見積中'],['waiting','入庫待ち'],['working','作業中'],['completed','完了'],['delivered','納車済み'],['cancelled','キャンセル']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
            <label><span className="text-sm font-bold text-slate-700">優先度</span><select className={`${inputClass} mt-2`} value={form.priority} onChange={(e) => updateField('priority', e.target.value)}><option value="normal">通常</option><option value="high">高</option><option value="urgent">緊急</option></select></label>
            <label><span className="text-sm font-bold text-slate-700">担当者</span><input className={`${inputClass} mt-2`} value={form.assigned_user_name} onChange={(e) => updateField('assigned_user_name', e.target.value)} /></label>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-950">顧客情報</h3>
            <label className="mt-5 block"><span className="text-sm font-bold text-slate-700">顧客選択</span><select className={`${inputClass} mt-2`} value={form.customer_id} onChange={(e) => updateField('customer_id', e.target.value)}><option value="">未選択</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name ?? '名称未設定'}</option>)}</select></label>
            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-slate-700">
              <p className="font-bold">{displayValue(selectedCustomer?.name)}</p>
              <p className="mt-2">TEL: {displayValue(selectedCustomer?.phone)} / 携帯: {displayValue(selectedCustomer?.mobile_phone)}</p>
              <p>メール: {displayValue(selectedCustomer?.email)}</p>
              <p>LINE: {displayValue(selectedCustomer?.line_display_name)} / 配信: {displayValue(selectedCustomer?.delivery_permission)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-950">車両情報</h3>
            <label className="mt-5 block"><span className="text-sm font-bold text-slate-700">車両選択</span><select className={`${inputClass} mt-2`} value={form.vehicle_id} onChange={(e) => updateField('vehicle_id', e.target.value)}><option value="">未選択</option>{vehicles.map((v)=><option key={v.id} value={v.id}>{[v.management_no, v.maker, v.model_name].filter(Boolean).join(' / ') || '車両名未設定'}</option>)}</select></label>
            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-slate-700">
              <p className="font-bold">{[selectedVehicle?.maker, selectedVehicle?.model_name].filter(Boolean).join(' ') || '-'}</p>
              <p className="mt-2">管理番号: {displayValue(selectedVehicle?.management_no)} / 登録番号: {displayValue(selectedVehicle?.registration_no)}</p>
              <p>車台番号: {displayValue(selectedVehicle?.vin)} / 走行距離: {displayValue(selectedVehicle?.mileage_km)}</p>
              <p>車検満了日: {displayValue(selectedVehicle?.inspection_expiry_date)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">作業内容</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2"><span className="text-sm font-bold text-slate-700">依頼内容</span><textarea className={`${inputClass} mt-2 min-h-28`} value={form.request_detail} onChange={(e) => updateField('request_detail', e.target.value)} /></label>
            <label><span className="text-sm font-bold text-slate-700">症状・不具合</span><textarea className={`${inputClass} mt-2 min-h-28`} value={form.symptoms} onChange={(e) => updateField('symptoms', e.target.value)} /></label>
            <label><span className="text-sm font-bold text-slate-700">作業項目</span><input className={`${inputClass} mt-2`} value={form.work_items} onChange={(e) => updateField('work_items', e.target.value)} placeholder="例：車検, オイル交換" /></label>
            <label><span className="text-sm font-bold text-slate-700">使用予定部品</span><textarea className={`${inputClass} mt-2 min-h-28`} value={form.planned_parts} onChange={(e) => updateField('planned_parts', e.target.value)} /></label>
            <label><span className="text-sm font-bold text-slate-700">作業指示</span><textarea className={`${inputClass} mt-2 min-h-28`} value={form.work_instruction} onChange={(e) => updateField('work_instruction', e.target.value)} /></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">スケジュール・費用・通知</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['scheduled_in_date','入庫予定日','date'],['scheduled_in_time','入庫予定時間','time'],['scheduled_start_date','作業開始予定日','date'],['scheduled_finish_date','作業完了予定日','date'],['scheduled_delivery_date','納車予定日','date'],['scheduled_delivery_time','納車予定時間','time'],['actual_in_date','実入庫日','date'],['actual_finish_date','実作業完了日','date'],['actual_delivery_date','実納車日','date'],['labor_amount','工賃','number'],['parts_amount','部品代','number'],['inspection_amount','車検費用','number'],['legal_fee_amount','法定費用','number'],['additional_amount','追加費用','number'],['discount_amount','値引き','number'],['estimated_total_amount','見積合計','number'],['billing_amount','請求予定額','number'],['remind_before_days','入庫前リマインド日数','number'],['next_inspection_date','次回点検予定日','date'],
            ].map(([name,label,type]) => (
              <label key={name}><span className="text-sm font-bold text-slate-700">{label}</span><input type={type} className={`${inputClass} mt-2 ${type === 'number' ? 'text-right' : ''}`} value={form[name as keyof typeof initialForm]} onChange={(e) => updateField(name as keyof typeof initialForm, e.target.value)} /></label>
            ))}
            <label><span className="text-sm font-bold text-slate-700">代車</span><select className={`${inputClass} mt-2`} value={form.loaner_status} onChange={(e) => updateField('loaner_status', e.target.value)}>{['不要','必要','貸出済み','返却済み'].map((v)=><option key={v}>{v}</option>)}</select></label>
            <label><span className="text-sm font-bold text-slate-700">支払方法</span><select className={`${inputClass} mt-2`} value={form.payment_method} onChange={(e) => updateField('payment_method', e.target.value)}>{['現金','銀行振込','クレジットカード','Stripe決済','未定'].map((v)=><option key={v}>{v}</option>)}</select></label>
            <label><span className="text-sm font-bold text-slate-700">見積確認</span><select className={`${inputClass} mt-2`} value={form.estimate_confirm_status} onChange={(e) => updateField('estimate_confirm_status', e.target.value)}>{['未確認','顧客確認済み','承認済み','却下'].map((v)=><option key={v}>{v}</option>)}</select></label>
            {[
              ['line_notification_enabled','LINE通知'],['remind_before_enabled','入庫前リマインド'],['estimate_notice_enabled','見積確認通知'],['completion_notice_enabled','作業完了通知'],['next_inspection_notice_enabled','次回点検案内'],
            ].map(([name,label]) => (
              <label key={name}><span className="text-sm font-bold text-slate-700">{label}</span><select className={`${inputClass} mt-2`} value={form[name as keyof typeof initialForm]} onChange={(e) => updateField(name as keyof typeof initialForm, e.target.value)}><option value="true">有効</option><option value="false">無効</option></select></label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">メモ</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              ['line_notice_memo','LINE通知メモ'],['work_memo','作業メモ'],['caution_note','注意事項'],['customer_message','顧客への伝達事項'],
            ].map(([name,label]) => (
              <label key={name}><span className="text-sm font-bold text-slate-700">{label}</span><textarea className={`${inputClass} mt-2 min-h-28`} value={form[name as keyof typeof initialForm]} onChange={(e) => updateField(name as keyof typeof initialForm, e.target.value)} /></label>
            ))}
          </div>
        </section>

        <div ref={saveErrorRef} className="space-y-3">
          {saveError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
              {saveError}
            </div>
          )}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
          <Link href="/maintenance" className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700">キャンセル</Link>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
            {isSaving ? '保存中...' : '整備・車検を登録する'}
          </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
