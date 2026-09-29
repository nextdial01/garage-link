import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomer, lookupPostalAddress, normalizePostalCode } from '../../src/lib/business/customer.ts';
import { storedPriceToDisplay, displayPriceToStored } from '../../src/lib/business/money.ts';

test('new and legacy-null edited customers require a real birth date', () => {
 for(const birth_date of ['', '2025-02-30', '2100-01-01','unknown']) assert.throws(()=>validateCustomer({name:'試験',birth_date}));
 validateCustomer({name:'試験',birth_date:'2000-02-29'});
});
test('postal search normalizes seven digits and allows caller to handle unavailable lookup', async () => {
 let sent='';const fetcher=async url=>{sent=url;return {ok:true,json:async()=>({status:200,results:[{address1:'大阪府',address2:'大阪市西区',address3:'土佐堀'}]})}};
 assert.equal(normalizePostalCode('550-0001'),'5500001');
 assert.deepEqual(await lookupPostalAddress('550-0001',undefined,fetcher),['大阪府大阪市西区土佐堀']);
 assert.ok(sent.endsWith('zipcode=5500001'));
 await assert.rejects(lookupPostalAddress('5500001',undefined,async()=>({ok:false})));
});
test('switching display mode keeps canonical product prices and accepts decimal unit amounts', () => {
 assert.equal(storedPriceToDisplay(1100,'excluded'),1000);
 assert.equal(displayPriceToStored(1000,'excluded'),1100);
 assert.equal(storedPriceToDisplay(1100,'included'),1100);
});
