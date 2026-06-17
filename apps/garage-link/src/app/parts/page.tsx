'use client';

import AppShell from '@/components/AppShell';

const parts = [
  {
    id: '1',
    partName: 'エンジンオイル (4L)',
    partNumber: 'OIL-001',
    stock: '45',
    status: '在庫あり',
    usage: '12',
  },
  {
    id: '2',
    partName: 'エアフィルター',
    partNumber: 'AIR-001',
    stock: '8',
    status: '在庫少',
    usage: '5',
  },
  {
    id: '3',
    partName: 'バッテリー (12V)',
    partNumber: 'BAT-001',
    stock: '0',
    status: '発注待ち',
    usage: '3',
  },
];

function getStatusClass(status: string) {
  switch (status) {
    case '在庫あり':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case '在庫少':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '発注待ち':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

export default function PartsPage() {
  return (
    <AppShell
      activeLabel="部品管理"
      title="部品管理"
      description="整備用部品の在庫を一元管理します"
      actionButton={
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
          部品を登録
        </button>
      }
    >
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">部品点数</p>
          <p className="mt-3 text-3xl font-bold">152</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">在庫少</p>
          <p className="mt-3 text-3xl font-bold">7</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">発注待ち</p>
          <p className="mt-3 text-3xl font-bold">3</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">今月使用</p>
          <p className="mt-3 text-3xl font-bold">24</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-base font-bold">部品一覧</h3>
          <p className="mt-1 text-sm text-slate-500">
            登録済みの部品を一覧で確認できます
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">部品名</th>
                <th className="px-5 py-4">部品番号</th>
                <th className="px-5 py-4">在庫数</th>
                <th className="px-5 py-4">ステータス</th>
                <th className="px-5 py-4">今月使用</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {parts.map((part) => (
                <tr key={part.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 font-semibold">{part.partName}</td>
                  <td className="px-5 py-4 text-slate-500">{part.partNumber}</td>
                  <td className="px-5 py-4">{part.stock}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${getStatusClass(
                        part.status
                      )}`}
                    >
                      {part.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">{part.usage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        ※ 現在は仮データです。
      </p>
    </AppShell>
  );
}
