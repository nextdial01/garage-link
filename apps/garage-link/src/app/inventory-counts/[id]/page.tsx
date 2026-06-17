'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import SoftDeleteButton from '@/components/SoftDeleteButton';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string };

type InventoryCountRow = {
  id: string;
  store_id: string;
  count_no: string;
  name: string;
  count_type: string | null;
  count_category: string | null;
  status: string | null;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  target_inventory: string | null;
  target_vehicle_statuses: string[] | null;
  target_part_categories: string[] | null;
  target_condition_memo: string | null;
  target_store_name: string | null;
  target_locations: string[] | null;
  shelf_area: string | null;
  location_memo: string | null;
  check_method: string | null;
  device_type: string | null;
  barcode_usage: string | null;
  unread_handling: string | null;
  difference_count: number | null;
  unchecked_count: number | null;
  adjustment_target_count: number | null;
  adjustment_reason: string | null;
  adjustment_policy: string | null;
  difference_memo: string | null;
  counted_by: string | null;
  checked_by: string | null;
  approved_by: string | null;
  approval_status: string | null;
  approved_at: string | null;
  approval_comment: string | null;
  internal_memo: string | null;
  caution_note: string | null;
  next_improvement: string | null;
};

type InventoryItemRow = {
  id: string;
  store_id: string;
  inventory_count_id: string;
  item_type: string | null;
  vehicle_id: string | null;
  part_sku: string | null;
  management_no: string | null;
  item_name: string | null;
  location_name: string | null;
  system_quantity: number | null;
  actual_quantity: number | null;
  difference_quantity: number | null;
  check_status: string | null;
  checked_at: string | null;
  checked_by: string | null;
  memo: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  is_archived?: boolean | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  registration_no: string | null;
  maker: string | null;
  model_name: string | null;
  status: string | null;
  location_name: string | null;
};

type InventoryFormState = {
  count_no: string;
  name: string;
  count_type: string;
  count_category: string;
  status: string;
  scheduled_date: string;
  started_at: string;
  completed_at: string;
  target_inventory: string;
  target_vehicle_statuses: string;
  target_part_categories: string;
  target_condition_memo: string;
  target_store_name: string;
  target_locations: string;
  shelf_area: string;
  location_memo: string;
  check_method: string;
  device_type: string;
  barcode_usage: string;
  unread_handling: string;
  difference_count: string;
  unchecked_count: string;
  adjustment_target_count: string;
  adjustment_reason: string;
  adjustment_policy: string;
  difference_memo: string;
  counted_by: string;
  checked_by: string;
  approved_by: string;
  approval_status: string;
  approved_at: string;
  approval_comment: string;
  internal_memo: string;
  caution_note: string;
  next_improvement: string;
};

