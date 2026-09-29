import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
    return next(specifier, context);
  },
});
const { MOBILE_QUOTE_ITEM_FIELDS, mobileQuote } = await import('../../src/lib/mobile/dto.ts');
const { trustedSourceItemCost } = await import('../../src/lib/mobile/sourceItemCost.ts');
hook.deregister();

test('mobile quote DTO never serializes cost or internal memo fields', () => {
  const quote = mobileQuote(
    { id: 'quote', quote_no: 'Q-1', internal_memo: 'do not expose', cost_price: 400 },
    [{ id: 'line', item_type: 'part', name: 'Part', quantity: 1.5, unit_price: 1000, cost_price: 400, work_memo: 'internal' }],
  );
  assert.equal(MOBILE_QUOTE_ITEM_FIELDS.includes('cost_price'), false);
  assert.equal('costPrice' in quote.items[0], false);
  assert.equal('internalMemo' in quote, false);
  assert.equal('workMemo' in quote.items[0], false);
});

test('document copy cost comes from the exact already-scoped source item, never the client payload', () => {
  const sourceId = '96000000-0000-4000-8000-000000000001';
  const sourceRows = [{ id: sourceId, cost_price: '400.25' }];
  assert.equal(trustedSourceItemCost(sourceId, sourceRows), 400.25);
  assert.throws(() => trustedSourceItemCost('96000000-0000-4000-8000-000000000002', sourceRows), /invalid_source_item/);
  assert.equal(trustedSourceItemCost(null, sourceRows), null);
});
