import crypto from 'node:crypto';

const base = 'http://127.0.0.1:3012/api/deals/fixture-deal/sale';

function cookie(token) {
  const userId = {
    'owner-token': '50000000-0000-0000-0000-000000000001',
    'viewer-token': '50000000-0000-0000-0000-000000000005',
    'staff-token': '50000000-0000-0000-0000-000000000004',
    'inactive-token': '50000000-0000-0000-0000-000000000006',
    'other-tenant-token': '50000000-0000-0000-0000-000000000008',
    'other-store-token': '50000000-0000-0000-0000-000000000004',
    'dbfail-token': '50000000-0000-0000-0000-000000000001',
  }[token];
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      sub: userId,
      role: 'authenticated',
      session_id: `g0b-${token}-session`,
      fixture_token: token,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url'),
    'g0b-fixture-signature',
  ].join('.');
  const session = {
    access_token: jwt,
    refresh_token: `${token}-refresh`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated' },
  };
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

const cases = [
  ['unauth', 'POST', null, 'g3r-unauth-0001', 401],
  ['viewer', 'POST', 'viewer-token', 'g3r-viewer-0001', 403],
  ['inactive', 'POST', 'inactive-token', 'g3r-inactive-0001', 403],
  ['other-tenant', 'POST', 'other-tenant-token', 'g3r-other-tenant-0001', 403],
  ['other-store', 'POST', 'other-store-token', 'g3r-other-store-0001', 403],
  ['reserve', 'POST', 'owner-token', 'g3r-reserve-0001', 200],
  ['conflict', 'POST', 'owner-token', 'g3r-conflict-0001', 409],
  ['idempotent-retry', 'POST', 'owner-token', 'g3r-reserve-0001', 200],
  ['cancel', 'DELETE', 'owner-token', 'g3r-cancel-0001', 200],
  ['deliver', 'PATCH', 'owner-token', 'g3r-deliver-0001', 200],
  ['db-failure', 'POST', 'dbfail-token', 'g3r-dbfail-0001', 503],
];

let failed = 0;
for (const [name, method, token, key, expected] of cases) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.cookie = cookie(token);
  const response = await fetch(base, { method, headers, body: JSON.stringify({ idempotencyKey: key, correlationId: 'g3r' }) });
  const text = await response.text();
  const leaked = /(constraint|sqlstate|stack trace|postgres|at .*\.ts:\d+)/i.test(text);
  console.log(`${name}|${response.status}|leak=${leaked}|${text}`);
  if (response.status !== expected || leaked) failed += 1;
}

const accountingCases = [
  ['accounting-unauth', '/api/invoices/fixture-invoice/issue', null, { idempotencyKey: 'g4a-unauth-0001' }, 401],
  ['accounting-viewer', '/api/invoices/fixture-invoice/payments', 'viewer-token', { amount: 100, idempotencyKey: 'g4a-viewer-0001' }, 403],
  ['accounting-inactive', '/api/invoices/fixture-invoice/void', 'inactive-token', { reason: '架空取消理由', idempotencyKey: 'g4a-inactive-0001' }, 403],
  ['accounting-issue', '/api/invoices/fixture-invoice/issue', 'owner-token', { idempotencyKey: 'g4a-issue-0001' }, 200],
  ['accounting-payment', '/api/invoices/fixture-invoice/payments', 'owner-token', { amount: 100, paymentMethod: 'fixture', idempotencyKey: 'g4a-payment-0001' }, 200],
  ['accounting-overpay', '/api/invoices/fixture-invoice/payments', 'owner-token', { amount: 100, idempotencyKey: 'g4a-overpay-0001' }, 409],
  ['accounting-refund', '/api/payments/fixture-payment/reversals', 'owner-token', { amount: 100, operation: 'refund', reason: '架空返金理由', idempotencyKey: 'g4a-refund-0001' }, 200],
  ['accounting-over-refund', '/api/payments/fixture-payment/reversals', 'owner-token', { amount: 101, operation: 'refund', reason: '架空過剰返金', idempotencyKey: 'g4a-over-refund-0001' }, 409],
  ['accounting-void', '/api/invoices/fixture-invoice/void', 'owner-token', { reason: '架空取消理由', idempotencyKey: 'g4a-void-0001' }, 200],
  ['accounting-db-failure', '/api/invoices/fixture-invoice/issue', 'dbfail-token', { idempotencyKey: 'g4a-dbfail-0001' }, 503],
];
for (const [name, path, token, body, expected] of accountingCases) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.cookie = cookie(token);
  const response = await fetch(`http://127.0.0.1:3012${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  const leaked = /(constraint|sqlstate|stack trace|postgres|at .*\.ts:\d+)/i.test(text);
  console.log(`${name}|${response.status}|leak=${leaked}|${text}`);
  if (response.status !== expected || leaked) failed += 1;
}

const correctionCases = [
  ['correction-unauth', '/api/sale-corrections', null, { saleClaimId: 'fixture-claim', caseType: 'customer_return', reason: '架空返品申請', requestedRefundAmount: 0, idempotencyKey: 'g4b-unauth-0001' }, 401],
  ['correction-viewer', '/api/sale-corrections', 'viewer-token', { saleClaimId: 'fixture-claim', caseType: 'customer_return', reason: '架空返品申請', requestedRefundAmount: 0, idempotencyKey: 'g4b-viewer-0001' }, 403],
  ['correction-inactive', '/api/sale-corrections', 'inactive-token', { saleClaimId: 'fixture-claim', caseType: 'customer_return', reason: '架空返品申請', requestedRefundAmount: 0, idempotencyKey: 'g4b-inactive-0001' }, 403],
  ['correction-staff-create', '/api/sale-corrections', 'staff-token', { saleClaimId: 'fixture-claim', caseType: 'customer_return', reason: '架空返品申請', requestedRefundAmount: 0, idempotencyKey: 'g4b-staff-create-0001' }, 200],
  ['correction-owner-create', '/api/sale-corrections', 'owner-token', { saleClaimId: 'fixture-claim', caseType: 'customer_return', reason: '架空返品申請', requestedRefundAmount: 0, idempotencyKey: 'g4b-owner-create-0001' }, 200],
  ['correction-staff-approve', '/api/sale-corrections/fixture-correction-case/actions', 'staff-token', { action: 'approve', approvedRefundAmount: 0, restockDecision: 'not_applicable', idempotencyKey: 'g4b-staff-approve-0001' }, 403],
  ['correction-owner-approve', '/api/sale-corrections/fixture-correction-case/actions', 'owner-token', { action: 'approve', approvedRefundAmount: 0, restockDecision: 'not_applicable', idempotencyKey: 'g4b-owner-approve-0001' }, 200],
  ['correction-over-refund', '/api/sale-corrections/fixture-correction-case/actions', 'owner-token', { action: 'refund', paymentId: 'fixture-payment', amount: 101, reason: '架空過剰返金', idempotencyKey: 'g4b-over-refund-0001' }, 409],
  ['correction-db-failure', '/api/sale-corrections', 'dbfail-token', { saleClaimId: 'fixture-claim', caseType: 'customer_return', reason: '架空返品申請', requestedRefundAmount: 0, idempotencyKey: 'g4b-dbfail-0001' }, 503],
];
for (const [name, path, token, body, expected] of correctionCases) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.cookie = cookie(token);
  const response = await fetch(`http://127.0.0.1:3012${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  const leaked = /(constraint|sqlstate|stack trace|postgres|at .*\.ts:\d+)/i.test(text);
  console.log(`${name}|${response.status}|leak=${leaked}|${text}`);
  if (response.status !== expected || leaked) failed += 1;
}

