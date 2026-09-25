import { Text } from 'react-native';
import { emptyWorkDetail, type WorkDetail } from '../../garage-link/src/lib/business/workDetails';
import { calculateLine, priceLabel, type TaxDisplayMode } from '../../garage-link/src/lib/business/money';
import { Button, Card, Choice, Field } from './v2/Ui';
import MobileMasterSelect from './MobileMasterSelect';
export function readWorkDetails(value: string): WorkDetail[] { try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; } catch { return []; } }
export default function MobileWorkDetails({ storeId, value, onChange, mode }: { storeId: string; value: string; onChange: (value: string) => void; mode: TaxDisplayMode }) {
  const rows = readWorkDetails(value);
  const update = (next: WorkDetail[]) => onChange(JSON.stringify(next));
  const change = (index: number, key: keyof WorkDetail, text: string) => update(rows.map((row, i) => i === index ? { ...row, [key]: text } : row));
  return <>{rows.map((row, index) => {
    let amount = '入力を確認してください'; try { amount = `${calculateLine(row, mode).gross_amount.toLocaleString('ja-JP')}円（税込・非課税項目を含む）`; } catch {}
    return <Card key={index} title={`作業 ${index + 1}`}><MobileMasterSelect storeId={storeId} kind="work_category" value={row.category} onChange={(text) => change(index, 'category', text)} /><Field label="作業内容" value={row.description} onChange={(text) => change(index, 'description', text)} /><Field label="数量" numeric value={String(row.quantity)} onChange={(text) => change(index, 'quantity', text)} /><MobileMasterSelect storeId={storeId} kind="unit" value={row.unit} onChange={(text) => change(index, 'unit', text)} /><Field label={priceLabel('単価', mode)} numeric value={String(row.unit_price)} onChange={(text) => change(index, 'unit_price', text)} /><Choice label="税区分" value={row.tax_category === 'taxable' ? String(row.tax_rate) : row.tax_category} options={[{value:'0.1',label:'課税10%'},{value:'0.08',label:'課税8%'},{value:'0',label:'課税0%'},{value:'exempt',label:'非課税'},{value:'out_of_scope',label:'税対象外'}]} onChange={(text) => update(rows.map((item, i) => i === index ? { ...item, tax_category: text === 'exempt' || text === 'out_of_scope' ? text : 'taxable', tax_rate: text === 'exempt' || text === 'out_of_scope' ? 0 : text } : item))} /><Field label="備考" value={row.note} onChange={(text) => change(index, 'note', text)} /><Text>{amount}</Text><Button title="行をコピー" secondary onPress={() => update([...rows.slice(0,index + 1), {...row}, ...rows.slice(index + 1)])} /><Button title="行を削除" secondary onPress={() => update(rows.filter((_, i) => i !== index))} /></Card>;
  })}<Button title="作業行を追加" secondary onPress={() => update([...rows, emptyWorkDetail()])} /></>;
}
