'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import SoftDeleteButton from '@/components/SoftDeleteButton';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string; role: string | null };

type RepairPartRow = {
  id: string;
  store_id: string;
  part_no: string | null;
  name: string;
  category: string | null;
  stock: number;
  unit_price: number | null;
  low_stock_threshold: number;
  status: string;
  supplier_name: string | null;
  memo: string | null;
};

type PartForm = {
  part_no: string;
  name: string;
  category: string;
  stock: string;
  unit_price: string;
  low_stock_threshold: string;
  status: string;
  supplier_name: string;
  memo: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const emptyForm: PartForm = {
  part_no: '', name: '', category: '', stock: '0', unit_price: '',
  low_stock_threshold: '5', status: '在庫あり', supplier_name: '', memo: '',
};

function toPartForm(row: RepairPartRow): PartForm {
  return {
    part_no: row.part_no ?? '',
    name: row.name,
    category: row.category ?? '',
    stock: String(row.stock),
    unit_price: row.unit_price !== null ? String(row.unit_price) : '',
    low_stock_threshold: String(row.low_stock_threshold),
    status: row.status,
    supplier_name: row.supplier_name ?? '',
    memo: row.memo ?? '',
  };
}

function getStatusClass(status: string) {
  switch (status) {
    case '在庫あり': return 'bg-green-50 text-green-700 ring-green-600/20';
    case '在庫少': return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '発注待ち': return 'bg-red-50 text-red-700 ring-red-600/20';
    case '廃番': return 'bg-slate-100 text-slate-500 ring-slate-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

export default function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [part, setPart] = useState<RepairPartRow | null>(null);
  const [form, setForm] = useState<PartForm>(emptyForm);
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    async function loadPart() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
        setStoreId(member.store_id);
        setRole(member.role ?? '');

        const { data, error } = await supabase
          .from<RepairPartRow>('repair_parts')
          .select('id, store_id, part_no, name, category, stock, unit_price, low_stock_threshold, status, supplier_name, memo')
          .eq('id', id)
          .eq('store_id', member.store_id)
          .single();
        if (error || !data) throw new Error(error?.message ?? '部品が見つかりません。');

        setPart(data);
        setForm(toPartForm(data));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '部品の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }
    void loadPart();
  }, [id]);

  function update(key: keyof PartForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccessMessage('');
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setErrorMessage('部品名は必須です。');
      return;
    }
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const supabase = createClient();
      const { error } = await supabase
        .from('repair_parts')
        .update({
          part_no: form.part_no.trim() || null,
          name: form.name.trim(),
          category: form.category.trim() || null,
          stock: parseInt(form.stock, 10) || 0,
          unit_price: form.unit_price.trim() ? parseFloat(form.unit_price) : null,
          low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 5,
          status: form.status,
          supplier_name: form.supplier_name.trim() || null,
          memo: form.memo.trim() || null,
        })
        .eq('id', id)
        .eq('store_id', storeId);
      if (error) throw new Error(error.message);

      const updated: RepairPartRow = {
        ...part!,
        part_no: form.part_no.trim() || null,
        name: form.name.trim(),
        category: form.category.trim() || null,
        stock: parseInt(form.stock, 10) || 0,
        unit_price: form.unit_price.trim() ? parseFloat(form.unit_price) : null,
        low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 5,
        status: form.status,
        supplier_name: form.supplier_name.trim() || null,
        memo: form.memo.trim() || null,
      };
      setPart(updated);
      setSuccessMessage('保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  const canEdit = role === 'owner' || role === 'admin' || role === 'implementer' || role === 'staff';

  return (
    <AppShell
      activeLabel="部品管理"
      title={isLoading ? '部品詳細' : (part?.name ?? '部品詳細')}
      description="部品の詳細確認・在庫・情報の編集を行います"
      actionButton={
        <Link
          href="/parts"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          一覧へ戻る
        </Link>
      }
    >
      {isLoading ? (
        <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">読み込み中...</p>
      ) : !part ? (
        <p className="rounded-xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {errorMessage || '部品が見つかりません。'}
        </p>
      ) : (
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-inset ${getStatusClass(part.status)}`}>
              {part.status}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              現在庫: <span className="font-black text-slate-950">{part.stock.toLocaleString('ja-JP')}</span>
            </span>
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>
          )}
          {successMessage && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-950">基本情報</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-bold text-slate-700">部品名 <span className="text-red-500">必須</span></span>
                  <input type="text" className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} required disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">部品番号</span>
                  <input type="text" className={inputClass} value={form.part_no} onChange={(e) => update('part_no', e.target.value)} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">カテゴリ</span>
                  <input type="text" className={inputClass} value={form.category} onChange={(e) => update('category', e.target.value)} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">仕入先</span>
                  <input type="text" className={inputClass} value={form.supplier_name} onChange={(e) => update('supplier_name', e.target.value)} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">単価（円）</span>
                  <input type="number" min="0" step="1" className={inputClass} value={form.unit_price} onChange={(e) => update('unit_price', e.target.value)} disabled={!canEdit} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-950">在庫情報</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">現在庫数</span>
                  <input type="number" min="0" step="1" className={inputClass} value={form.stock} onChange={(e) => update('stock', e.target.value)} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">在庫少アラート閾値</span>
                  <input type="number" min="0" step="1" className={inputClass} value={form.low_stock_threshold} onChange={(e) => update('low_stock_threshold', e.target.value)} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">ステータス</span>
                  <select className={inputClass} value={form.status} onChange={(e) => update('status', e.target.value)} disabled={!canEdit}>
                    <option value="在庫あり">在庫あり</option>
                    <option value="在庫少">在庫少</option>
                    <option value="発注待ち">発注待ち</option>
                    <option value="廃番">廃番</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-950">備考</h2>
              <textarea className={`${inputClass} min-h-28`} value={form.memo} onChange={(e) => update('memo', e.target.value)} disabled={!canEdit} />
            </section>

            {canEdit && (
              <div className="flex items-center justify-between">
                <SoftDeleteButton
                  tableName="repair_parts"
                  rowId={id}
                  storeId={storeId}
                  targetType="repair_part"
                  targetLabel={part?.name ?? '部品'}
                  redirectHref="/parts"
                  label="部品を削除"
                />
                <div className="flex gap-3">
                  <Link href="/parts" className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                    キャンセル
                  </Link>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSaving ? '保存中...' : '保存する'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </AppShell>
  );
}
