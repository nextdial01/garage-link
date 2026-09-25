import { maintenanceTotals, type WorkDetail } from '@/lib/business/workDetails';
import { calculateLine, priceLabel, type TaxDisplayMode, type MoneyLine } from '@/lib/business/money';
export default function MaintenanceSummary({ rows, mode, parts, inspection, legal, extra, discount, partLines }: { rows: WorkDetail[]; mode: TaxDisplayMode; parts: number; inspection: number; legal: number; extra: number; discount: number; partLines?: MoneyLine[] }) {
  let amounts: [string, number][] | null = null;
  try {
    const result = maintenanceTotals(rows, mode, parts, inspection, legal, extra, discount, partLines);
    const labor = rows.filter((row) => row.description.trim()).reduce((sum,row) => sum + calculateLine(row,mode).input_amount,0);
    amounts = [[priceLabel('工賃小計',mode),labor],[priceLabel('部品小計',mode),parts],['消費税',result.tax_amount],[priceLabel('値引き',mode),discount],['合計請求予定額',result.total_amount]];
  } catch { /* Draft values may be incomplete while typing. */ }
  if (!amounts) return <p role="alert" className="text-sm text-red-700">数量・単価・値引きを確認してください。</p>;
  return <dl className="grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">{amounts.map(([label,value]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-bold"><output aria-label={label}>{value.toLocaleString('ja-JP')}円</output></dd></div>)}</dl>;
}
