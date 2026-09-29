import { calculateDocument, type TaxCategory, type TaxDisplayMode } from './money';
export type PartLineItem = {
  line_discount_input_amount?: string;
  item_type?: string;
  unit?: string;
  note?: string;
  tax_category?: TaxCategory;
  localId: string;
  part_id: string | null;
  part_no: string;
  name: string;
  quantity: string;
  unit_price: string;
  cost_price: string;
  tax_rate: string;
};

export type StoredDocumentLine = { line_discount_input_amount?: number | null; id?: string; name: string | null; description?: string | null; item_type?: string | null; quantity?: number | null; unit_price?: number | null; amount?: number | null; tax_rate?: number | null; tax_category?: TaxCategory | null; unit?: string | null; note?: string | null; part_id?: string | null; cost_price?: number | null };
export type DocumentHeader = Record<string, unknown> & { tax_display_mode?: TaxDisplayMode | null; discount_input_amount?: number | null; discount_amount?: number | null; trade_in_amount?: number | null };
export const nonTaxFeeKeys = new Set(['liability_insurance','weight_tax','stamp_fee','recycle_deposit']);
export function documentLine(item: StoredDocumentLine, index: number): PartLineItem {
  return { line_discount_input_amount: String(item.line_discount_input_amount ?? 0), localId: `source-${item.id ?? index}`, part_id: item.part_id ?? null, part_no: '', name: item.name ?? '', quantity: String(item.quantity ?? 1), unit_price: String(item.unit_price ?? item.amount ?? 0), cost_price: item.cost_price == null ? '' : String(item.cost_price), tax_rate: String(item.tax_rate ?? 0.1), tax_category: item.tax_category ?? (item.item_type === 'tax' || item.item_type === 'insurance' || item.name === 'リサイクル預託金' ? 'out_of_scope' : 'taxable'), unit: item.unit ?? '', note: item.note ?? item.description ?? '', item_type: item.item_type ?? 'part' };
}
export function importDocument(header: DocumentHeader, items: StoredDocumentLine[]) {
  // Legacy Web saved inclusive input with tax=0; legacy mobile saved net input plus tax.
  // Infer only absent snapshots, using persisted monetary evidence, never today's store setting.
  const inputBasis=items.filter(x=>x.item_type!=='discount' && x.item_type!=='trade_in').reduce((sum,x)=>sum+Math.round(Number(x.quantity ?? 1)*Number(x.unit_price ?? x.amount ?? 0)),0);
  const legacyExcluded=Number(header.tax_amount ?? 0)>0 && Math.abs(inputBasis-Number(header.subtotal_amount ?? inputBasis))<=1;
  const mode = header.tax_display_mode ?? (legacyExcluded ? 'excluded' : 'included');
  return { mode, lines: items.filter(x => x.item_type !== 'discount' && x.item_type !== 'trade_in').map(documentLine), discount: String(header.discount_input_amount ?? header.discount_amount ?? 0), tradeIn: String(header.trade_in_amount ?? 0) };
}
export function documentCalculation(fixed: readonly {key:string; name:string; itemType:string; negative?:boolean}[], amounts: Record<string,string>, parts: PartLineItem[], mode: TaxDisplayMode) {
  const lines = [...fixed.filter(x=> !x.negative && Number(amounts[x.key] || 0) !== 0).map(x=>({name:x.name,item_type:x.itemType, quantity:'1',unit_price:amounts[x.key] || '0',tax_rate:nonTaxFeeKeys.has(x.key)?'0':'0.1',tax_category:(nonTaxFeeKeys.has(x.key)?'out_of_scope':'taxable') as TaxCategory,part_id:null as string|null,cost_price:null as number|null,unit:'',note:''})), ...parts.filter(x=>x.name.trim()).map(x=>({...x, name:x.name.trim(),item_type:x.item_type ?? 'part', unit_price:x.unit_price || '0',tax_category:x.tax_category ?? 'taxable',cost_price:x.cost_price.trim()?Number(x.cost_price):null}))];
  const result=calculateDocument(lines,mode,{discount:amounts.discount || '0',tradeIn:amounts.trade_in || '0'});
  const persisted=lines.map((line,index)=>({name:line.name,item_type:line.item_type,part_id:line.part_id,cost_price:line.cost_price,unit:line.unit || null,note:line.note || null,...result.lines[index],tax_amount:result.lines[index].discounted_tax_amount})).map(({input_amount,gross_amount,discounted_tax_amount,net_discount,...line})=>{void input_amount;void gross_amount;void discounted_tax_amount;void net_discount;return line;});
  return { ...result, persisted, subtotalAmount:result.subtotal_amount,taxAmount:result.tax_amount,discountAmount:result.discount_amount,tradeInAmount:result.trade_in_amount,totalAmount:result.total_amount,error:'' };
}
export function safeDocumentCalculation(...args: Parameters<typeof documentCalculation>) {
  try { return documentCalculation(...args); } catch(error) { return {...documentCalculation([],{},[],args[3]),error:error instanceof Error?error.message:'金額を確認してください。'}; }
}
