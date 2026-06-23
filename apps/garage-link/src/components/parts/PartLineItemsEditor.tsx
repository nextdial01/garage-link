'use client';

export type PartLineItem = {
  localId: string;
  part_id: string | null;
  part_no: string;
  name: string;
  quantity: string;
  unit_price: string;
  cost_price: string;
  tax_rate: string;
};

type Props = {
  items: PartLineItem[];
  onChange: (items: PartLineItem[]) => void;
};

const cellInput =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

export default function PartLineItemsEditor({ items, onChange }: Props) {
  function update(localId: string, field: keyof PartLineItem, value: string) {
    onChange(items.map((item) => (item.localId === localId ? { ...item, [field]: value } : item)));
  }

  function remove(localId: string) {
    onChange(items.filter((item) => item.localId !== localId));
  }

  if (items.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-400">まだ部品・作業明細がありません</p>;
  }

  const subtotal = items.reduce((sum, item) => {
    const qty = parseInt(item.quantity, 10) || 1;
    const price = parseFloat(item.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <colgroup>
            <col />
            <col style={{ width: '80px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '64px' }} />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">部品名</th>
              <th className="px-4 py-3 text-right">数量</th>
              <th className="px-4 py-3 text-right">単価（円）</th>
              <th className="px-4 py-3 text-right">小計</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const qty = parseInt(item.quantity, 10) || 1;
              const price = parseFloat(item.unit_price) || 0;
              return (
                <tr key={item.localId}>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => update(item.localId, 'name', e.target.value)}
                      placeholder="部品名"
                      className={cellInput}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => update(item.localId, 'quantity', e.target.value)}
                      className={`${cellInput} text-right`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => update(item.localId, 'unit_price', e.target.value)}
                      className={`${cellInput} text-right`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">
                    {(qty * price).toLocaleString('ja-JP')}円
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => remove(item.localId)}
                      className="w-full rounded-lg px-2 py-1 text-xs text-red-500 transition hover:bg-red-50"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {subtotal > 0 && (
          <div className="flex justify-end px-5 py-3">
            <p className="text-sm font-bold text-slate-700">
              部品小計:{' '}
              <span className="font-bold text-slate-950">
                {subtotal.toLocaleString('ja-JP')}円
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