const exportResponse = await fetch('http://127.0.0.1:3012/api/accounting-export?from=2026-01-01&to=2026-12-31', {
  headers: { cookie: cookie('viewer-token') },
});
const exportText = await exportResponse.text();
console.log(`accounting-export-viewer|${exportResponse.status}|${exportText}`);
if (exportResponse.status !== 403 || /(constraint|sqlstate|stack trace|postgres|at .*\.ts:\d+)/i.test(exportText)) failed += 1;

const switchBase = 'http://127.0.0.1:3012/api/stores/active';
const switchCases = [
  ['store-switch-unauth', null, '51000000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000002', 401],
  ['store-switch-owner', 'owner-token', '51000000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000002', 200],
  ['store-switch-viewer', 'viewer-token', '51000000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000002', 200],
  ['store-switch-inactive', 'inactive-token', '51000000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000002', 403],
  ['store-switch-cross-tenant', 'owner-token', '52000000-0000-4000-8000-000000000001', '52100000-0000-4000-8000-000000000001', 403],
];
for (const [name, token, tenantId, storeId, expected] of switchCases) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.cookie = cookie(token);
  const response = await fetch(switchBase, { method: 'POST', headers, body: JSON.stringify({ tenantId, storeId, actorUserId: 'attacker' }) });
  const text = await response.text();
  const leaked = /(constraint|sqlstate|stack trace|postgres|at .*\.ts:\d+)/i.test(text);
  console.log(`${name}|${response.status}|leak=${leaked}|${text}`);
  if (response.status !== expected || leaked) failed += 1;
}

const s2sSecret = 'g0b-line-link-secret-at-least-32-bytes';
function s2sHeaders(storeId, nonce) {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/s2s/line-link/delivery-candidates';
  const bodyHash = crypto.createHash('sha256').update('').digest('base64');
  const payload = ['POST', path, String(timestamp), nonce, storeId, bodyHash].join('\n');
  return {
    'x-ll-key-id': 'default',
    'x-ll-timestamp': String(timestamp),
    'x-ll-nonce': nonce,
    'x-ll-store-id': storeId,
    'x-ll-signature': crypto.createHmac('sha256', s2sSecret).update(payload).digest('base64'),
  };
}
const validNonce = 'g0bvalidnonce000000000001';
const s2sValid = await fetch('http://127.0.0.1:3012/api/s2s/line-link/delivery-candidates', {
  method: 'POST', headers: s2sHeaders('51100000-0000-0000-0000-000000000001', validNonce), body: '',
});
console.log(`llink-valid|${s2sValid.status}|${await s2sValid.text()}`);
if (s2sValid.status !== 200) failed += 1;
const s2sReplay = await fetch('http://127.0.0.1:3012/api/s2s/line-link/delivery-candidates', {
  method: 'POST', headers: s2sHeaders('51100000-0000-0000-0000-000000000001', validNonce), body: '',
});
console.log(`llink-replay|${s2sReplay.status}|${await s2sReplay.text()}`);
if (s2sReplay.status !== 401) failed += 1;
const s2sCrossTenant = await fetch('http://127.0.0.1:3012/api/s2s/line-link/delivery-candidates', {
  method: 'POST', headers: s2sHeaders('52100000-0000-0000-0000-000000000001', 'g0bcrosstenantnonce000001'), body: '',
});
console.log(`llink-cross-tenant|${s2sCrossTenant.status}|${await s2sCrossTenant.text()}`);
if (s2sCrossTenant.status !== 403) failed += 1;
process.exitCode = failed ? 1 : 0;
