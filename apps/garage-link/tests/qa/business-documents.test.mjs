import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hook = registerHooks({resolve(specifier, context, next) { return next(specifier === './money' && context.parentURL?.endsWith('/business/documents.ts') ? './money.ts' : specifier,context); }});
const { documentCalculation, importDocument, safeDocumentCalculation } = await import('../../src/lib/business/documents.ts');
hook.deregister();
const row = {localId:'a',part_id:'part',part_no:'p',name:'エンジン, 調整',quantity:'1.5',unit_price:'1000',cost_price:'400.25',tax_rate:'0.1',tax_category:'taxable',unit:'時間',note:'作業備考',item_type:'labor'};

test('copy preserves every editable line, decimal, zero rate, unit and note without mutating source or importing identity/payment',()=>{
 const header={id:'old',invoice_no:'I-old',issue_status:'issued',paid_amount:500,tax_display_mode:'included',discount_input_amount:100,trade_in_amount:0};
 const saved=documentCalculation([], {discount:'100'},[row,{...row,localId:'b',name:'非課税部品',quantity:'0.5',unit_price:'3000',tax_category:'exempt',tax_rate:'0'}],'included');
 const snapshot=JSON.stringify({header,items:saved.persisted});
 const copy=importDocument(header,saved.persisted);
 assert.equal(copy.lines.length,2);assert.equal(copy.lines[0].name,'エンジン, 調整');assert.equal(copy.lines[0].quantity,'1.5');assert.equal(copy.lines[0].unit,'時間');assert.equal(copy.lines[0].note,'作業備考');assert.equal(copy.lines[1].tax_rate,'0');assert.equal(copy.lines[0].part_id,'part');assert.equal(copy.lines[0].cost_price,'400.25');
 assert.equal(copy.id,undefined);assert.equal(copy.paid_amount,undefined);assert.equal(copy.invoice_no,undefined);
 const recalculated=documentCalculation([],{discount:copy.discount,trade_in:copy.tradeIn},copy.lines,copy.mode);
 assert.equal(recalculated.total_amount,saved.total_amount);assert.equal(recalculated.tax_amount,saved.tax_amount);assert.equal(recalculated.paid_amount,0);assert.equal(recalculated.unpaid_amount,saved.total_amount);
 copy.lines[0].name='変更後';assert.equal(JSON.stringify({header,items:saved.persisted}),snapshot);
});
test('store mode changes do not alter source document snapshot mode',()=>{
 const source=documentCalculation([],{},[row],'excluded');
 const copy=importDocument({tax_display_mode:source.tax_display_mode},source.persisted);
 assert.equal(copy.mode,'excluded');assert.equal(documentCalculation([],{},copy.lines,copy.mode).total_amount,1650);
});
test('legacy inclusive amount retains total and historical source unchanged',()=>{
 const old={id:'old',amount:1500,unit_price:1000,quantity:1.5,name:'既存部品',item_type:'part',tax_rate:0.1};
 const copy=importDocument({tax_display_mode:null,discount_amount:100},[old]);
 assert.equal(documentCalculation([],{discount:copy.discount},copy.lines,copy.mode).total_amount,1400);assert.equal(old.amount,1500);
});
test('statutory fees remain outside tax while fractions calculate exactly',()=>{
 const result=documentCalculation([{key:'weight_tax',name:'重量税',itemType:'tax'}],{weight_tax:'500'},[row],'excluded');
 assert.equal(result.total_amount,2150);assert.equal(result.persisted[0].tax_category,'out_of_scope');assert.equal(result.persisted[0].tax_amount,0);assert.equal(result.persisted[1].quantity,1.5);
});
test('invalid drafts are recoverable and cannot produce a valid save summary',()=>{
 assert.match(safeDocumentCalculation([],{},[{...row,quantity:'-1'}],'included').error,/数値/);
 assert.match(safeDocumentCalculation([],{discount:'999999'},[row],'included').error,/値引き/);
});

test('legacy mobile external tax is preserved when copying a pre-snapshot document',()=>{
 const old={name:'旧モバイル',item_type:'part',quantity:1.5,unit_price:1000,amount:1500,tax_rate:0.1};
 const copy=importDocument({tax_display_mode:null,subtotal_amount:1500,tax_amount:150,total_amount:1650},[old]);
 assert.equal(copy.mode,'excluded');assert.equal(documentCalculation([],{},copy.lines,copy.mode).total_amount,1650);
});
test('per-line discount keeps original quantity and price, taxes only its own rate, and survives copy',()=>{const source=importDocument({tax_display_mode:'excluded'},[{name:'8%部品',quantity:1.5,unit_price:1000,tax_rate:.08,line_discount_input_amount:300},{name:'10%工賃',quantity:1,unit_price:1000,tax_rate:.1}]);const result=documentCalculation([],{},source.lines,source.mode);assert.equal(result.total_amount,2396);assert.equal(result.tax_amount,196);assert.equal(result.persisted[0].quantity,1.5);assert.equal(result.persisted[0].unit_price,1000);assert.equal(result.persisted[0].line_discount_input_amount,300);assert.equal(result.persisted[0].amount,1200);assert.throws(()=>documentCalculation([],{},[{...source.lines[0],line_discount_input_amount:'1501'}],source.mode));});
