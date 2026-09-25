'use client';
import { priceLabel, type TaxDisplayMode } from '@/lib/business/money';

import type { PartLineItem } from '../../lib/business/documents';
export type { PartLineItem } from '../../lib/business/documents';

type Props = {
  mode?: TaxDisplayMode;
  items: PartLineItem[];
  onChange: (items: PartLineItem[]) => void;
};

const cellInput =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

function parseQty(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function PartLineItemsEditor({ items, onChange, mode = 'included' }: Props) {
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
    const qty = parseQty(item.quantity);
    const price = parseFloat(item.unit_price) || 0;
    return sum + Math.round(qty * price) - Number(item.line_discount_input_amount || 0);
  }, 0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed text-sm">
          <colgroup>
            <col />
            <col style={{ width: '80px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '150px' }} /><col style={{ width: '140px' }} /><col style={{ width: '64px' }} />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">部品・作業内容</th>
              <th className="px-4 py-3 text-right">数量</th>
              <th className="px-4 py-3 text-right">{priceLabel('単価', mode)}</th>
              <th className="px-4 py-3 text-right">小計</th>
              <th className="px-4 py-3">税区分</th><th className="px-4 py-3">単位・備考</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const qty = parseQty(item.quantity);
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
                      min="0"
                      step="0.001"
                      className={`${cellInput} text-right`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0" step="0.0001" value={item.unit_price}
                      onChange={(e) => update(item.localId, 'unit_price', e.target.value)}
                      className={`${cellInput} text-right`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">
                    <label className="block text-xs font-normal">行値引<input aria-label="行値引" type="number" min="0" step="1" value={item.line_discount_input_amount ?? '0'} onChange={e=>update(item.localId,'line_discount_input_amount',e.target.value)} className={cellInput}/></label>
                    {(Math.round(qty * price) - Number(item.line_discount_input_amount || 0)).toLocaleString('ja-JP')}円
                  </td>
                  <td className="px-4 py-3"><select aria-label="税区分" value={item.tax_category === 'exempt' || item.tax_category === 'out_of_scope' ? item.tax_category : item.tax_rate} onChange={e => { const value=e.target.value; onChange(items.map(row=>row.localId===item.localId?{...row,tax_category:value==='exempt'||value==='out_of_scope'?value:'taxable',tax_rate:value==='exempt'||value==='out_of_scope'?'0':value}:row)); }} className={cellInput}><option value="0.1">課税 10%</option><option value="0.08">課税 8%</option><option value="0">課税 0%</option><option value="exempt">非課税</option><option value="out_of_scope">税対象外</option></select></td>
                  <td className="px-4 py-3"><input aria-label="単位" placeholder="単位" value={item.unit ?? ''} onChange={e=>update(item.localId,'unit',e.target.value)} className={cellInput}/><input aria-label="明細備考" placeholder="備考" value={item.note ?? ''} onChange={e=>update(item.localId,'note',e.target.value)} className={cellInput}/></td>
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
