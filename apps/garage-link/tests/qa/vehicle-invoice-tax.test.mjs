import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hooks=registerHooks({resolve(s,c,next){if(s==='./money' && c.parentURL?.includes('/business/'))return next('./money.ts',c);return next(s,c);}});
const {vehicleInvoiceDefaults,vehicleInvoiceBalanceLine}=await import('../../src/lib/business/vehicleInvoice.ts');
const {documentCalculation}=await import('../../src/lib/business/documents.ts');hooks.deregister();
for(const mode of ['included','excluded'])test(`vehicle final total preserves statutory balance without taxing it: ${mode}`,()=>{const input=vehicleInvoiceDefaults(110000,120000,mode);const result=documentCalculation([{key:'vehicle',name:'車両',itemType:'vehicle'}],input,[vehicleInvoiceBalanceLine(Number(input.stamp_fee),mode,'out_of_scope')],mode);assert.equal(result.total_amount,120000);assert.equal(result.tax_amount,10000);assert.equal(result.persisted[1].tax_amount,0);assert.equal(result.persisted[1].tax_category,'out_of_scope');assert.equal(result.persisted[1].unit_price,10000);});
test('missing base never drops the saved total or claims its unknown tax basis',()=>{const input=vehicleInvoiceDefaults(null,120000,'excluded');assert.equal(input.vehicle,'0');assert.equal(input.stamp_fee,'120000');});

test('positive unknown balance blocks save, explicit taxable preserves gross total',()=>{assert.throws(()=>vehicleInvoiceBalanceLine(10000,'included',''),/税区分/);assert.equal(vehicleInvoiceBalanceLine(0,'included',''),null);const line=vehicleInvoiceBalanceLine(11000,'excluded','taxable10');assert.equal(line.unit_price,'10000');const result=documentCalculation([],{},[line],'excluded');assert.equal(result.total_amount,11000);});
