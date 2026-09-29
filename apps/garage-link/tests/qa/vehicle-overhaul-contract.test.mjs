import assert from 'node:assert/strict';
import test from 'node:test';
import { vehicleDate } from '../../src/lib/business/vehicleFields.ts';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const targetSource = readFileSync(new URL('../../src/lib/security/csvTargets.ts', import.meta.url), 'utf8').replace("import 'server-only';", '');
const { vehicleCsvConfig } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(targetSource)).toString('base64'));
import { rowsToCsv, parseCsv } from '../../src/lib/security/csvCore.ts';
test('optional vehicle dates distinguish empty, valid, and impossible calendar dates', () => {
  assert.equal(vehicleDate('2028-02-29'), '2028-02-29');
  assert.equal(vehicleDate('2027-02-29'), undefined);
  assert.equal(vehicleDate('2026-04-31'), undefined);
  assert.equal(vehicleDate(''), null);
  assert.equal(vehicleDate(null), null);
});
test('vehicle CSV retains legacy maker and independent inspection/insurance dates', () => {
  const row = { management_no: 'TEST', maker: 'Legacy, Maker', inspection_expiry_date: '2027-04-01', liability_insurance_expiry_date: '2027-03-31' };
  const parsed = parseCsv(rowsToCsv([row], vehicleCsvConfig.exportColumns));
  for (const key of ['maker', 'inspection_expiry_date', 'liability_insurance_expiry_date']) {
    assert.ok(vehicleCsvConfig.importColumns.includes(key));
    assert.equal(parsed.rows[0][key], row[key]);
  }
});
