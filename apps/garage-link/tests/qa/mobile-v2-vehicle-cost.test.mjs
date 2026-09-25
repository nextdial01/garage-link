import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleCost } from '../../src/lib/mobile/vehicleCost.ts';

const base = {
  purchase_price: 0, direct_cost_special: null, direct_cost_accessories: null,
  direct_cost_agency: null, direct_cost_legal: null, direct_cost_other: null,
  direct_cost_repair: null, listing_price: 0, market_value: null,
  purchase_date: '2026-09-25', created_at: '2026-09-25T00:00:00Z',
};

test('cost handles zero, missing amounts and zero asking price', () => {
  assert.deepEqual(vehicleCost(base, new Date('2026-09-25T15:00:00Z')), {
    totalCost: 0, expectedProfit: 0, profitRate: null, daysInStock: 1,
  });
});

test('cost adds each expense once and uses preferred asking price', () => {
  assert.deepEqual(vehicleCost({ ...base, purchase_price: 100000, direct_cost_special: 2000,
    direct_cost_accessories: 3000, direct_cost_agency: 4000, direct_cost_legal: 5000,
    direct_cost_other: 6000, direct_cost_repair: 7000, market_value: 200000,
  }, new Date('2026-09-25T00:00:00Z')), {
    totalCost: 127000, expectedProfit: 73000, profitRate: 0.365, daysInStock: 0,
  });
});
