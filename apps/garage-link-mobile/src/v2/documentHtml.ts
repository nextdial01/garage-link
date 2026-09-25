import type { Quote } from '../mobileApi';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));
const yen = (value: unknown) => `${Number(value ?? 0).toLocaleString('ja-JP')}円`;
/** Persisted line amounts are net; exempt and out-of-scope lines keep their own labels. */
export function documentLineAmountLabel(mode: unknown, category: unknown) {
 if (category === 'exempt') return '非課税';
 if (category === 'out_of_scope') return '税対象外';
 return mode === 'included' || mode === 'excluded' ? '税抜' : '保存時';
}
export function documentUnitPriceLabel(mode: unknown, category: unknown) {
 if (category === 'exempt') return '非課税';
 if (category === 'out_of_scope') return '税対象外';
 return mode === 'included' ? '税込' : mode === 'excluded' ? '税抜' : '保存時';
}
/** Read persisted snapshots only: printing must not reinterpret historical prices. */
export function documentHtml(kind: 'quote' | 'invoice', header: Record<string,unknown>, items: readonly Record<string,unknown>[]) {
 const mode = header.tax_display_mode === 'excluded' ? '税抜' : header.tax_display_mode === 'included' ? '税込' : '旧帳票の保存値';
 const legacy = header.tax_display_mode !== 'included' && header.tax_display_mode !== 'excluded';
 const rows = items.map(item=>`<tr><td>${escape(item.name)}<br/><small>${escape(item.note ?? item.description)}</small></td><td>${escape(item.quantity ?? 1)} ${escape(item.unit)}</td><td>${yen(item.unit_price)}</td><td>${yen(item.line_discount_input_amount)}</td><td>${item.tax_category==='exempt'?'非課税':item.tax_category==='out_of_scope'?'税対象外':`${Number(item.tax_rate ?? 0)*100}%`}</td><td>${yen(item.amount)}</td></tr>`).join('');
 const summary = [[legacy?'小計（保存時）':'小計（税抜・非課税を含む）',header.subtotal_amount],[legacy?'値引き（保存時）':'値引き（税抜相当）',header.discount_amount],['消費税',header.tax_amount],['下取り',header.trade_in_amount]].map(([label,value])=>`<p>${label}: ${yen(value)}</p>`).join('');
 return `<!doctype html><html lang="ja"><head><meta charset="utf-8"/><style>body{font-family:-apple-system,Arial;padding:28px;color:#102a43}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccd;padding:8px;text-align:right}td:first-child,th:first-child{text-align:left}small{white-space:pre-wrap}</style></head><body><h1>${kind==='quote'?'御見積書':'請求書'}</h1><p>番号: ${escape(header.quote_no ?? header.invoice_no)}</p><p>宛先: ${escape(header.customer_name)}</p><p>車両: ${escape(header.vehicle_label)}</p><table><thead><tr><th>内容・備考</th><th>数量・単位</th><th>単価（${mode}）</th><th>行値引（${mode}）</th><th>税区分</th><th>${legacy?'行金額（保存時）':'行金額（税抜・非課税）'}</th></tr></thead><tbody>${rows}</tbody></table>${summary}<h2>合計: ${yen(header.total_amount)}</h2>${kind==='invoice'?`<p>支払済額: ${yen(header.paid_amount)}</p><p>未払額: ${yen(header.unpaid_amount)}</p><p>支払期限: ${escape(header.payment_due_date)}</p>`:''}<p>${escape(header.customer_note)}</p></body></html>`;
}
export function quoteHtml(quote: Quote) {
 return documentHtml('quote',{quote_no:quote.quoteNo,customer_name:quote.customerName,vehicle_label:quote.vehicleLabel,tax_display_mode:quote.taxDisplayMode,subtotal_amount:quote.subtotalAmount,discount_amount:quote.discountAmount,tax_amount:quote.taxAmount,trade_in_amount:quote.tradeInAmount,total_amount:quote.totalAmount,customer_note:quote.customerNote},quote.items.map(item=>({name:item.name,quantity:item.quantity,unit:item.unit,unit_price:item.unitPrice,line_discount_input_amount:item.lineDiscountInputAmount,tax_rate:item.taxRate,tax_category:item.taxCategory,amount:item.amount,note:item.note ?? item.description})));
}
