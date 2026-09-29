'use client';

import { calculateLine, priceLabel, type TaxDisplayMode, type TaxCategory } from '@/lib/business/money';
import { emptyWorkDetail, type WorkDetail } from '@/lib/business/workDetails';
import { masterOptions } from '@/lib/business/masters';
import { useBusinessSettings } from '@/lib/business/useBusinessSettings';

const input = 'w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';
export default function WorkDetailsEditor({ value, onChange, mode }: { value: WorkDetail[]; onChange: (rows: WorkDetail[]) => void; mode: TaxDisplayMode }) {
  const { entries } = useBusinessSettings();
  const change = (index: number, key: keyof WorkDetail, text: string) => onChange(value.map((row, position) => position === index ? { ...row, [key]: text } : row));
  return <section className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">作業明細</h2><button type="button" className="rounded-lg bg-blue-700 px-3 py-2 font-bold text-white" onClick={() => onChange([...value, emptyWorkDetail()])}>作業行を追加</button></div>
    <p className="text-xs text-slate-600">横にスクロールして全項目を編集できます。内容が空の行は保存しません。</p>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-50"><tr>{['作業分類', '作業内容', '数量', '単位', priceLabel('単価', mode), '金額（税を含む）', '税区分', '備考', '操作'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>
      {value.map((row, index) => {
        let amount = '入力を確認';
        try { amount = `${calculateLine(row, mode).gross_amount.toLocaleString('ja-JP')}円`; } catch { /* Invalid drafts stay editable. */ }
        return <tr key={index} className="border-t" aria-label={`作業${index + 1}`}>
          <td className="w-32 p-2"><select aria-label={`作業${index + 1}分類`} className={input} value={row.category} onChange={(event) => change(index, 'category', event.target.value)}><option value="">未設定</option>{masterOptions(entries, 'work_category', row.category).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>
          <td className="min-w-48 p-2"><input aria-label={`作業${index + 1}内容`} className={input} value={row.description} maxLength={500} onChange={(event) => change(index, 'description', event.target.value)} /></td>
          <td className="w-24 p-2"><input aria-label={`作業${index + 1}数量`} className={input} type="number" min="0.001" step="0.001" value={row.quantity} onChange={(event) => change(index, 'quantity', event.target.value)} /></td>
          <td className="w-24 p-2"><select aria-label={`作業${index + 1}単位`} className={input} value={row.unit} onChange={(event) => change(index, 'unit', event.target.value)}><option value="">未設定</option>{masterOptions(entries, 'unit', row.unit).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td>
          <td className="w-32 p-2"><input aria-label={`作業${index + 1}単価`} className={input} type="number" min="0" step="0.0001" value={row.unit_price} onChange={(event) => change(index, 'unit_price', event.target.value)} /></td>
          <td className="min-w-28 p-2 tabular-nums">{amount}</td>
          <td className="w-36 p-2"><select aria-label={`作業${index + 1}税区分`} className={input} value={row.tax_category === 'taxable' ? String(row.tax_rate) : row.tax_category} onChange={(event) => { const tax = event.target.value; onChange(value.map((item, position) => position === index ? { ...item, tax_category: tax === 'exempt' || tax === 'out_of_scope' ? tax as TaxCategory : 'taxable', tax_rate: tax === 'exempt' || tax === 'out_of_scope' ? 0 : tax } : item)); }}><option value="0.1">課税10%</option><option value="0.08">課税8%</option><option value="0">課税0%</option><option value="exempt">非課税</option><option value="out_of_scope">税対象外</option></select></td>
          <td className="min-w-40 p-2"><input aria-label={`作業${index + 1}備考`} className={input} value={row.note} maxLength={1000} onChange={(event) => change(index, 'note', event.target.value)} /></td>
          <td className="min-w-28 space-x-2 p-2"><button type="button" className="text-blue-700" onClick={() => onChange([...value.slice(0, index + 1), { ...row }, ...value.slice(index + 1)])}>コピー</button><button type="button" className="text-red-700" onClick={() => onChange(value.filter((_, position) => position !== index))}>削除</button></td>
        </tr>;
      })}
    </tbody></table></div>
  </section>;
}
