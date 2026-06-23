'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type RepairPartInsert = {
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

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

export default function NewPartPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [form, setForm] = useState({
    part_no: '',
    name: '',
    category: '',
    stock: '0',
    unit_price: '',
    low_stock_threshold: '5',
    status: '在庫あり',
    supplier_name: '',
    memo: '',
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      setErrorMessage('部品名は必須です。');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage('');

      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) {
        throw new Error(userError?.message ?? 'ログイン情報を取得できませんでした。');
      }

      const { data: member, error: memberError } = await supabase
        .from<StoreMemberRow>('store_members')
        .select('store_id')
        .eq('user_id', userData.user.id)
        .single();
      if (memberError || !member?.store_id) {
        throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
      }

      const payload: RepairPartInsert = {
        store_id: member.store_id,
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

      const { error } = await supabase.from('repair_parts').insert(payload);
      if (error) throw new Error(error.message);

      router.push('/parts');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '部品の登録に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell
      activeLabel="部品管理"
      title="部品登録"
      description="新しい部品を登録します"
      actionButton={
        <Link
          href="/parts"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          一覧へ戻る
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl">
        {errorMessage && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">基本情報</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-bold text-slate-700">部品名 <span className="text-red-500">必須</span></span>
                <input type="text" className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="例: エンジンオイル (4L)" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">部品番号</span>
                <input type="text" className={inputClass} value={form.part_no} onChange={(e) => update('part_no', e.target.value)} placeholder="例: OIL-001" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">カテゴリ</span>
                <input type="text" className={inputClass} value={form.category} onChange={(e) => update('category', e.target.value)} placeholder="例: オイル類 / フィルター" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">仕入先</span>
                <input type="text" className={inputClass} value={form.supplier_name} onChange={(e) => update('supplier_name', e.target.value)} placeholder="例: ○○商社" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">単価（円）</span>
                <input type="number" min="0" step="1" className={inputClass} value={form.unit_price} onChange={(e) => update('unit_price', e.target.value)} placeholder="例: 1500" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">在庫情報</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">現在庫数</span>
                <input type="number" min="0" step="1" className={inputClass} value={form.stock} onChange={(e) => update('stock', e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">在庫少アラート閾値</span>
                <input type="number" min="0" step="1" className={inputClass} value={form.low_stock_threshold} onChange={(e) => update('low_stock_threshold', e.target.value)} placeholder="5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">ステータス</span>
                <select className={inputClass} value={form.status} onChange={(e) => update('status', e.target.value)}>
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
            <textarea
              className={`${inputClass} min-h-28`}
              value={form.memo}
              onChange={(e) => update('memo', e.target.value)}
              placeholder="保管場所・注意事項・注文先URLなど"
            />
          </section>

          <div className="flex justify-end gap-3">
            <Link
              href="/parts"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? '登録中...' : '登録する'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
