import { storedPriceToDisplay, type TaxDisplayMode } from './money';
/** Preserve the final payment total without taxing its unidentified statutory-fee balance. */
export function vehicleInvoiceDefaults(base: number | null | undefined, total: number | null | undefined, mode: TaxDisplayMode) {
 const grossBase = Number(base ?? 0);
 const grossTotal = total == null ? grossBase : Number(total);
 return { vehicle: String(storedPriceToDisplay(grossBase,mode)), stamp_fee: String(Math.max(grossTotal-grossBase,0)), discount: String(Math.round(storedPriceToDisplay(Math.max(grossBase-grossTotal,0),mode))) };
}
/** The legacy total does not establish a tax category. Require an explicit choice. */
export function vehicleInvoiceBalanceLine(gross: number, mode: TaxDisplayMode, category: string) {
 if (!gross) return null;
 if (!['taxable10','taxable8','exempt','out_of_scope'].includes(category)) throw new Error('支払総額との差額の税区分を選択してください。');
 const taxRate = category==='taxable10' ? .1 : category==='taxable8' ? .08 : 0;
 return { localId:'vehicle-total-balance',part_id:null,part_no:'',item_type:'fee',name:'支払総額との差額',quantity:'1',unit_price:String(taxRate ? storedPriceToDisplay(gross,mode,taxRate) : gross),cost_price:'',tax_rate:String(taxRate),tax_category:category==='exempt'?'exempt' as const:category==='out_of_scope'?'out_of_scope' as const:'taxable' as const,note:'' };
}
