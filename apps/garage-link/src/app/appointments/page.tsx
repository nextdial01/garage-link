'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ContextHelp from '@/components/ContextHelp';
import ResponsiveDetailPanel from '@/components/ResponsiveDetailPanel';
import { createClient } from '@/lib/supabase/client';

type Member = { store_id: string };
type Appointment = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  appointment_type: string;
  scheduled_at: string;
  status: string;
  assigned_user_name: string | null;
  note: string | null;
  no_show_reason: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
};
type Customer = { id: string; name: string | null };
type Vehicle = { id: string; maker: string | null; model_name: string | null; management_no: string | null };

const inputClass = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
const statuses = ['予約済み', '確認済み', '完了', 'キャンセル', '無断キャンセル'];
const appointmentTypes = ['来店予約', '試乗予約', '商談予約', '整備予約'];

function vehicleLabel(vehicle: Vehicle | undefined) {
  return vehicle ? `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || vehicle.management_no || '車両' : '-';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' });
}

export default function AppointmentsPage() {
  const [storeId, setStoreId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');

  async function load() {
    try {
      setIsLoading(true);
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user?.id) throw new Error('ログインが必要です。');
      const { data: member, error: memberError } = await supabase.from<Member>('store_members').select('store_id').eq('user_id', user.user.id).single();
      if (memberError || !member) throw new Error('所属店舗が見つかりません。');
      setStoreId(member.store_id);
      const [appointmentResult, customerResult, vehicleResult] = await Promise.all([
        supabase.from<Appointment>('appointments').select('id, customer_id, vehicle_id, appointment_type, scheduled_at, status, assigned_user_name, note, no_show_reason, completed_at, updated_at').eq('store_id', member.store_id).order('scheduled_at', { ascending: true }),
        supabase.from<Customer>('customers').select('id, name').eq('store_id', member.store_id),
        supabase.from<Vehicle>('vehicles').select('id, maker, model_name, management_no').eq('store_id', member.store_id),
      ]);
      if (appointmentResult.error) throw new Error('予約データを取得できませんでした。');
      setAppointments(appointmentResult.data ?? []);
      setCustomers(customerResult.data ?? []);
      setVehicles(vehicleResult.data ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '予約の取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setTimeout(() => { void load(); }, 0);
  }, []);

  const customerMap = useMemo(() => new Map(customers.map((item) => [item.id, item])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((item) => [item.id, item])), [vehicles]);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = appointments.filter((item) => item.scheduled_at.slice(0, 10) === today).length;
  const openCount = appointments.filter((item) => ['予約済み', '確認済み'].includes(item.status)).length;
  const noShowCount = appointments.filter((item) => item.status === '無断キャンセル').length;

  const selectedAppointment = useMemo(
    () => appointments.find((item) => item.id === selectedAppointmentId) ?? null,
    [appointments, selectedAppointmentId],
  );

  async function applyRefresh() {
    await load();
    setPendingRefresh(false);
    setConflictMessage('');
  }

  async function updateStatus(target: Appointment, status: string) {
    const supabase = createClient();
    const completedAt = status === '完了' ? new Date().toISOString() : null;
    const noShowReason = status === '無断キャンセル' ? '来店なし' : null;
    const { data, error } = await supabase
      .from<Appointment>('appointments')
      .update({
        status,
        no_show_reason: noShowReason,
        completed_at: completedAt,
      })
      .eq('id', target.id)
      .eq('store_id', storeId)
      .eq('updated_at', target.updated_at ?? '')
      .select('id, customer_id, vehicle_id, appointment_type, scheduled_at, status, assigned_user_name, note, no_show_reason, completed_at, updated_at')
      .maybeSingle();

    if (error) {
      setErrorMessage('予約状態を保存できませんでした。');
      return;
    }

    if (!data) {
      setConflictMessage('ほかの更新が入ったため保存できませんでした。最新データを反映してください。');
      setPendingRefresh(true);
      return;
    }

    setAppointments((items) => items.map((item) => item.id === target.id ? data : item));
    setConflictMessage('');
    setPendingRefresh(false);
  }

  async function createAppointment(formData: FormData) {
    const scheduledAt = String(formData.get('scheduled_at') ?? '');
    if (!scheduledAt) {
      setCreateMessage('予約日時を入力してください。');
      return;
    }

    setIsCreating(true);
    setCreateMessage('');
    const supabase = createClient();
    const { data, error } = await supabase
      .from<Appointment>('appointments')
      .insert({
        store_id: storeId,
        appointment_type: String(formData.get('appointment_type') ?? '来店予約'),
        scheduled_at: new Date(scheduledAt).toISOString(),
        customer_id: String(formData.get('customer_id') ?? '') || null,
        vehicle_id: String(formData.get('vehicle_id') ?? '') || null,
        assigned_user_name: String(formData.get('assigned_user_name') ?? '').trim() || null,
        note: String(formData.get('note') ?? '').trim() || null,
        status: '予約済み',
      })
      .select('id, customer_id, vehicle_id, appointment_type, scheduled_at, status, assigned_user_name, note, no_show_reason, completed_at, updated_at')
      .single();

    setIsCreating(false);
    if (error || !data) {
      setCreateMessage('予約を登録できませんでした。入力内容を確認して、もう一度お試しください。');
      return;
    }

    setAppointments((items) => [...items, data].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)));
    setShowCreateForm(false);
    setCreateMessage('予約を登録しました。');
    setSelectedAppointmentId(data.id);
  }

  return (
    <AppShell activeLabel="来店・試乗予約" title="来店・試乗予約" description="今日の来店・試乗・商談・整備予約を上から確認できます。">
      <div className="mb-6 flex justify-end">
        <button type="button" onClick={() => { setShowCreateForm((current) => !current); setCreateMessage(''); }} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
          {showCreateForm ? '登録を閉じる' : '新しい予約を登録'}
        </button>
      </div>

      {showCreateForm && (
        <form action={(formData) => void createAppointment(formData)} className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-black text-slate-950">新しい予約</h2>
            <p className="mt-1 text-sm text-slate-500">予約日時と種類だけで登録できます。顧客や車両は分かる範囲で選択してください。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2 text-sm font-bold text-slate-700">予約日時<span className="ml-1 text-red-600">必須</span><input name="scheduled_at" type="datetime-local" required className={`${inputClass} min-h-11 w-full`} /></label>
            <label className="space-y-2 text-sm font-bold text-slate-700">予約種類<select name="appointment_type" className={`${inputClass} min-h-11 w-full`}>{appointmentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="space-y-2 text-sm font-bold text-slate-700">顧客<select name="customer_id" className={`${inputClass} min-h-11 w-full`}><option value="">未設定</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name ?? '顧客'}</option>)}</select></label>
            <label className="space-y-2 text-sm font-bold text-slate-700">対象車両<select name="vehicle_id" className={`${inputClass} min-h-11 w-full`}><option value="">未設定</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select></label>
            <label className="space-y-2 text-sm font-bold text-slate-700">担当者<input name="assigned_user_name" className={`${inputClass} min-h-11 w-full`} placeholder="例：大久保" /></label>
            <label className="space-y-2 text-sm font-bold text-slate-700">メモ<input name="note" className={`${inputClass} min-h-11 w-full`} placeholder="例：試乗希望車を準備" /></label>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="submit" disabled={isCreating || !storeId} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400">{isCreating ? '登録中...' : '予約を登録する'}</button>
            {createMessage && <p className="text-sm font-bold text-slate-700">{createMessage}</p>}
          </div>
        </form>
      )}

      {!showCreateForm && createMessage && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-800">{createMessage}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">今日の予約</p><p className="mt-2 text-3xl font-black">{todayCount}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">未完了</p><p className="mt-2 text-3xl font-black">{openCount}</p></div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"><p className="text-sm font-bold text-red-700">無断キャンセル</p><p className="mt-2 text-3xl font-black text-red-700">{noShowCount}</p></div>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2"><h2 className="text-base font-black">予約一覧</h2><ContextHelp title="予約一覧" description="電話・店頭の予約も登録できます。状態の変更はその場で保存されます。" /></div>
          </div>
          {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</p>}
          {isLoading ? (
            <p className="p-5 text-sm text-slate-500">読み込み中...</p>
          ) : appointments.length === 0 ? (
            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
                <p className="text-sm font-black text-slate-900">予約はありません。</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">まずは顧客登録や対象車両の確認を進めると、来店・試乗予約の準備がしやすくなります。</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => setShowCreateForm(true)} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">予約を登録する</button>
                <Link href="/customers/new" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">顧客を登録する</Link>
                <Link href="/vehicles" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">車両を確認する</Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((item) => (
                <div key={item.id} className={`px-5 py-4 ${item.status === '無断キャンセル' ? 'bg-red-50/70' : ''}`}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <button type="button" onClick={() => { setSelectedAppointmentId(item.id); setConflictMessage(''); setPendingRefresh(false); }} className="text-left">
                      <p className="text-sm font-black text-slate-950">{formatDate(item.scheduled_at)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{item.appointment_type} / {item.customer_id ? customerMap.get(item.customer_id)?.name ?? '顧客' : '顧客未設定'} / {vehicleLabel(item.vehicle_id ? vehicleMap.get(item.vehicle_id) : undefined)}</p>
                    </button>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select aria-label={`${item.id}の予約状態`} className={inputClass} value={item.status} onChange={(event) => void updateStatus(item, event.target.value)}>
                        {statuses.map((status) => <option key={status}>{status}</option>)}
                      </select>
                      {item.vehicle_id ? <Link className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700" href={`/vehicles/${item.vehicle_id}`}>車両詳細</Link> : null}
                    </div>
                  </div>
                  {item.status === '無断キャンセル' && <p className="mt-2 text-xs font-bold text-red-700">理由: {item.no_show_reason ?? '来店なし'}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <ResponsiveDetailPanel
          open={Boolean(selectedAppointment)}
          title={selectedAppointment?.appointment_type ?? '予約概要'}
          subtitle={selectedAppointment ? formatDate(selectedAppointment.scheduled_at) : undefined}
          onClose={() => { setSelectedAppointmentId(null); setConflictMessage(''); setPendingRefresh(false); }}
        >
          {selectedAppointment && (
            <div className="space-y-5">
              {pendingRefresh && (
                <button type="button" onClick={() => void applyRefresh()} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">新しい更新があります。反映する</button>
              )}
              {conflictMessage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{conflictMessage}</p>}
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">顧客</dt><dd className="font-bold text-slate-900">{selectedAppointment.customer_id ? customerMap.get(selectedAppointment.customer_id)?.name ?? '-' : '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">対象車両</dt><dd className="font-bold text-slate-900">{vehicleLabel(selectedAppointment.vehicle_id ? vehicleMap.get(selectedAppointment.vehicle_id) : undefined)}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">担当者</dt><dd className="font-bold text-slate-900">{selectedAppointment.assigned_user_name ?? '-'}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">状態</dt><dd className="font-bold text-slate-900">{selectedAppointment.status}</dd></div>
                <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">メモ</dt><dd className="text-right font-bold text-slate-900">{selectedAppointment.note?.trim() || '-'}</dd></div>
              </dl>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">状態変更</p>
                <select aria-label="選択中の予約状態" className={`${inputClass} w-full`} value={selectedAppointment.status} onChange={(event) => void updateStatus(selectedAppointment, event.target.value)}>
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            </div>
          )}
        </ResponsiveDetailPanel>
      </div>
    </AppShell>
  );
}
