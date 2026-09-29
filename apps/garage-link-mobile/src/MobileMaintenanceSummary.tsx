import { Text } from 'react-native';
import { Card, Info } from './v2/Ui';
import { readWorkDetails } from './MobileWorkDetails';
import { maintenanceTotals, normalizedWorkDetails } from '../../garage-link/src/lib/business/workDetails';
import { calculateLine, type MoneyLine, type TaxDisplayMode } from '../../garage-link/src/lib/business/money';
function summary(draft:Record<string,string>,mode:TaxDisplayMode) {
 try {
  const work = normalizedWorkDetails(readWorkDetails(draft.work_details || '[]'));
  const parts = JSON.parse(draft._maintenanceParts || '[]') as {subtotal_amount:number;tax_rate:number}[];
  const partLines:MoneyLine[] = parts.map(row=>({quantity:1,unit_price:row.subtotal_amount,tax_rate:row.tax_rate,tax_category:row.tax_rate>0?'taxable':'out_of_scope'}));
  const totals = maintenanceTotals(work,mode,Number(draft.parts_amount || 0),Number(draft.inspection_amount || 0),Number(draft.legal_fee_amount || 0),Number(draft.additional_amount || 0),Number(draft.discount_amount || 0),partLines);
  return {labor:work.reduce((sum,row)=>sum+calculateLine(row,mode).input_amount,0),parts:parts.length ? parts.reduce((sum,row)=>sum+Number(row.subtotal_amount),0) : Number(draft.parts_amount || 0),totals};
 } catch { return null; }
}
export default function MobileMaintenanceSummary({draft,mode}:{draft:Record<string,string>;mode:TaxDisplayMode}) {
 const data=summary(draft,mode);
 if (!data) return <Text accessibilityRole="alert">作業明細・金額を確認してください。</Text>;
 const yen=(value:number)=>`${value.toLocaleString('ja-JP')}円`;
 return <Card title="金額集計"><Info label="工賃小計" value={yen(data.labor)}/><Info label="部品小計" value={yen(data.parts)}/><Info label="消費税" value={yen(data.totals.tax_amount)}/><Info label="値引き" value={yen(data.totals.discount_input_amount)}/><Info label="合計請求予定額" value={yen(data.totals.total_amount)}/></Card>;
}
