'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const initialForm = {
  count_no: '',
  name: '',
  count_type: 'vehicle',
  count_category: 'regular',
  status: 'draft',
  scheduled_date: '',
  target_inventory: 'vehicles',
  target_vehicle_statuses: '',
  target_part_categories: '',
  target_condition_memo: '',
  target_store_name: '',
  target_locations: '',
  shelf_area: '',
  location_memo: '',
  check_method: 'visual',
  device_type: 'none',
  barcode_usage: 'none',
  unread_handling: 'keep_unchecked',
  difference_count: '0',
  unchecked_count: '0',
  adjustment_target_count: '0',
  adjustment_reason: '',
  adjustment_policy: '',
  difference_memo: '',
  counted_by: '',
  checked_by: '',
  approved_by: '',
  approval_status: 'not_requested',
  approved_at: '',
  approval_comment: '',
  internal_memo: '',
  caution_note: '',
  next_improvement: '',
};

const initialItems = [
  { item_type: 'vehicle', vehicle_id: '', part_sku: '', management_no: '', item_name: '', location_name: '', system_quantity: '1', actual_quantity: '', difference_quantity: '', check_status: 'unchecked', memo: '' },
];

function toNumber(value: string) {
  return value === '' ? 0 : Number(value);
}

function toArray(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function NewInventoryCountPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [items, setItems] = useState(initialItems);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function updateField(name: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateItem(index: number, key: keyof typeof initialItems[number], value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  async function getStoreId() {
    const supabase = createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');
    const { data: member, error: memberError } = await supabase.from<StoreMemberRow>('store_members').select('store_id').eq('user_id', userData.user.id).single();
    if (memberError || !member?.store_id) throw new Error('所属店舗を取得できませんでした。');
    return member.store_id;
  }

  async function handleSave() {
    try {
      setIsSaving(true);
      setErrorMessage('');
      if (!form.count_no.trim()) throw new Error('棚卸し番号を入力してください。');
      if (!form.name.trim()) throw new Error('棚卸し名を入力してください。');
      const supabase = createClient();
      const storeId = await getStoreId();

      const { data: countData, error: countError } = await supabase
        .from<{ id: string }>('inventory_counts')
        .insert({
          store_id: storeId,
          count_no: form.count_no,
          name: form.name,
          count_type: form.count_type,
          count_category: form.count_category,
          status: form.status,
          scheduled_date: form.scheduled_date || null,
          target_inventory: form.target_inventory,
          target_vehicle_statuses: toArray(form.target_vehicle_statuses),
          target_part_categories: toArray(form.target_part_categories),
          target_condition_memo: form.target_condition_memo || null,
          target_store_name: form.target_store_name || null,
          target_locations: toArray(form.target_locations),
          shelf_area: form.shelf_area || null,
          location_memo: form.location_memo || null,
          check_method: form.check_method,
          device_type: form.device_type,
          barcode_usage: form.barcode_usage,
          unread_handling: form.unread_handling,
          difference_count: toNumber(form.difference_count),
          unchecked_count: toNumber(form.unchecked_count),
          adjustment_target_count: toNumber(form.adjustment_target_count),
          adjustment_reason: form.adjustment_reason || null,
          adjustment_policy: form.adjustment_policy || null,
          difference_memo: form.difference_memo || null,
          counted_by: form.counted_by || null,
          checked_by: form.checked_by || null,
          approved_by: form.approved_by || null,
          approval_status: form.approval_status,
          approved_at: form.approved_at || null,
          approval_comment: form.approval_comment || null,
          internal_memo: form.internal_memo || null,
          caution_note: form.caution_note || null,
          next_improvement: form.next_improvement || null,
        })
        .select('id')
        .single();

      if (countError || !countData?.id) throw new Error(countError?.message ?? '棚卸しの保存に失敗しました。');

      const itemRows = items
        .filter((item) => item.item_name || item.management_no || item.part_sku)
        .map((item) => ({
          store_id: storeId,
          inventory_count_id: countData.id,
          item_type: item.item_type,
          vehicle_id: item.vehicle_id || null,
          part_sku: item.part_sku || null,
          management_no: item.management_no || null,
          item_name: item.item_name || null,
          location_name: item.location_name || null,
          system_quantity: toNumber(item.system_quantity),
          actual_quantity: item.actual_quantity === '' ? null : Number(item.actual_quantity),
          difference_quantity: item.difference_quantity === '' ? null : Number(item.difference_quantity),
          check_status: item.check_status,
          memo: item.memo || null,
        }));

      if (itemRows.length > 0) {
        const { error: itemError } = await supabase.from('inventory_count_items').insert(itemRows);
        if (itemError) throw new Error(itemError.message);
      }

      router.push('/inventory-counts');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      activeLabel="棚卸し"
      title="棚卸し登録"
      description="車両・部品の棚卸し予定と確認明細を登録します"
      actionButton={<Link href="/inventory-counts" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">一覧に戻る</Link>}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">棚卸し基本情報</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['count_no','棚卸し番号','例：IC-2026-000001'],['name','棚卸し名','例：6月車両棚卸し'],['scheduled_date','実施予定日',''],
              ['target_store_name','対象店舗名',''],['shelf_area','棚・エリア',''],['counted_by','棚卸し担当',''],['checked_by','確認者',''],['approved_by','承認者',''],
            ].map(([name,label,placeholder]) => (
              <label key={name}><span className="text-sm font-bold text-slate-700">{label}</span><input type={name === 'scheduled_date' ? 'date' : 'text'} className={`${inputClass} mt-2`} value={form[name as keyof typeof initialForm]} onChange={(e) => updateField(name as keyof typeof initialForm, e.target.value)} placeholder={placeholder} /></label>
            ))}
            <label><span className="text-sm font-bold text-slate-700">種別</span><select className={`${inputClass} mt-2`} value={form.count_type} onChange={(e) => updateField('count_type', e.target.value)}><option value="vehicle">車両</option><option value="parts">部品</option><option value="mixed">車両・部品</option></select></label>
            <label><span className="text-sm font-bold text-slate-700">区分</span><select className={`${inputClass} mt-2`} value={form.count_category} onChange={(e) => updateField('count_category', e.target.value)}><option value="regular">定期</option><option value="spot">臨時</option><option value="closing">決算</option></select></label>
            <label><span className="text-sm font-bold text-slate-700">ステータス</span><select className={`${inputClass} mt-2`} value={form.status} onChange={(e) => updateField('status', e.target.value)}><option value="draft">下書き</option><option value="in_progress">棚卸し中</option><option value="completed">完了</option><option value="cancelled">キャンセル</option></select></label>
            <label><span className="text-sm font-bold text-slate-700">承認状態</span><select className={`${inputClass} mt-2`} value={form.approval_status} onChange={(e) => updateField('approval_status', e.target.value)}><option value="not_requested">未申請</option><option value="requested">申請中</option><option value="approved">承認済み</option><option value="rejected">差戻し</option></select></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">対象・確認方法・差異</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['target_inventory','対象在庫'],['target_vehicle_statuses','対象車両ステータス'],['target_part_categories','対象部品カテゴリ'],['target_locations','対象場所'],['check_method','確認方法'],['device_type','端末種別'],['barcode_usage','バーコード利用'],['unread_handling','未読取対応'],['difference_count','差異件数'],['unchecked_count','未確認件数'],['adjustment_target_count','調整対象件数'],
            ].map(([name,label]) => (
              <label key={name}><span className="text-sm font-bold text-slate-700">{label}</span><input type={name.includes('count') ? 'number' : 'text'} className={`${inputClass} mt-2`} value={form[name as keyof typeof initialForm]} onChange={(e) => updateField(name as keyof typeof initialForm, e.target.value)} /></label>
            ))}
            {[
              ['target_condition_memo','対象条件メモ'],['location_memo','場所メモ'],['adjustment_reason','調整理由'],['adjustment_policy','調整方針'],['difference_memo','差異メモ'],['approval_comment','承認コメント'],['internal_memo','社内メモ'],['caution_note','注意事項'],['next_improvement','次回改善'],
            ].map(([name,label]) => (
              <label key={name} className="md:col-span-2 xl:col-span-3"><span className="text-sm font-bold text-slate-700">{label}</span><textarea className={`${inputClass} mt-2 min-h-24`} value={form[name as keyof typeof initialForm]} onChange={(e) => updateField(name as keyof typeof initialForm, e.target.value)} /></label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
            <div>
              <h3 className="text-lg font-bold text-slate-950">棚卸し明細</h3>
              <p className="mt-1 text-sm text-slate-500">まずは手入力で明細を登録できます。</p>
            </div>
            <button type="button" onClick={() => setItems((current) => [...current, initialItems[0]])} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">明細追加</button>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>{['種別','SKU','管理番号','品名','場所','帳簿数','実数','差異','状態','メモ'].map((h)=><th key={h} className="px-3 py-3">{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    {(['item_type','part_sku','management_no','item_name','location_name','system_quantity','actual_quantity','difference_quantity','check_status','memo'] as (keyof typeof item)[]).map((key) => (
                      <td key={key} className="px-3 py-3">
                        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={item[key]} onChange={(e) => updateItem(index, key, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-6">
          <Link href="/inventory-counts" className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700">キャンセル</Link>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
            {isSaving ? '保存中...' : '棚卸しを保存する'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
