import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAINTENANCE_JOB_TYPES, maintenanceJobTypes, loadedPartsTotal, manualPartsDocumentLine } from '../../src/lib/maintenance/formValues.ts';
import { maintenanceEstimate } from '../../src/lib/mobile/maintenanceCost.ts';

test('create and detail support general maintenance and retain legacy values', () => {
  for (const type of MAINTENANCE_JOB_TYPES) assert.ok(maintenanceJobTypes(type).includes(type));
  assert.ok(maintenanceJobTypes('一般整備').includes('一般整備'));
  assert.ok(maintenanceJobTypes('既存の種別').includes('既存の種別'));
});

for (const cost of [0, 1000, 12345]) {
  test(`manual parts ${cost} survive an empty initial detail read and document conversion`, () => {
    assert.equal(loadedPartsTotal([]), null);
    const readback = loadedPartsTotal([]) ?? cost;
    assert.equal(readback, cost);
    const line = manualPartsDocumentLine(cost, 0);
    assert.equal(line ? Number(line.unit_price) * Number(line.quantity) : 0, cost);
    assert.equal(maintenanceEstimate({ labor_amount: 5000, parts_amount: readback }), 5000 + cost);
  });
}

test('real part rows stay authoritative without double counting, including zero', () => {
  assert.equal(loadedPartsTotal([{ subtotal_amount: 0 }]), 0);
  assert.equal(loadedPartsTotal([{ subtotal_amount: 1000 }, { subtotal_amount: 2345 }]), 3345);
  assert.equal(manualPartsDocumentLine(1000, 1), null);
  assert.equal(manualPartsDocumentLine(null, 0), null);
});
