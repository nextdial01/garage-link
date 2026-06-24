'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import PartPickerModal, { type PickedPart } from './PartPickerModal';

type JobPartRow = {
  id: string;
  store_id: string;
  job_id: string;
  part_id: string | null;
  part_no: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  cost_price: number | null;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  subtotal_amount: number;
  work_memo: string | null;
  stock_adjusted: boolean;
  stock_adjusted_at: string | null;
};

type AdjustResult = {
  ok: boolean;
  error?: string;
  current_stock?: number;
  new_stock?: number;
  delta?: number;
};

type EditState = {
  quantity: string;
  unit_price: string;
  cost_price: string;
  discount_amount: string;
  tax_rate: string;
  work_memo: string;
};

type Props = {
  jobId: string;
  storeId: string;
  canEdit: boolean;
  onTotalChange?: (total: number) => void;
};

function computeSubtotal(quantity: number, unitPrice: number, discountAmount: number): number {
  return Math.max(quantity * unitPrice - discountAmount, 0);
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString('ja-JP')}円`;
}

const cellClass = 'px-3 py-2 text-sm';
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

export default function JobPartsPanel({ jobId, storeId, canEdit, onTotalChange }: Props) {
  const [parts, setParts] = useState<JobPartRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const partsTotal = parts.reduce((sum, p) => sum + p.subtotal_amount, 0);

  // onTotalChange を ref で逃がして、親の毎レンダーごとの新規アロー関数で
  // useEffect が再実行されないようにする。
  const onTotalChangeRef = useRef(onTotalChange);
  useEffect(() => {
    onTotalChangeRef.current = onTotalChange;
  }, [onTotalChange]);

  const notifyTotal = useCallback((rows: JobPartRow[]) => {
    const total = rows.reduce((sum, p) => sum + p.subtotal_amount, 0);
    onTotalChangeRef.current?.(total);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadParts() {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from<JobPartRow>('maintenance_job_parts')
          .select(
            'id, store_id, job_id, part_id, part_no, name, quantity, unit_price, cost_price, discount_amount, tax_rate, tax_amount, subtotal_amount, work_memo, stock_adjusted, stock_adjusted_at'
          )
          .eq('job_id', jobId)
          .eq('store_id', storeId)
          .order('created_at', { ascending: true });
        if (cancelled) return;
        if (error) throw error;
        const rows = data ?? [];
        setParts(rows);
        notifyTotal(rows);
      } catch {
        if (!cancelled) setErrorMessage('使用部品の読み込みに失敗しました。');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadParts();
    return () => {
      cancelled = true;
    };
  }, [jobId, storeId, notifyTotal]);

  function openEditRow(part: JobPartRow) {
    setEditingId(part.id);
    setEditState({
      quantity: String(part.quantity),
      unit_price: String(part.unit_price),
      cost_price: part.cost_price !== null ? String(part.cost_price) : '',
      discount_amount: String(part.discount_amount),
      tax_rate: String(part.tax_rate),
      work_memo: part.work_memo ?? '',
    });
  }

  async function handleAddFromPicker(picked: PickedPart) {
    setShowPicker(false);
    await insertPart({
      part_id: picked.id,
      part_no: picked.part_no,
      name: picked.name,
      unit_price: picked.unit_price ?? 0,
      cost_price: picked.cost_price ?? null,
    });
  }

  async function handleAddManual() {
    setShowPicker(false);
    await insertPart({ part_id: null, part_no: null, name: '新規部品', unit_price: 0, cost_price: null });
  }

  async function insertPart(fields: {
    part_id: string | null;
    part_no: string | null;
    name: string;
    unit_price: number;
    cost_price: number | null;
  }) {
    setErrorMessage('');
    try {
      const supabase = createClient();
      const subtotal = computeSubtotal(1, fields.unit_price, 0);
      const { data, error } = await supabase
        .from<JobPartRow>('maintenance_job_parts')
        .insert({
          store_id: storeId,
          job_id: jobId,
          part_id: fields.part_id,
          part_no: fields.part_no,
          name: fields.name,
          quantity: 1,
          unit_price: fields.unit_price,
          cost_price: fields.cost_price,
          discount_amount: 0,
          tax_rate: 0.1,
          tax_amount: 0,
          subtotal_amount: subtotal,
          work_memo: null,
          stock_adjusted: false,
        })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('追加に失敗しました。');
      const newParts = [...parts, data];
      setParts(newParts);
      notifyTotal(newParts);
      openEditRow(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '部品の追加に失敗しました。');
    }
  }

  async function handleSaveEdit(partId: string) {
    if (!editState) return;
    setErrorMessage('');
    const qty = Math.max(parseInt(editState.quantity, 10) || 1, 1);
    const unitPrice = parseFloat(editState.unit_price) || 0;
    const costPrice = editState.cost_price.trim() ? parseFloat(editState.cost_price) : null;
    const discountAmount = parseFloat(editState.discount_amount) || 0;
    const subtotal = computeSubtotal(qty, unitPrice, discountAmount);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('maintenance_job_parts')
        .update({
          quantity: qty,
          unit_price: unitPrice,
          cost_price: costPrice,
          discount_amount: discountAmount,
          tax_rate: parseFloat(editState.tax_rate) || 0.1,
          subtotal_amount: subtotal,
          work_memo: editState.work_memo.trim() || null,
        })
        .eq('id', partId)
        .eq('store_id', storeId);
      if (error) throw error;
      const updatedParts = parts.map((p) =>
        p.id === partId
          ? {
              ...p,
              quantity: qty,
              unit_price: unitPrice,
              cost_price: costPrice,
              discount_amount: discountAmount,
              subtotal_amount: subtotal,
              work_memo: editState.work_memo.trim() || null,
            }
          : p,
      );
      setParts(updatedParts);
      notifyTotal(updatedParts);
      setEditingId(null);
      setEditState(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '更新に失敗しました。');
    }
  }

  async function handleConfirmStock(part: JobPartRow) {
    if (!part.part_id || part.stock_adjusted) return;
    setErrorMessage('');
    setBusyIds((prev) => new Set(prev).add(part.id));
    try {
      const supabase = createClient();
      const result = await supabase.rpc('adjust_repair_part_stock', {
        p_part_id: part.part_id,
        p_store_id: storeId,
        p_delta: -part.quantity,
      });
      const resultData = result.data as AdjustResult | null;
      if (result.error) throw result.error;
      if (!resultData?.ok) {
        const errMsg = resultData?.error ?? '在庫の確定に失敗しました。';
        if (resultData?.current_stock !== undefined) {
          throw new Error(
            `${errMsg}（現在庫: ${resultData.current_stock}）`,
          );
        }
        throw new Error(errMsg);
      }
      const { error: updateError } = await supabase
        .from('maintenance_job_parts')
        .update({ stock_adjusted: true, stock_adjusted_at: new Date().toISOString() })
        .eq('id', part.id)
        .eq('store_id', storeId);
      if (updateError) throw updateError;
      setParts((prev) =>
        prev.map((p) =>
          p.id === part.id ? { ...p, stock_adjusted: true, stock_adjusted_at: new Date().toISOString() } : p,
        ),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '在庫確定に失敗しました。');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(part.id);
        return next;
      });
    }
  }

  async function handleDeletePart(part: JobPartRow) {
    setErrorMessage('');
    setBusyIds((prev) => new Set(prev).add(part.id));
    try {
      const supabase = createClient();

      if (part.stock_adjusted && part.part_id) {
        const result = await supabase.rpc('adjust_repair_part_stock', {
          p_part_id: part.part_id,
          p_store_id: storeId,
          p_delta: part.quantity,
        });
        const resultData = result.data as AdjustResult | null;
        if (result.error) throw result.error;
        if (!resultData?.ok) throw new Error(resultData?.error ?? '在庫の返却に失敗しました。');
      }

      const { error } = await supabase
        .from('maintenance_job_parts')
        .delete()
        .eq('id', part.id)
        .eq('store_id', storeId);
      if (error) throw error;
      const newParts = parts.filter((p) => p.id !== part.id);
      setParts(newParts);
      notifyTotal(newParts);
      if (editingId === part.id) {
        setEditingId(null);
        setEditState(null);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '削除に失敗しました。');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(part.id);
        return next;
      });
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
        <div>
          <h3 className="text-lg font-bold text-slate-950">使用部品明細</h3>
          <p className="mt-1 text-sm text-slate-500">
            部品合計:{' '}
            <span className="font-black text-slate-950">{formatPrice(partsTotal)}</span>
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            部品を追加
          </button>
        )}
      </div>

      {errorMessage && (
        <p className="m-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      )}

      {isLoading ? (
        <p className="px-5 py-4 text-sm text-slate-500">読み込み中...</p>
      ) : parts.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm font-semibold text-slate-400">
          使用部品がまだ登録されていません
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">部品名</th>
                <th className="px-3 py-3 text-right">数量</th>
                <th className="px-3 py-3 text-right">単価</th>
                <th className="px-3 py-3 text-right">値引</th>
                <th className="px-3 py-3 text-right">小計</th>
                <th className="px-3 py-3">在庫</th>
                <th className="px-3 py-3">作業メモ</th>
                {canEdit && <th className="px-3 py-3">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parts.map((part) => {
                const isEditing = editingId === part.id;
                const isBusy = busyIds.has(part.id);

                if (isEditing && editState) {
                  return (
                    <tr key={part.id} className="bg-blue-50/40">
                      <td className={cellClass}>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700">{part.name}</p>
                          {part.part_no && (
                            <p className="text-xs text-slate-400">{part.part_no}</p>
                          )}
                        </div>
                      </td>
                      <td className={cellClass}>
                        <input
                          type="number"
                          min="1"
                          className={`${inputClass} w-20 text-right`}
                          value={editState.quantity}
                          onChange={(e) => setEditState((s) => s && ({ ...s, quantity: e.target.value }))}
                        />
                      </td>
                      <td className={cellClass}>
                        <input
                          type="number"
                          min="0"
                          className={`${inputClass} w-28 text-right`}
                          value={editState.unit_price}
                          onChange={(e) => setEditState((s) => s && ({ ...s, unit_price: e.target.value }))}
                        />
                      </td>
                      <td className={cellClass}>
                        <input
                          type="number"
                          min="0"
                          className={`${inputClass} w-24 text-right`}
                          value={editState.discount_amount}
                          onChange={(e) => setEditState((s) => s && ({ ...s, discount_amount: e.target.value }))}
                        />
                      </td>
                      <td className={`${cellClass} text-right font-bold`}>
                        {formatPrice(
                          computeSubtotal(
                            parseInt(editState.quantity) || 1,
                            parseFloat(editState.unit_price) || 0,
                            parseFloat(editState.discount_amount) || 0,
                          ),
                        )}
                      </td>
                      <td className={cellClass}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            part.stock_adjusted
                              ? 'bg-green-50 text-green-700 ring-green-600/20'
                              : 'bg-slate-50 text-slate-700 ring-slate-600/20'
                          }`}
                        >
                          {part.stock_adjusted ? '確定済み' : '未確定'}
                        </span>
                      </td>
                      <td className={cellClass}>
                        <input
                          type="text"
                          className={`${inputClass} w-40`}
                          value={editState.work_memo}
                          onChange={(e) => setEditState((s) => s && ({ ...s, work_memo: e.target.value }))}
                          placeholder="メモ"
                        />
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit(part.id)}
                            className="rounded-lg border border-blue-600 bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setEditState(null); }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            取消
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={part.id} className="hover:bg-blue-50/30">
                    <td className={cellClass}>
                      <p className="font-semibold text-slate-950">{part.name}</p>
                      {part.part_no && (
                        <p className="text-xs text-slate-400">{part.part_no}</p>
                      )}
                    </td>
                    <td className={`${cellClass} text-right`}>{part.quantity}</td>
                    <td className={`${cellClass} text-right`}>{formatPrice(part.unit_price)}</td>
                    <td className={`${cellClass} text-right`}>
                      {part.discount_amount > 0 ? `-${formatPrice(part.discount_amount)}` : '-'}
                    </td>
                    <td className={`${cellClass} text-right font-bold`}>
                      {formatPrice(part.subtotal_amount)}
                    </td>
                    <td className={cellClass}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                          part.stock_adjusted
                            ? 'bg-green-50 text-green-700 ring-green-600/20'
                            : part.part_id
                            ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20'
                            : 'bg-slate-50 text-slate-600 ring-slate-600/20'
                        }`}
                      >
                        {part.stock_adjusted ? '確定済み' : part.part_id ? '未確定' : '手動'}
                      </span>
                    </td>
                    <td className={`${cellClass} text-slate-500`}>
                      {part.work_memo ?? '-'}
                    </td>
                    {canEdit && (
                      <td className={`${cellClass} whitespace-nowrap`}>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditRow(part)}
                            disabled={isBusy}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            編集
                          </button>
                          {part.part_id && !part.stock_adjusted && (
                            <button
                              type="button"
                              onClick={() => void handleConfirmStock(part)}
                              disabled={isBusy}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                            >
                              {isBusy ? '...' : '在庫確定'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDeletePart(part)}
                            disabled={isBusy}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                          >
                            {isBusy ? '...' : part.stock_adjusted ? '削除(在庫返却)' : '削除'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showPicker && (
        <PartPickerModal
          storeId={storeId}
          onSelect={(picked) => void handleAddFromPicker(picked)}
          onAddManual={() => void handleAddManual()}
          onClose={() => setShowPicker(false)}
        />
      )}
    </section>
  );
}
