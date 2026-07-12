'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type Member = { store_id: string };
type Inquiry = { id: string; customer_id: string | null; vehicle_id: string | null; deal_id: string | null; answers: Record<string, unknown>; submitted_at: string | null; source_route: string | null };
type Customer = { id: string; name: string | null };
type Vehicle = { id: string; maker: string | null; model_name: string | null; management_no: string | null };
type Deal = { id: string; title: string | null; deal_no: string | null };
const inputClass = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

function vehicleLabel(vehicle: Vehicle | undefined) { return vehicle ? `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || vehicle.management_no || '車両' : '未設定'; }
function answerLabel(answers: Record<string, unknown>) { const value = Object.values(answers).find((item) => typeof item === 'string' && item.trim()); return value ? String(value).slice(0, 80) : '回答内容を確認'; }

export default function InquiriesPage() {
  const [storeId, setStoreId] = useState('');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient(); const { data: user } = await supabase.auth.getUser();
        if (!user.user?.id) throw new Error('ログインが必要です。');
        const { data: member, error: memberError } = await supabase.from<Member>('store_members').select('store_id').eq('user_id', user.user.id).single();
        if (memberError || !member) throw new Error('所属店舗が見つかりません。'); setStoreId(member.store_id);
        const [inquiryResult, customerResult, vehicleResult, dealResult] = await Promise.all([
          supabase.from<Inquiry>('line_form_responses').select('id, customer_id, vehicle_id, deal_id, answers, submitted_at, source_route').eq('store_id', member.store_id).order('submitted_at', { ascending: false }),
          supabase.from<Customer>('customers').select('id, name').eq('store_id', member.store_id),
          supabase.from<Vehicle>('vehicles').select('id, maker, model_name, management_no').eq('store_id', member.store_id),
          supabase.from<Deal>('deals').select('id, title, deal_no').eq('store_id', member.store_id),
        ]);
        if (inquiryResult.error) throw new Error('問い合わせを取得できませんでした。');
        setInquiries(inquiryResult.data ?? []); setCustomers(customerResult.data ?? []); setVehicles(vehicleResult.data ?? []); setDeals(dealResult.data ?? []);
      } catch (error) { setErrorMessage(error instanceof Error ? error.message : '問い合わせの取得に失敗しました。'); } finally { setIsLoading(false); }
    }
    void load();
  }, []);
  async function updateLink(id: string, field: 'customer_id' | 'vehicle_id' | 'deal_id', value: string) {
    const next = value || null; const supabase = createClient(); const { error } = await supabase.from<Inquiry>('line_form_responses').update({ [field]: next }).eq('id', id).eq('store_id', storeId);
    if (error) { setErrorMessage('紐付けを保存できませんでした。'); return; }
    setInquiries((items) => items.map((item) => item.id === id ? { ...item, [field]: next } : item));
  }
  return <AppShell activeLabel="問い合わせ" title="問い合わせ" description="問い合わせを顧客・車両・商談へ紐付け、対応漏れを防ぎます。">
    <div className="space-y-6"><div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-900">未設定の紐付けを上から選ぶと、顧客詳細・車両詳細・商談詳細の履歴にまとめて追えるようになります。</div>{errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</p>}<section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">{isLoading ? <p className="p-5 text-sm text-slate-500">読み込み中...</p> : inquiries.length === 0 ? <p className="p-5 text-sm font-bold text-slate-500">問い合わせはありません。</p> : <table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr>{['受付日時','内容','顧客','車両','商談','流入元'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{inquiries.map((item) => <tr key={item.id}><td className="px-4 py-4 font-bold">{item.submitted_at ? new Date(item.submitted_at).toLocaleString('ja-JP') : '-'}</td><td className="max-w-[220px] px-4 py-4"><span className="block truncate">{answerLabel(item.answers)}</span></td><td className="px-4 py-4"><select aria-label={`${item.id}の顧客`} className={inputClass} value={item.customer_id ?? ''} onChange={(event) => void updateLink(item.id, 'customer_id', event.target.value)}><option value="">未設定</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name ?? '顧客'}</option>)}</select>{item.customer_id && <Link className="mt-1 block text-xs font-bold text-blue-700 hover:underline" href={`/customers/${item.customer_id}`}>詳細</Link>}</td><td className="px-4 py-4"><select aria-label={`${item.id}の車両`} className={inputClass} value={item.vehicle_id ?? ''} onChange={(event) => void updateLink(item.id, 'vehicle_id', event.target.value)}><option value="">未設定</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>)}</select>{item.vehicle_id && <Link className="mt-1 block text-xs font-bold text-blue-700 hover:underline" href={`/vehicles/${item.vehicle_id}`}>詳細</Link>}</td><td className="px-4 py-4"><select aria-label={`${item.id}の商談`} className={inputClass} value={item.deal_id ?? ''} onChange={(event) => void updateLink(item.id, 'deal_id', event.target.value)}><option value="">未設定</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title ?? deal.deal_no ?? '商談'}</option>)}</select>{item.deal_id && <Link className="mt-1 block text-xs font-bold text-blue-700 hover:underline" href={`/deals/${item.deal_id}`}>詳細</Link>}</td><td className="px-4 py-4">{item.source_route ?? '-'}</td></tr>)}</tbody></table>}</section></div>
  </AppShell>;
}
