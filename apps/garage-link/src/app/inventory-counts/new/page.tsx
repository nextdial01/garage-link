'use client';


import { toUserErrorMessage } from '@/lib/errors/user-error';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';
import { requireActiveGarageStore } from '@/lib/store/garageUiContext';


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

type VehicleOption = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

function toArray(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function NewInventoryCountPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [items, setItems] = useState(initialItems);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadVehicles() {
      try {
        const supabase = createClient();
        const storeId = await getStoreId();
        const { data, error } = await supabase
          .from<VehicleOption>('vehicles')
          .select('id, management_no, maker, model_name')
          .eq('store_id', storeId)
          .eq('deleted_at', null)
          .or('is_archived.is.null,is_archived.eq.false')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setVehicles(data ?? []);
      } catch (error) {
        setErrorMessage(toUserErrorMessage(error, '車両候補の取得に失敗しました。'));
      }
    }

    void loadVehicles();
  }, []);

  function updateField(name: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateItem(index: number, key: keyof typeof initialItems[number], value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  function updateVehicleItem(index: number, vehicleId: string) {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      item_type: 'vehicle',
      vehicle_id: vehicleId,
      management_no: vehicle?.management_no ?? '',
      item_name: [vehicle?.maker, vehicle?.model_name].filter(Boolean).join(' '),
    } : item));
  }

  async function getStoreId() {
    return (await requireActiveGarageStore({ force: true })).storeId;
  }

  async function handleSave() {
    try {
      setIsSaving(true);
      setErrorMessage('');
      if (!form.count_no.trim()) throw new Error('棚卸し番号を入力してください。');
      if (!form.name.trim()) throw new Error('棚卸し名を入力してください。');
      const supabase = createClient();
      const storeId = await getStoreId();

      const itemRows = items
        .filter((item) => item.item_name || item.management_no || item.part_sku)
        .map((item) => ({
          item_type: item.item_type,
          vehicle_id: item.vehicle_id || null,
          part_sku: item.part_sku || null,
          management_no: item.management_no || null,
          item_name: item.item_name || null,
          location_name: item.location_name || null,
          actual_quantity: item.actual_quantity === '' ? null : Number(item.actual_quantity),
          memo: item.memo || null,
        }));

      const { data: countData, error: countError } = await supabase.rpc('create_inventory_count', {
        p_store_id: storeId,
        p_idempotency_key: crypto.randomUUID(),
        p_count: {
          count_no: form.count_no,
          name: form.name,
          count_type: form.count_type,
          count_category: form.count_category,
          scheduled_date: form.scheduled_date || null,
          target_inventory: form.target_inventory,
          target_vehicle_statuses: toArray(form.target_vehicle_statuses),
          target_part_categories: toArray(form.target_part_categories),
          target_condition_memo: form.target_condition_memo || null,
          target_locations: toArray(form.target_locations),
          shelf_area: form.shelf_area || null,
          location_memo: form.location_memo || null,
          check_method: form.check_method,
          device_type: form.device_type,
          barcode_usage: form.barcode_usage,
          unread_handling: form.unread_handling,
          internal_memo: form.internal_memo || null,
          caution_note: form.caution_note || null,
        },
        p_items: itemRows,
      });

      const result = countData as { ok?: boolean; inventory_count_id?: string } | null;
      if (countError || !result?.ok || !result.inventory_count_id) throw new Error(countError?.message ?? '棚卸しの保存に失敗しました。');

      router.push('/inventory-counts');
    } catch (error) {
      setErrorMessage(toUserErrorMessage(error, '保存に失敗しました。'));
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
              <p className="mt-1 text-sm text-slate-500">車両は登録済み車両を選択してください。部品はSKUを入力できます。</p>
            </div>
            <button type="button" onClick={() => setItems((current) => [...current, initialItems[0]])} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">明細追加</button>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>{['種別','対象車両','SKU','管理番号','品名','場所','帳簿数','実数','差異','状態','メモ'].map((h)=><th key={h} className="px-3 py-3">{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td className="px-3 py-3">
                      <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={item.item_type} onChange={(e) => updateItem(index, 'item_type', e.target.value)} />
                    </td>
                    <td className="px-3 py-3">
                      <select aria-label={`明細${index + 1}の対象車両`} className="w-full min-w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={item.vehicle_id} onChange={(e) => updateVehicleItem(index, e.target.value)}>
                        <option value="">未選択</option>
                        {vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {[vehicle.management_no, vehicle.maker, vehicle.model_name].filter(Boolean).join(' / ') || '車両名未設定'}
                          </option>
                        ))}
                      </select>
                    </td>
                    {(['part_sku','management_no','item_name','location_name','system_quantity','actual_quantity','difference_quantity','check_status','memo'] as (keyof typeof item)[]).map((key) => (
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
