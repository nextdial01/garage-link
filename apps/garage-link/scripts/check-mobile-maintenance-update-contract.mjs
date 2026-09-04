import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../src/app/api/mobile/maintenance/[jobId]/route.ts', import.meta.url), 'utf8');

assert.match(route, /x-idempotency-key/, 'maintenance mutation must require an operation key');
assert.match(route, /garage_mobile_update_maintenance/, 'maintenance mutation must be atomic in the database');
assert.match(route, /idempotency_conflict/, 'same key with a different payload must conflict');
assert.match(route, /deliveryPresent/, 'delivery date is changed only when explicitly present');
assert.match(route, /maintenance_readback_failed/, 'successful mutation must be read back from the server');
console.log('PASS mobile maintenance update contract');
