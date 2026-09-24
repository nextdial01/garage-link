import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceEstimate } from '../../src/lib/mobile/maintenanceCost.ts';

test('quick reception has a zero estimate and full costs are calculated', () => {
  assert.equal(maintenanceEstimate({}), 0);
  assert.equal(maintenanceEstimate({ labor_amount: 12000, parts_amount: 8000,
    inspection_amount: 3000, legal_fee_amount: 2000, additional_amount: 500,
    discount_amount: 1500 }), 24000);
});

test('a discount over the subtotal and overflow refuse persistence', () => {
  assert.equal(maintenanceEstimate({ discount_amount: 1 }), null);
  assert.equal(maintenanceEstimate({ labor_amount: 100_000_000, parts_amount: 1 }), null);
});
