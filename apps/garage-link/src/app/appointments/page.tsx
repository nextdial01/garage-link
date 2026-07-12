'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type Member = { store_id: string };
type Appointment = { id: string; customer_id: string | null; vehicle_id: string | null; appointment_type: string; scheduled_at: string; status: string; assigned_user_name: string | null; note: string | null; no_show_reason: string | null };
type Customer = { id: string; name: string | null };
type Vehicle = { id: string; maker: string | null; model_name: string | null; management_no: string | null };

const inputClass = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
const statuses = ['予約済み', '確認済み', '完了', 'キャンセル', '無断キャンセル'];

function vehicleLabel(vehicle: Vehicle | undefined) { return vehicle ? `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || vehicle.management_no || '車両' : '-'; }
function formatDate(value: string) { return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }); }

export default function AppointmentsPage() {
  const [storeId, setStoreId] = useState('');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: user } = await supabase.auth.getUser();
        if (!user.user?.id) throw new Error('ログインが必要です。');
        const { data: member, error: memberError } = await supabase.from<Member>('store_members').select('store_id').eq('user_id', user.user.id).single();
        if (memberError || !member) throw new Error('所属店舗が見つかりません。');
        setStoreId(member.store_id);
        const [appointmentResult, customerResult, vehicleResult] = await Promise.all([
          supabase.from<Appointment>('appointments').select('id, customer_id, vehicle_id, appointment_type, scheduled_at, status, assigned_user_name, note, no_show_reason').eq('store_id', member.store_id).order('scheduled_at', { ascending: true }),
          supabase.from<Customer>('customers').select('id, name').eq('store_id', member.store_id),
          supabase.from<Vehicle>('vehicles').select('id, maker, model_name, management_no').eq('store_id', member.store_id),
        ]);
        if (appointmentResult.error) throw new Error('予約データを取得できませんでした。');
        setAppointments(appointmentResult.data ?? []); setCustomers(customerResult.data ?? []); setVehicles(vehicleResult.data ?? []);
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : '予約の取得に失敗しました。'); } finally { setIsLoading(false); }
    }
    void load();
  }, []);

  const customerMap = useMemo(() => new Map(customers.map((item) => [item.id, item])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((item) => [item.id, item])), [vehicles]);
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = appointments.filter((item) => item.scheduled_at.slice(0, 10) === today).length;
  const openCount = appointments.filter((item) => ['予約済み', '確認済み'].includes(item.status)).length;

  async function updateStatus(id: string, status: string) {
    const supabase = createClient();
    const { error } = await supabase.from<Appointment>('appointments').update({ status, no_show_reason: status === '無断キャンセル' ? '来店なし' : null, completed_at: status === '完了' ? new Date().toISOString() : null }).eq('id', id).eq('store_id', storeId);
    if (error) { setErrorMessage('予約状態を保存できませんでした。'); return; }
    setAppointments((items) => items.map((item) => item.id === id ? { ...item, status, no_show_reason: status === '無断キャンセル' ? '来店なし' : null } : item));
  }

  return <AppShell activeLabel="来店・試乗予約" title="来店・試乗予約" description="来店・試乗・商談・整備の予定と、無断キャンセルを管理します。">
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-bold text-slate-500">今日の予約</p><p className="mt-2 text-3xl font-black">{todayCount}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-bold text-slate-500">未完了</p><p className="mt-2 text-3xl font-black">{openCount}</p></div><div className="rounded-2xl border border-red-200 bg-red-50 p-5"><p className="text-sm font-bold text-red-700">無断キャンセル</p><p className="mt-2 text-3xl font-black text-red-700">{appointments.filter((item) => item.status === '無断キャンセル').length}</p></div></div>
      {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</p>}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-black">予約一覧</h2><p className="mt-1 text-sm text-slate-500">状態を変更すると、その場で保存されます。</p></div>{isLoading ? <p className="p-5 text-sm text-slate-500">読み込み中...</p> : appointments.length === 0 ? <p className="p-5 text-sm font-bold text-slate-500">予約はありません。</p> : <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['日時','顧客','対象車両','種類','担当','状態','詳細'].map((label) => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{appointments.map((item) => <tr key={item.id} className={item.status === '無断キャンセル' ? 'bg-red-50/70' : ''}><td className="px-5 py-4 font-bold">{formatDate(item.scheduled_at)}</td><td className="px-5 py-4">{item.customer_id ? <Link className="font-bold text-blue-700 hover:underline" href={`/customers/${item.customer_id}`}>{customerMap.get(item.customer_id)?.name ?? '顧客'}</Link> : '-'}</td><td className="px-5 py-4">{vehicleLabel(item.vehicle_id ? vehicleMap.get(item.vehicle_id) : undefined)}</td><td className="px-5 py-4">{item.appointment_type}</td><td className="px-5 py-4">{item.assigned_user_name ?? '-'}</td><td className="px-5 py-4"><select aria-label={`${item.id}の予約状態`} className={inputClass} value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>{item.status === '無断キャンセル' && <p className="mt-1 text-xs font-bold text-red-700">理由: 来店なし</p>}</td><td className="px-5 py-4">{item.vehicle_id ? <Link className="font-bold text-blue-700 hover:underline" href={`/vehicles/${item.vehicle_id}`}>車両詳細</Link> : '-'}</td></tr>)}</tbody></table>}</section>
    </div>
  </AppShell>;
}
