import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mobileQuoteTotals } from '../../src/lib/mobile/quoteTotals.ts';

test('mobile quote separates positive subtotal, tax, discount and trade-in', () => {
  assert.deepEqual(mobileQuoteTotals([
    { item_type: 'vehicle', amount: 100000, tax_amount: 10000 },
    { item_type: 'registration', amount: 20000, tax_amount: 2000 },
    { item_type: 'discount', amount: -3000, tax_amount: 0 },
    { item_type: 'trade_in', amount: -40000, tax_amount: 0 },
  ]), { subtotalAmount: 120000, taxAmount: 12000, discountAmount: 3000, tradeInAmount: 40000, totalAmount: 89000 });
});

test('mobile quote refuses negative or database-overflow totals', () => {
  assert.equal(mobileQuoteTotals([{ item_type: 'discount', amount: -1, tax_amount: 0 }]), null);
  assert.equal(mobileQuoteTotals([{ item_type: 'vehicle', amount: 2_147_483_647, tax_amount: 1 }]), null);
  assert.equal(mobileQuoteTotals([{ item_type: 'vehicle', amount: 100_000_001, tax_amount: 0 }]), null);
});
