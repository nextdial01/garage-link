'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type PickedPart = {
  id: string;
  part_no: string | null;
  name: string;
  unit_price: number | null;
  cost_price: number | null;
  stock: number;
};

type PartRow = {
  id: string;
  part_no: string | null;
  name: string;
  category: string | null;
  stock: number;
  unit_price: number | null;
  last_purchase_price: number | null;
  status: string;
  supplier_name: string | null;
  deleted_at: string | null;
};

type Props = {
  storeId: string;
  onSelect: (part: PickedPart) => void;
  onAddManual: () => void;
  onClose: () => void;
};

function stockBadgeClass(status: string, stock: number) {
  if (stock <= 0 || status === '発注待ち' || status === '廃番')
    return 'bg-red-50 text-red-700 ring-red-600/20';
  if (status === '在庫少')
    return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
  return 'bg-green-50 text-green-700 ring-green-600/20';
}

export default function PartPickerModal({ storeId, onSelect, onAddManual, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [parts, setParts] = useState<PartRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fetchParts = useCallback(async (q: string) => {
    if (!storeId) return;
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from<PartRow>('repair_parts')
        .select('id, part_no, name, category, stock, unit_price, last_purchase_price, status, supplier_name, deleted_at')
        .eq('store_id', storeId)
        .order('name', { ascending: true });

      const lower = q.trim().toLowerCase();
      setParts(
        (data ?? [])
          .filter((p: PartRow) => {
            if (p.deleted_at || p.status === '廃番') return false;
            if (!lower) return true;
            return (
              p.name.toLowerCase().includes(lower) ||
              (p.part_no ?? '').toLowerCase().includes(lower) ||
              (p.category ?? '').toLowerCase().includes(lower)
            );
          })
          .slice(0, 50)
      );
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchParts(query), 200);
    return () => clearTimeout(timer);
  }, [query, fetchParts]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">部品マスタから選択</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="部品名・部品番号・カテゴリで検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="px-5 py-4 text-sm text-slate-500">検索中...</p>
          ) : parts.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">
              {query.trim() ? '条件に一致する部品がありません' : '登録済みの部品がありません'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {parts.map((part) => (
                <li key={part.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect({
                        id: part.id,
                        part_no: part.part_no,
                        name: part.name,
                        unit_price: part.unit_price,
                        cost_price: part.last_purchase_price,
                        stock: part.stock,
                      })
                    }
                    className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-blue-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-950">{part.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[part.part_no, part.category, part.supplier_name]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-950">
                        {part.unit_price !== null
                          ? `${part.unit_price.toLocaleString('ja-JP')}円`
                          : '-'}
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${stockBadgeClass(
                          part.status,
                          part.stock
                        )}`}
                      >
                        在庫 {part.stock}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onAddManual}
            className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            + マスタ未登録の部品を手動で追加
          </button>
        </div>
      </div>
    </div>
  );
}
