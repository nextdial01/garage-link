import { importDocument } from '../../../garage-link/src/lib/business/documents';
import type { Quote } from '../mobileApi';
import type { WorkDetail } from '../../../garage-link/src/lib/business/workDetails';
import { storedPriceToDisplay, type TaxDisplayMode } from '../../../garage-link/src/lib/business/money';
export type CopyDocumentSource = Pick<Quote, 'id' | 'title' | 'taxDisplayMode' | 'subtotalAmount' | 'taxAmount' | 'discountInputAmount' | 'discountAmount' | 'tradeInAmount' | 'customerNote' | 'items'>;
export function quoteCopyDraft(quote: CopyDocumentSource): Record<string,string> {
  const source = importDocument({tax_display_mode:quote.taxDisplayMode,subtotal_amount:quote.subtotalAmount,tax_amount:quote.taxAmount,discount_input_amount:quote.discountInputAmount,discount_amount:quote.discountAmount,trade_in_amount:quote.tradeInAmount},quote.items.map(item=>({id:item.id,name:item.name,item_type:item.itemType,description:item.description,quantity:item.quantity,unit_price:item.unitPrice,tax_rate:item.taxRate,tax_category:item.taxCategory,unit:item.unit,note:item.note,amount:item.amount,part_id:item.partId,cost_price:item.costPrice,line_discount_input_amount:item.lineDiscountInputAmount})));
  const draft:Record<string,string>={quoteSourceId:quote.id,quoteMode:source.mode,quoteTitle:quote.title || '',quoteNote:quote.customerNote || '',quoteCount:String(source.lines.length),quoteDiscount:source.discount,quoteTradeIn:source.tradeIn};
  source.lines.forEach((item,index)=>Object.assign(draft,{[`quoteName${index}`]:item.name,[`quoteType${index}`]:item.item_type,[`quoteQty${index}`]:item.quantity,[`quotePrice${index}`]:item.unit_price,[`quoteTax${index}`]:item.tax_rate,[`quoteCategory${index}`]:item.tax_category,[`quoteUnit${index}`]:item.unit || '',[`quoteNote${index}`]:item.note || '',[`quotePartId${index}`]:item.part_id || '',[`quoteCostPrice${index}`]:item.cost_price,[`quoteLineDiscount${index}`]:item.line_discount_input_amount || '0'}));
  return draft;
}
export function maintenanceQuoteDraft(row: Record<string,unknown>, storeMode: TaxDisplayMode): Record<string,string> {
 const mode: TaxDisplayMode = row.tax_display_mode === 'excluded' ? 'excluded' : row.tax_display_mode === 'included' ? 'included' : 'included';
 void storeMode;
 const work = Array.isArray(row.work_details) && Number(row.work_details_version) === 1 ? row.work_details as WorkDetail[] : [{description:'工賃',quantity:1,unit_price:Number(row.labor_amount||0),tax_rate:.1,tax_category:'taxable' as const,unit:'',note:''}];
 const parts = Array.isArray(row.maintenance_parts) ? row.maintenance_parts as Record<string,unknown>[] : [];
 const lines = work.map(item=>({name:item.description,item_type:'labor',quantity:item.quantity,unit_price:item.unit_price,tax_rate:item.tax_rate,tax_category:item.tax_category,unit:item.unit,note:item.note,part_id:null as string|null,cost_price:null as number|null,line_discount_input_amount:0}));
 for (const part of parts) lines.push({name:String(part.name ?? ''),item_type:'part',quantity:Number(part.quantity),unit_price:Number(part.unit_price),tax_rate:Number(part.tax_rate ?? .1),tax_category:part.tax_category==='exempt'||part.tax_category==='out_of_scope'?part.tax_category:'taxable',unit:String(part.unit ?? ''),note:String(part.work_memo ?? part.note ?? ''),part_id:part.part_id?String(part.part_id):null,cost_price:part.cost_price==null?null:Number(part.cost_price),line_discount_input_amount:Number(part.discount_amount ?? 0)});
 for(const [name,key] of [['部品代','parts_amount'],['車検費用','inspection_amount'],['法定費用','legal_fee_amount'],['追加費用','additional_amount']]) {
  if((key==='parts_amount' && parts.length) || Number(row[key]||0)<=0) continue;
  lines.push({name,item_type:key==='parts_amount'?'part':'fee',quantity:1,unit_price:Number(row[key]),tax_rate:key==='legal_fee_amount'?0:.1,tax_category:key==='legal_fee_amount'?'out_of_scope':'taxable',unit:'',note:'',part_id:null,cost_price:null,line_discount_input_amount:0});
 }
 const draft:Record<string,string>={quoteMode:mode,quoteCount:String(lines.length),quoteDiscount:String(row.discount_input_amount ?? row.discount_amount ?? 0),quoteNote:[row.request_detail,row.customer_message].filter(Boolean).join('\n')};
 lines.forEach((item,i)=>Object.assign(draft,{[`quoteName${i}`]:item.name,[`quoteType${i}`]:item.item_type,[`quoteQty${i}`]:String(item.quantity),[`quotePrice${i}`]:String(item.unit_price),[`quoteTax${i}`]:String(item.tax_rate),[`quoteCategory${i}`]:item.tax_category,[`quoteUnit${i}`]:item.unit,[`quoteNote${i}`]:item.note,[`quotePartId${i}`]:item.part_id || '',[`quoteCostPrice${i}`]:item.cost_price==null?'':String(item.cost_price),[`quoteLineDiscount${i}`]:String(item.line_discount_input_amount)}));
 return draft;
}
export const vehicleQuoteDraft = (amount: number, mode: TaxDisplayMode) => ({quoteMode:mode,quoteCount:'1',quoteName0:'車両本体',quotePrice0:String(storedPriceToDisplay(amount,mode))});
