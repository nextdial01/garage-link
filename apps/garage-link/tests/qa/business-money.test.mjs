import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLine, calculateDocument, decimal, priceLabel } from '../../src/lib/business/money.ts';
import { masterOptions } from '../../src/lib/business/masters.ts';

test('decimal quantities are retained and totals use exact decimal multiplication', () => {
  for (const [quantity, unit_price] of [[1.5, 1000], [0.5, 3000]]) {
    assert.equal(calculateLine({ quantity, unit_price }, 'included').gross_amount, 1500);
  }
  assert.equal(calculateLine({ quantity: '0.125', unit_price: '4' }, 'included').gross_amount, 1);
  assert.equal(calculateLine({ quantity: '1', unit_price: '1.4999' }, 'included').gross_amount, 1);
  assert.equal(decimal('0'), 0);
  for (const value of ['', '-1', '1.2345', '1abc', 'Infinity', 'NaN']) assert.throws(() => decimal(value));
});

test('inclusive and exclusive documents agree without charging tax twice', () => {
  const included = calculateDocument([{ quantity: 2, unit_price: 1100 }], 'included');
  const excluded = calculateDocument([{ quantity: 2, unit_price: 1000 }], 'excluded');
  for (const doc of [included, excluded]) {
    assert.equal(doc.subtotal_amount, 2000);
    assert.equal(doc.tax_amount, 200);
    assert.equal(doc.total_amount, 2200);
  }
});

test('exempt, zero-rate and out-of-scope lines do not acquire tax', () => {
  for (const tax_category of ['exempt', 'out_of_scope']) assert.equal(calculateLine({ quantity: 1, unit_price: 1000, tax_category }, 'excluded').tax_amount, 0);
  assert.equal(calculateLine({ quantity: 1, unit_price: 1000, tax_rate: 0 }, 'excluded').tax_amount, 0);
  assert.equal(priceLabel('法定費用', 'included', 'out_of_scope'), '法定費用（税対象外）');
});

test('discount is applied before tax, trade-in and payments after tax', () => {
  for (const [mode, unit_price, discount] of [['included', 1100, 110], ['excluded', 1000, 100]]) {
    const doc = calculateDocument([{ quantity: 1, unit_price }], mode, { discount, tradeIn: 90, paid: 400 });
    assert.equal(doc.discount_amount, 100);
    assert.equal(doc.tax_amount, 90);
    assert.equal(doc.total_amount, 900);
    assert.equal(doc.unpaid_amount, 500);
    assert.equal(doc.discount_input_amount, discount);
  }
});

test('document totals survive save/read JSON and copied payment reset', () => {
  const doc = calculateDocument([{ quantity: 2.75, unit_price: 1100 }], 'included', { paid: 500 });
  const saved = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(saved, doc);
  const copied = calculateDocument(saved.lines, saved.tax_display_mode, { paid: 0 });
  assert.equal(copied.total_amount, doc.total_amount);
  assert.equal(copied.paid_amount, 0);
  assert.equal(copied.unpaid_amount, copied.total_amount);
  assert.equal(doc.paid_amount, 500);
});

test('invalid amounts and overpayments fail explicitly', () => {
  assert.throws(() => calculateDocument([{ quantity: 1, unit_price: 100 }], 'included', { discount: 101 }));
  assert.throws(() => calculateDocument([{ quantity: 1, unit_price: 100 }], 'included', { paid: 101 }));
  assert.throws(() => calculateLine({ quantity: 1, unit_price: 1, tax_rate: 2 }, 'included'));
});

test('master selection preserves disabled historical labels without offering them as new choices', () => {
  const entries = [{ id: 'a', store_id: 's', kind: 'vehicle_maker', label: '旧メーカー', is_active: false, sort_order: 0 }, { id: 'b', store_id: 's', kind: 'vehicle_maker', label: '新メーカー', is_active: true, sort_order: 1 }];
  assert.deepEqual(masterOptions(entries, 'vehicle_maker').map(x => x.value), ['新メーカー']);
  assert.deepEqual(masterOptions(entries, 'vehicle_maker', '旧メーカー').map(x => x.value), ['旧メーカー', '新メーカー']);
  assert.deepEqual(masterOptions(entries, 'part_category'), []);
});

test('discount allocation never assigns remainder to a zero-value final row', () => {
  const doc = calculateDocument([{quantity:1,unit_price:1},{quantity:1,unit_price:1},{quantity:1,unit_price:0}], 'included', {discount:1});
  assert.equal(doc.total_amount,1);
  assert.equal(doc.lines[2].net_discount,0);
});
