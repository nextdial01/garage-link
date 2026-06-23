'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type RepairPartRow = {
  id: string;
  part_no: string | null;
  name: string;
  category: string | null;
  stock: number;
  unit_price: number | null;
  low_stock_threshold: number;
  reorder_point: number | null;
  status: string;
  supplier_name: string | null;
  location_shelf: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

function getStatusClass(status: string) {
  switch (status) {
    case '在庫あり':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case '在庫少':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '発注待ち':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    case '廃番':
      return 'bg-slate-100 text-slate-500 ring-slate-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function formatPrice(value: number | null) {
  if (value === null) return '-';
  return `${value.toLocaleString('ja-JP')}円`;
}

export default function PartsPage() {
  const [parts, setParts] = useState<RepairPartRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    async function loadParts() {
      setIsLoading(true);
      setErrorMessage('');
      try {
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

        const { data, error } = await supabase
          .from<RepairPartRow>('repair_parts')
          .select('id, part_no, name, category, stock, unit_price, low_stock_threshold, reorder_point, status, supplier_name, location_shelf, updated_at, deleted_at, is_archived')
          .eq('store_id', member.store_id)
          .order('name', { ascending: true });
        if (error) throw new Error(error.message);

        setParts((data ?? []).filter((p) => !p.deleted_at && p.is_archived !== true));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '部品一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }
    void loadParts();
  }, []);

  const stats = useMemo(() => {
    const lowStock = parts.filter((p) => p.status === '在庫少').length;
    const orderNeeded = parts.filter((p) => p.status === '発注待ち').length;
    return [
      { label: '部品点数', value: parts.length },
      { label: '在庫少', value: lowStock },
      { label: '発注待ち', value: orderNeeded },
      { label: '廃番', value: parts.filter((p) => p.status === '廃番').length },
    ];
  }, [parts]);

  const filteredParts = useMemo(() => {
    let result = parts;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.part_no ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q) ||
          (p.supplier_name ?? '').toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    return result;
  }, [parts, searchQuery, statusFilter]);

  return (
    <AppShell
      activeLabel="部品管理"
      title="部品管理"
      description="整備用部品の在庫を一元管理します"
      actionButton={
        <Link
          href="/parts/new"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          部品を登録
        </Link>
      }
    >
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold">部品一覧</h3>
            <p className="mt-1 text-sm text-slate-500">
              {searchQuery || statusFilter
                ? `${filteredParts.length}件 / 全${parts.length}件`
                : `全${parts.length}件`}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              placeholder="部品名・部品番号・カテゴリで検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 sm:w-72"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">全ステータス</option>
              <option value="在庫あり">在庫あり</option>
              <option value="在庫少">在庫少</option>
              <option value="発注待ち">発注待ち</option>
              <option value="廃番">廃番</option>
            </select>
          </div>
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : parts.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">まだ部品が登録されていません</p>
        ) : filteredParts.length === 0 ? (
          <p className="p-5 text-sm font-semibold text-slate-500">条件に一致する部品がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">部品名</th>
                  <th className="px-5 py-4">部品番号</th>
                  <th className="px-5 py-4 text-right">在庫数</th>
                  <th className="px-5 py-4 text-right">発注点</th>
                  <th className="px-5 py-4 text-right">単価</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">仕入先</th>
                  <th className="px-5 py-4">保管場所</th>
                  <th className="px-5 py-4">更新日</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParts.map((part) => {
                  const isLowOrOut = part.status === '在庫少' || part.status === '発注待ち' || part.stock <= 0;
                  return (
                    <tr
                      key={part.id}
                      className={`hover:bg-blue-50/50 ${isLowOrOut ? 'bg-red-50/30' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-2">
                          {part.status === '発注待ち' || part.stock <= 0 ? (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
                          ) : part.status === '在庫少' ? (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-yellow-400" />
                          ) : (
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
                          )}
                          <span className="font-semibold text-slate-950">{part.name}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{part.part_no ?? '-'}</td>
                      <td className="px-5 py-4 text-right">
                        <span className={`font-bold ${part.stock <= 0 ? 'text-red-600' : part.status === '在庫少' ? 'text-yellow-600' : 'text-slate-950'}`}>
                          {part.stock.toLocaleString('ja-JP')}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-slate-500">
                        {part.reorder_point !== null && part.reorder_point !== undefined && part.reorder_point > 0
                          ? part.reorder_point.toLocaleString('ja-JP')
                          : '-'}
                      </td>
                      <td className="px-5 py-4 text-right">{formatPrice(part.unit_price)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(part.status)}`}>
                          {part.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">{part.supplier_name ?? '-'}</td>
                      <td className="px-5 py-4 text-slate-500">{part.location_shelf ?? '-'}</td>
                      <td className="px-5 py-4 text-xs text-slate-400">
                        {part.updated_at ? part.updated_at.slice(0, 10) : '-'}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/parts/${part.id}`}
                          className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