type ItemFormRow = {
  localId: string;
  id: string | null;
  item_type: string;
  vehicle_id: string;
  part_sku: string;
  management_no: string;
  item_name: string;
  location_name: string;
  system_quantity: string;
  actual_quantity: string;
  difference_quantity: string;
  check_status: string;
  checked_by: string;
  memo: string;
  deleted: boolean;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const compactInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

const emptyForm: InventoryFormState = {
  count_no: '',
  name: '',
  count_type: 'vehicle',
  count_category: 'regular',
  status: 'draft',
  scheduled_date: '',
  started_at: '',
  completed_at: '',
  target_inventory: '',
  target_vehicle_statuses: '',
  target_part_categories: '',
  target_condition_memo: '',
  target_store_name: '',
  target_locations: '',
  shelf_area: '',
  location_memo: '',
  check_method: '',
  device_type: '',
  barcode_usage: '',
  unread_handling: '',
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

const countTypeOptions = [
  ['vehicle', '車両'],
  ['parts', '部品'],
  ['mixed', '車両・部品'],
  ['other', 'その他'],
];

const countCategoryOptions = [
  ['regular', '定期棚卸し'],
  ['spot', '臨時棚卸し'],
  ['move_check', '移動確認'],
  ['adjustment', '差異調整'],
  ['other', 'その他'],
];

const statusOptions = [
  ['draft', '下書き'],
  ['in_progress', '実施中'],
  ['completed', '完了'],
  ['approval_waiting', '承認待ち'],
  ['approved', '承認済み'],
  ['cancelled', '取消'],
];

const approvalOptions = [
  ['not_requested', '未申請'],
  ['requested', '申請中'],
  ['approved', '承認済み'],
  ['rejected', '差戻し'],
];

const checkStatusOptions = [
  ['unchecked', '未確認'],
  ['matched', '一致'],
  ['different', '差異あり'],
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

function toNumber(value: string) {
  return value.trim() === '' ? 0 : Number(value);
}

function toArray(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionLabel(options: string[][], value: string | null | undefined) {
  return options.find(([optionValue]) => optionValue === value)?.[1] ?? displayValue(value);
}

function getStatusClass(status: string | null) {
  switch (status) {
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'completed':
    case 'approved':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'approval_waiting':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case 'cancelled':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function getCheckStatusClass(status: string) {
  switch (status) {
    case 'matched':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'different':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function calculateDifference(row: Pick<ItemFormRow, 'system_quantity' | 'actual_quantity'>) {
  if (row.actual_quantity.trim() === '') return '';
  return String(toNumber(row.actual_quantity) - toNumber(row.system_quantity));
}

function createEmptyItem(): ItemFormRow {
  return {
    localId: crypto.randomUUID(),
    id: null,
    item_type: 'vehicle',
    vehicle_id: '',
    part_sku: '',
    management_no: '',
    item_name: '',
    location_name: '',
    system_quantity: '0',
    actual_quantity: '',
    difference_quantity: '',
    check_status: 'unchecked',
    checked_by: '',
    memo: '',
    deleted: false,
  };
}

function mapCountToForm(count: InventoryCountRow): InventoryFormState {
  return {
    count_no: count.count_no ?? '',
    name: count.name ?? '',
    count_type: count.count_type ?? 'vehicle',
    count_category: count.count_category ?? 'regular',
    status: count.status ?? 'draft',
    scheduled_date: count.scheduled_date ?? '',
    started_at: toInputDateTime(count.started_at),
    completed_at: toInputDateTime(count.completed_at),
    target_inventory: count.target_inventory ?? '',
    target_vehicle_statuses: (count.target_vehicle_statuses ?? []).join(', '),
    target_part_categories: (count.target_part_categories ?? []).join(', '),
    target_condition_memo: count.target_condition_memo ?? '',
    target_store_name: count.target_store_name ?? '',
    target_locations: (count.target_locations ?? []).join(', '),
    shelf_area: count.shelf_area ?? '',
    location_memo: count.location_memo ?? '',
    check_method: count.check_method ?? '',
    device_type: count.device_type ?? '',
    barcode_usage: count.barcode_usage ?? '',
    unread_handling: count.unread_handling ?? '',
    difference_count: String(count.difference_count ?? 0),
    unchecked_count: String(count.unchecked_count ?? 0),
    adjustment_target_count: String(count.adjustment_target_count ?? 0),
    adjustment_reason: count.adjustment_reason ?? '',
    adjustment_policy: count.adjustment_policy ?? '',
    difference_memo: count.difference_memo ?? '',
    counted_by: count.counted_by ?? '',
    checked_by: count.checked_by ?? '',
    approved_by: count.approved_by ?? '',
    approval_status: count.approval_status ?? 'not_requested',
    approved_at: toInputDateTime(count.approved_at),
    approval_comment: count.approval_comment ?? '',
    internal_memo: count.internal_memo ?? '',
    caution_note: count.caution_note ?? '',
    next_improvement: count.next_improvement ?? '',
  };
}

function mapItemToForm(item: InventoryItemRow): ItemFormRow {
  const formRow = {
    localId: item.id,
    id: item.id,
    item_type: item.item_type ?? 'vehicle',
    vehicle_id: item.vehicle_id ?? '',
    part_sku: item.part_sku ?? '',
    management_no: item.management_no ?? '',
    item_name: item.item_name ?? '',
    location_name: item.location_name ?? '',
    system_quantity: item.system_quantity === null ? '0' : String(item.system_quantity ?? 0),
    actual_quantity: item.actual_quantity === null ? '' : String(item.actual_quantity ?? ''),
    difference_quantity: item.difference_quantity === null ? '' : String(item.difference_quantity ?? ''),
    check_status: item.check_status ?? 'unchecked',
    checked_by: item.checked_by ?? '',
    memo: item.memo ?? '',
    deleted: false,
  };
  return { ...formRow, difference_quantity: formRow.difference_quantity || calculateDifference(formRow) };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
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

export default function InventoryCountDetailPage() {
  const params = useParams<{ id: string }>();
  const inventoryCountId = params.id;
  const [storeId, setStoreId] = useState('');
  const [form, setForm] = useState<InventoryFormState>(emptyForm);
  const [items, setItems] = useState<ItemFormRow[]>([]);
  const [vehiclesById, setVehiclesById] = useState<Record<string, VehicleRow>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const visibleItems = useMemo(() => items.filter((item) => !item.deleted), [items]);
  const calculatedCounts = useMemo(() => {
    const differenceCount = visibleItems.filter((item) => toNumber(item.difference_quantity) !== 0).length;
    const uncheckedCount = visibleItems.filter((item) => item.check_status === 'unchecked').length;
    return {
      differenceCount,
      uncheckedCount,
      adjustmentTargetCount: differenceCount,
    };
  }, [visibleItems]);

  function updateField(name: keyof InventoryFormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateItem(localId: string, key: keyof ItemFormRow, value: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.localId !== localId) return item;
        const updated = { ...item, [key]: value };
        if (key === 'system_quantity' || key === 'actual_quantity') {
          updated.difference_quantity = calculateDifference(updated);
          if (updated.difference_quantity !== '' && toNumber(updated.difference_quantity) !== 0) {
            updated.check_status = 'different';
          }
        }
        return updated;
      })
    );
  }

  function addItem() {
    setItems((current) => [...current, createEmptyItem()]);
  }

  function removeItem(localId: string) {
    setItems((current) =>
      current
        .map((item) => (item.localId === localId ? { ...item, deleted: true } : item))
        .filter((item) => item.id || !item.deleted)
    );
  }

  useEffect(() => {
    async function loadInventoryCount() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
        setStoreId(member.store_id);

        const { data: count, error: countError } = await supabase
          .from<InventoryCountRow>('inventory_counts')
          .select('*')
          .eq('id', inventoryCountId)
          .eq('store_id', member.store_id)
          .single();
        if (countError) {
          if (countError.message.toLowerCase().includes('0 rows')) {
            setNotFound(true);
            return;
          }
          throw new Error(countError.message);
        }
        if (!count) {
          setNotFound(true);
          return;
        }

        const { data: itemRows, error: itemError } = await supabase
          .from<InventoryItemRow>('inventory_count_items')
          .select('*')
          .eq('inventory_count_id', count.id)
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: true });
        if (itemError) throw new Error(itemError.message);

        const vehicleIds = Array.from(new Set((itemRows ?? []).map((item) => item.vehicle_id).filter((id): id is string => Boolean(id))));
        if (vehicleIds.length > 0) {
          const { data: vehicles, error: vehicleError } = await supabase
            .from<VehicleRow>('vehicles')
            .select('id, management_no, registration_no, maker, model_name, status, location_name')
            .eq('store_id', member.store_id);
          if (vehicleError) throw new Error(vehicleError.message);
          setVehiclesById(Object.fromEntries((vehicles ?? []).filter((vehicle: VehicleRow) => vehicleIds.includes(vehicle.id)).map((vehicle: VehicleRow) => [vehicle.id, vehicle])));
        }

        setForm(mapCountToForm(count));
        setItems((itemRows ?? []).filter((item) => !item.deleted_at && item.is_archived !== true).map(mapItemToForm));
        setNotFound(false);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '棚卸しの取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadInventoryCount();
  }, [inventoryCountId]);

  async function handleSave() {
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');
      if (!storeId) throw new Error('所属店舗を取得できませんでした。');
      if (!form.count_no.trim()) throw new Error('棚卸し番号を入力してください。');
      if (!form.name.trim()) throw new Error('棚卸し名を入力してください。');

      const supabase = createClient();
      const { data: saveUserData } = await supabase.auth.getUser();
      const deletedBy = saveUserData.user?.email ?? null;
      const differenceCount = calculatedCounts.differenceCount;
      const uncheckedCount = calculatedCounts.uncheckedCount;
      const adjustmentTargetCount = calculatedCounts.adjustmentTargetCount;

      const { error: countError } = await supabase
        .from<InventoryCountRow>('inventory_counts')
        .update({
          count_no: form.count_no.trim(),
          name: form.name.trim(),
          count_type: form.count_type,
          count_category: form.count_category,
          status: form.status,
          scheduled_date: form.scheduled_date || null,
          started_at: form.started_at || null,
          completed_at: form.completed_at || null,
          target_inventory: toNullableText(form.target_inventory),
          target_vehicle_statuses: toArray(form.target_vehicle_statuses),
          target_part_categories: toArray(form.target_part_categories),
          target_condition_memo: toNullableText(form.target_condition_memo),
          target_store_name: toNullableText(form.target_store_name),
          target_locations: toArray(form.target_locations),
          shelf_area: toNullableText(form.shelf_area),
          location_memo: toNullableText(form.location_memo),
          check_method: toNullableText(form.check_method),
          device_type: toNullableText(form.device_type),
          barcode_usage: toNullableText(form.barcode_usage),
          unread_handling: toNullableText(form.unread_handling),
          difference_count: differenceCount,
          unchecked_count: uncheckedCount,
          adjustment_target_count: adjustmentTargetCount,
          adjustment_reason: toNullableText(form.adjustment_reason),
          adjustment_policy: toNullableText(form.adjustment_policy),
          difference_memo: toNullableText(form.difference_memo),
          counted_by: toNullableText(form.counted_by),
          checked_by: toNullableText(form.checked_by),
          approved_by: toNullableText(form.approved_by),
          approval_status: form.approval_status,
          approved_at: form.approved_at || null,
          approval_comment: toNullableText(form.approval_comment),
          internal_memo: toNullableText(form.internal_memo),
          caution_note: toNullableText(form.caution_note),
          next_improvement: toNullableText(form.next_improvement),
        })
        .eq('id', inventoryCountId)
        .eq('store_id', storeId);
      if (countError) throw new Error(countError.message);

      const itemOperations = items.map(async (item) => {
        if (item.deleted && item.id) {
          const { error } = await supabase
            .from<InventoryItemRow>('inventory_count_items')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: deletedBy,
              is_archived: true,
            })
            .eq('id', item.id)
            .eq('store_id', storeId)
            .eq('inventory_count_id', inventoryCountId);
          if (error) throw new Error(error.message);
          return;
        }
        if (item.deleted) return;

        const payload = {
          store_id: storeId,
          inventory_count_id: inventoryCountId,
          item_type: toNullableText(item.item_type),
          vehicle_id: item.vehicle_id || null,
          part_sku: toNullableText(item.part_sku),
          management_no: toNullableText(item.management_no),
          item_name: toNullableText(item.item_name),
          location_name: toNullableText(item.location_name),
          system_quantity: toNumber(item.system_quantity),
          actual_quantity: toNullableNumber(item.actual_quantity),
          difference_quantity: toNullableNumber(item.difference_quantity),
          check_status: item.check_status,
          checked_by: toNullableText(item.checked_by),
          memo: toNullableText(item.memo),
        };

        if (item.id) {
          const { error } = await supabase
            .from<InventoryItemRow>('inventory_count_items')
            .update(payload)
            .eq('id', item.id)
            .eq('store_id', storeId)
            .eq('inventory_count_id', inventoryCountId);
          if (error) throw new Error(error.message);
        } else if (item.item_name || item.management_no || item.part_sku) {
          const { error } = await supabase.from<InventoryItemRow>('inventory_count_items').insert(payload);
          if (error) throw new Error(error.message);
        }
      });

      await Promise.all(itemOperations);
      setForm((current) => ({
        ...current,
        difference_count: String(differenceCount),
        unchecked_count: String(uncheckedCount),
        adjustment_target_count: String(adjustmentTargetCount),
      }));
      setItems((current) => current.filter((item) => !item.deleted));
      setSuccessMessage('棚卸し情報を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '棚卸し情報の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell activeLabel="棚卸し" title="棚卸し詳細" description="登録済みの棚卸し情報と明細を確認・編集します">
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</p>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell
        activeLabel="棚卸し"
        title="棚卸し詳細"
        description="登録済みの棚卸し情報と明細を確認・編集します"
        actionButton={<Link href="/inventory-counts" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">一覧に戻る</Link>}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">棚卸しが見つかりません</h3>
          <p className="mt-2 text-sm text-slate-500">削除済み、または所属店舗の棚卸しではない可能性があります。</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      activeLabel="棚卸し"
      title="棚卸し詳細"
      description="登録済みの棚卸し情報と明細を確認・編集します"
      actionButton={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isSaving ? '保存中...' : '保存する'}
          </button>
          <SoftDeleteButton
            tableName="inventory_counts"
            rowId={inventoryCountId}
            storeId={storeId}
            targetType="inventory_count"
            targetLabel={form.count_no || form.name || '棚卸し'}
            redirectHref="/inventory-counts"
          />
          <Link href="/inventory-counts" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
            一覧に戻る
          </Link>
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {successMessage && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">ステータス</p>
            <p className="mt-3">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(form.status)}`}>
                {optionLabel(statusOptions, form.status)}
              </span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">差異件数</p>
            <p className="mt-3 text-3xl font-bold text-red-600">{calculatedCounts.differenceCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">未確認件数</p>
            <p className="mt-3 text-3xl font-bold">{calculatedCounts.uncheckedCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">明細数</p>
            <p className="mt-3 text-3xl font-bold">{visibleItems.length}</p>
          </div>
        </div>

        <Section title="基本情報" description="棚卸し番号、実施予定、進行状況を編集します。">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="棚卸し番号"><input className={inputClass} value={form.count_no} onChange={(event) => updateField('count_no', event.target.value)} /></Field>
            <Field label="棚卸し名"><input className={inputClass} value={form.name} onChange={(event) => updateField('name', event.target.value)} /></Field>
            <Field label="棚卸し種別">
              <select className={inputClass} value={form.count_type} onChange={(event) => updateField('count_type', event.target.value)}>
                {countTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="棚卸し区分">
              <select className={inputClass} value={form.count_category} onChange={(event) => updateField('count_category', event.target.value)}>
                {countCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="ステータス">
              <select className={inputClass} value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="実施予定日"><input type="date" className={inputClass} value={form.scheduled_date} onChange={(event) => updateField('scheduled_date', event.target.value)} /></Field>
            <Field label="開始日時"><input type="datetime-local" className={inputClass} value={form.started_at} onChange={(event) => updateField('started_at', event.target.value)} /></Field>
            <Field label="完了日時"><input type="datetime-local" className={inputClass} value={form.completed_at} onChange={(event) => updateField('completed_at', event.target.value)} /></Field>
          </div>
        </Section>

        <Section title="対象条件" description="どの在庫・ステータス・カテゴリを棚卸し対象にするかを管理します。">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="対象在庫"><input className={inputClass} value={form.target_inventory} onChange={(event) => updateField('target_inventory', event.target.value)} placeholder="例：vehicles" /></Field>
            <Field label="対象車両ステータス"><input className={inputClass} value={form.target_vehicle_statuses} onChange={(event) => updateField('target_vehicle_statuses', event.target.value)} placeholder="例：在庫中, 展示中" /></Field>
            <Field label="対象部品カテゴリ"><input className={inputClass} value={form.target_part_categories} onChange={(event) => updateField('target_part_categories', event.target.value)} placeholder="例：オイル, タイヤ" /></Field>
            <Field label="対象条件メモ" wide><textarea className={`${inputClass} min-h-24`} value={form.target_condition_memo} onChange={(event) => updateField('target_condition_memo', event.target.value)} /></Field>
          </div>
        </Section>

        <Section title="場所" description="対象店舗やロケーション、棚エリアを管理します。">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="対象店舗名"><input className={inputClass} value={form.target_store_name} onChange={(event) => updateField('target_store_name', event.target.value)} /></Field>
            <Field label="対象ロケーション"><input className={inputClass} value={form.target_locations} onChange={(event) => updateField('target_locations', event.target.value)} placeholder="例：本店, 第2倉庫" /></Field>
            <Field label="棚エリア"><input className={inputClass} value={form.shelf_area} onChange={(event) => updateField('shelf_area', event.target.value)} /></Field>
            <Field label="場所メモ" wide><textarea className={`${inputClass} min-h-24`} value={form.location_memo} onChange={(event) => updateField('location_memo', event.target.value)} /></Field>
          </div>
        </Section>

        <Section title="確認方法" description="確認方法、使用端末、バーコードの扱いを設定します。">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="確認方法"><input className={inputClass} value={form.check_method} onChange={(event) => updateField('check_method', event.target.value)} /></Field>
            <Field label="使用端末"><input className={inputClass} value={form.device_type} onChange={(event) => updateField('device_type', event.target.value)} /></Field>
            <Field label="バーコード利用"><input className={inputClass} value={form.barcode_usage} onChange={(event) => updateField('barcode_usage', event.target.value)} /></Field>
            <Field label="未読込時の扱い"><input className={inputClass} value={form.unread_handling} onChange={(event) => updateField('unread_handling', event.target.value)} /></Field>
          </div>
        </Section>

        <Section title="差異・調整" description="差異件数は明細から自動計算され、保存時に反映されます。">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="差異件数"><input readOnly className={`${inputClass} bg-slate-50 text-right`} value={calculatedCounts.differenceCount} /></Field>
            <Field label="未確認件数"><input readOnly className={`${inputClass} bg-slate-50 text-right`} value={calculatedCounts.uncheckedCount} /></Field>
            <Field label="調整対象件数"><input readOnly className={`${inputClass} bg-slate-50 text-right`} value={calculatedCounts.adjustmentTargetCount} /></Field>
            <Field label="調整理由" wide><textarea className={`${inputClass} min-h-24`} value={form.adjustment_reason} onChange={(event) => updateField('adjustment_reason', event.target.value)} /></Field>
            <Field label="調整方針" wide><textarea className={`${inputClass} min-h-24`} value={form.adjustment_policy} onChange={(event) => updateField('adjustment_policy', event.target.value)} /></Field>
            <Field label="差異メモ" wide><textarea className={`${inputClass} min-h-24`} value={form.difference_memo} onChange={(event) => updateField('difference_memo', event.target.value)} /></Field>
          </div>
        </Section>

        <Section title="承認" description="担当者、確認者、承認状態を管理します。">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="棚卸し担当者"><input className={inputClass} value={form.counted_by} onChange={(event) => updateField('counted_by', event.target.value)} /></Field>
            <Field label="確認者"><input className={inputClass} value={form.checked_by} onChange={(event) => updateField('checked_by', event.target.value)} /></Field>
            <Field label="承認者"><input className={inputClass} value={form.approved_by} onChange={(event) => updateField('approved_by', event.target.value)} /></Field>
            <Field label="承認状態">
              <select className={inputClass} value={form.approval_status} onChange={(event) => updateField('approval_status', event.target.value)}>
                {approvalOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="承認日時"><input type="datetime-local" className={inputClass} value={form.approved_at} onChange={(event) => updateField('approved_at', event.target.value)} /></Field>
            <Field label="承認コメント" wide><textarea className={`${inputClass} min-h-24`} value={form.approval_comment} onChange={(event) => updateField('approval_comment', event.target.value)} /></Field>
          </div>
        </Section>

        <Section title="メモ" description="社内メモ、注意事項、次回改善点を残します。">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="社内メモ" wide><textarea className={`${inputClass} min-h-24`} value={form.internal_memo} onChange={(event) => updateField('internal_memo', event.target.value)} /></Field>
            <Field label="注意事項" wide><textarea className={`${inputClass} min-h-24`} value={form.caution_note} onChange={(event) => updateField('caution_note', event.target.value)} /></Field>
            <Field label="次回改善点" wide><textarea className={`${inputClass} min-h-24`} value={form.next_improvement} onChange={(event) => updateField('next_improvement', event.target.value)} /></Field>
          </div>
        </Section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-950">棚卸し明細</h3>
              <p className="mt-1 text-sm text-slate-500">実数量を入力すると差異数量が自動計算されます。</p>
            </div>
            <button type="button" onClick={addItem} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
              明細を追加
            </button>
          </div>

          {visibleItems.length === 0 ? (
            <p className="p-5 text-sm font-semibold text-slate-500">棚卸し明細はまだありません。</p>
          ) : (
            <div className="overflow-x-auto p-5">
              <table className="w-full min-w-[1280px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    <th className="px-3 py-3">対象種別</th>
                    <th className="px-3 py-3">管理番号</th>
                    <th className="px-3 py-3">品名</th>
                    <th className="px-3 py-3">保管場所</th>
                    <th className="px-3 py-3 text-right">システム数量</th>
                    <th className="px-3 py-3 text-right">実数量</th>
                    <th className="px-3 py-3 text-right">差異数量</th>
                    <th className="px-3 py-3">確認状態</th>
                    <th className="px-3 py-3">確認者</th>
                    <th className="px-3 py-3">メモ</th>
                    <th className="px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleItems.map((item) => {
                    const vehicle = item.vehicle_id ? vehiclesById[item.vehicle_id] : undefined;
                    const hasDifference = toNumber(item.difference_quantity) !== 0;
                    return (
                      <tr key={item.localId} className={hasDifference ? 'bg-red-50/40' : 'hover:bg-slate-50'}>
                        <td className="px-3 py-3">
                          <select className={compactInputClass} value={item.item_type} onChange={(event) => updateItem(item.localId, 'item_type', event.target.value)}>
                            <option value="vehicle">車両</option>
                            <option value="part">部品</option>
                            <option value="other">その他</option>
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <input className={compactInputClass} value={item.management_no} onChange={(event) => updateItem(item.localId, 'management_no', event.target.value)} />
                          {vehicle && <p className="mt-1 text-xs text-slate-500">車両: {displayValue(vehicle.registration_no)}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <input className={compactInputClass} value={item.item_name} onChange={(event) => updateItem(item.localId, 'item_name', event.target.value)} />
                          {vehicle && <p className="mt-1 text-xs text-slate-500">{displayValue(vehicle.maker)} {displayValue(vehicle.model_name)}</p>}
                        </td>
                        <td className="px-3 py-3"><input className={compactInputClass} value={item.location_name} onChange={(event) => updateItem(item.localId, 'location_name', event.target.value)} /></td>
                        <td className="px-3 py-3"><input type="number" className={`${compactInputClass} text-right`} value={item.system_quantity} onChange={(event) => updateItem(item.localId, 'system_quantity', event.target.value)} /></td>
                        <td className="px-3 py-3"><input type="number" className={`${compactInputClass} text-right`} value={item.actual_quantity} onChange={(event) => updateItem(item.localId, 'actual_quantity', event.target.value)} /></td>
                        <td className="px-3 py-3">
                          <input readOnly className={`${compactInputClass} bg-slate-50 text-right ${hasDifference ? 'font-bold text-red-700' : ''}`} value={item.difference_quantity || '-'} />
                        </td>
                        <td className="px-3 py-3">
                          <select className={compactInputClass} value={item.check_status} onChange={(event) => updateItem(item.localId, 'check_status', event.target.value)}>
                            {checkStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${getCheckStatusClass(item.check_status)}`}>
                            {optionLabel(checkStatusOptions, item.check_status)}
                          </span>
                        </td>
                        <td className="px-3 py-3"><input className={compactInputClass} value={item.checked_by} onChange={(event) => updateItem(item.localId, 'checked_by', event.target.value)} /></td>
                        <td className="px-3 py-3"><input className={compactInputClass} value={item.memo} onChange={(event) => updateItem(item.localId, 'memo', event.target.value)} /></td>
                        <td className="px-3 py-3">
                          <button type="button" onClick={() => removeItem(item.localId)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50">
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link href="/inventory-counts" className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-center text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
            一覧に戻る
          </Link>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {isSaving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
