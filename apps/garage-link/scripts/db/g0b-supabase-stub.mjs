import http from 'node:http';

const users = {
  'owner-token': '50000000-0000-0000-0000-000000000001',
  'viewer-token': '50000000-0000-0000-0000-000000000005',
  'staff-token': '50000000-0000-0000-0000-000000000004',
  'inactive-token': '50000000-0000-0000-0000-000000000006',
  'other-tenant-token': '50000000-0000-0000-0000-000000000008',
  'other-store-token': '50000000-0000-0000-0000-000000000004',
  'dbfail-token': '50000000-0000-0000-0000-000000000001',
};
let dealStatus = '商談中';
let vehicleStatus = '在庫中';
const usedNonces = new Set();
const activeStores = new Map();

const server = http.createServer((request, response) => {
  const rawToken = (request.headers.authorization ?? '').replace(/^Bearer /, '');
  let token = rawToken;
  if (rawToken.includes('.')) {
    try {
      const payload = JSON.parse(Buffer.from(rawToken.split('.')[1], 'base64url').toString('utf8'));
      token = payload.fixture_token ?? rawToken;
    } catch {}
  }
  console.log(`${request.method} ${request.url}`);
  response.setHeader('content-type', 'application/json');
  response.setHeader('access-control-allow-origin', 'http://127.0.0.1:3012');
  response.setHeader('access-control-allow-headers', 'authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile');
  response.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
  if (request.url === '/auth/v1/user' && request.method === 'GET') {
    const id = users[token];
    if (!id) { response.statusCode = 401; response.end(JSON.stringify({ message: 'unauthorized' })); return; }
    response.end(JSON.stringify({ id, aud: 'authenticated', role: 'authenticated', email: `${token}@example.invalid` }));
    return;
  }
  if (request.url?.startsWith('/rest/v1/rpc/') && request.method === 'POST') {
    if (token === 'dbfail-token' && /\/(reserve_vehicle_sale|cancel_vehicle_sale|complete_vehicle_delivery|issue_garage_invoice|void_garage_invoice|record_garage_payment|record_garage_payment_reversal|create_sale_correction_case|transition_sale_correction_case|record_sale_correction_refund|complete_sale_correction_inspection|resolve_sale_correction_ownership|confirm_sale_correction_restock|resolve_sale_correction_external_procedure)$/.test(request.url)) {
      response.statusCode = 503;
      response.end(JSON.stringify({ message: 'temporary' }));
      return;
    }
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch {}
      if (request.url.endsWith('/current_user_tenant_ids')) {
        response.end(JSON.stringify([]));
        return;
      }
      if (request.url.endsWith('/admin_email_otp_bootstrap_context')) {
        // G0-B exercises API/RPC outcomes, not the separate administrator OTP
        // browser gate. Use non-admin canonical roles here so those requests
        // reach the route under test without fabricating a trusted device.
        const roleByUser = {
          '50000000-0000-0000-0000-000000000001': 'staff',
          '50000000-0000-0000-0000-000000000004': 'staff',
          '50000000-0000-0000-0000-000000000005': 'viewer',
          '50000000-0000-0000-0000-000000000008': 'staff',
        };
        if (!body.p_session_id || body.p_user_id === '50000000-0000-0000-0000-000000000006') {
          response.end('null');
          return;
        }
        response.end(JSON.stringify({
          tenant_id: '51000000-0000-4000-8000-000000000001',
          store_id: '51100000-0000-4000-8000-000000000001',
          role: roleByUser[body.p_user_id] ?? 'viewer',
          membership_id: '51200000-0000-4000-8000-000000000001',
          membership_updated_at: '2026-07-28T00:00:00Z',
          assignment_updated_at: null,
          store_status: 'active',
        }));
        return;
      }
      if (request.url.endsWith('/current_user_store_ids')) {
        response.end(JSON.stringify(['51100000-0000-0000-0000-000000000001']));
        return;
      }
      if (request.url.endsWith('/get_member_contract_access')) {
        response.end(JSON.stringify({ state: 'active' }));
        return;
      }
      if (request.url.endsWith('/get_garage_ui_context')) {
        response.end(JSON.stringify({
          role: token === 'viewer-token' ? 'viewer' : 'owner',
          store_id: '51100000-0000-0000-0000-000000000001',
          store_label: 'G0 Store A1',
          onboarding_completed: true,
          stores: [{ id: '51100000-0000-0000-0000-000000000001', name: 'G0 Store A1', company_name: 'G0 Tenant A', is_current: true }],
        }));
        return;
      }
      if (request.url.endsWith('/get_garage_ui_context_v2')) {
        if (token === 'inactive-token') {
          response.end(JSON.stringify({ state: 'no_access', tenant_id: '', store_id: '', role: 'viewer', stores: [], counts: {} }));
          return;
        }
        const storeId = activeStores.get(token) ?? '51100000-0000-4000-8000-000000000001';
        response.end(JSON.stringify({
          state: 'active', tenant_id: '51000000-0000-4000-8000-000000000001',
          role: token === 'viewer-token' ? 'viewer' : 'owner', store_id: storeId,
          store_label: storeId.endsWith('2') ? 'G0 Store A2' : 'G0 Store A1',
          onboarding_completed: true, counts: {},
          stores: [
            { id: '51100000-0000-4000-8000-000000000001', tenant_id: '51000000-0000-4000-8000-000000000001', name: 'G0 Store A1', company_name: 'G0 Tenant A', is_current: storeId.endsWith('1') },
            { id: '51100000-0000-4000-8000-000000000002', tenant_id: '51000000-0000-4000-8000-000000000001', name: 'G0 Store A2', company_name: 'G0 Tenant A', is_current: storeId.endsWith('2') },
          ],
        }));
        return;
      }
      if (request.url.endsWith('/switch_active_garage_store')) {
        if (!users[token]) {
          response.statusCode = 401;
          response.end(JSON.stringify({ message: 'G1D_UNAUTHENTICATED' }));
          return;
        }
        if (token === 'inactive-token' || body.p_tenant_id !== '51000000-0000-4000-8000-000000000001'
            || !['51100000-0000-4000-8000-000000000001','51100000-0000-4000-8000-000000000002'].includes(body.p_store_id)) {
          response.statusCode = 400;
          response.end(JSON.stringify({ code: '42501', message: 'G1D_STORE_FORBIDDEN' }));
          return;
        }
        const changed = activeStores.get(token) !== body.p_store_id;
        activeStores.set(token, body.p_store_id);
        response.end(JSON.stringify({ ok: true, tenant_id: body.p_tenant_id, store_id: body.p_store_id, version: changed ? 2 : 1, changed }));
        return;
      }
      if (request.url.endsWith('/assert_service_tenant_store_context')) {
        response.end(JSON.stringify(
          body.p_tenant_id === '51000000-0000-0000-0000-000000000001'
          && body.p_store_id === '51100000-0000-0000-0000-000000000001'
        ));
        return;
      }
      if (/\/(issue_garage_invoice|void_garage_invoice|record_garage_payment|record_garage_payment_reversal)$/.test(request.url)) {
        let ok = true;
        let code = 'COMPLETED';
        if (token === 'viewer-token') { ok = false; code = 'ROLE_FORBIDDEN'; }
        else if (['inactive-token','other-tenant-token','other-store-token'].includes(token)) { ok = false; code = 'SCOPE_FORBIDDEN'; }
        else if (body.p_idempotency_key?.includes('different')) { ok = false; code = 'IDEMPOTENCY_CONFLICT'; }
        else if (body.p_idempotency_key?.includes('overpay')) { ok = false; code = 'OVERPAYMENT'; }
        else if (body.p_idempotency_key?.includes('over-refund')) { ok = false; code = 'REFUND_EXCEEDS_PAYMENT'; }
        response.end(JSON.stringify({ ok, code, invoiceId: body.p_invoice_id ?? 'fixture-invoice', paymentId: body.p_payment_id ?? 'fixture-payment' }));
        return;
      }
      if (/\/(create_sale_correction_case|transition_sale_correction_case|record_sale_correction_refund|complete_sale_correction_inspection|resolve_sale_correction_ownership|confirm_sale_correction_restock|resolve_sale_correction_external_procedure)$/.test(request.url)) {
        let ok = true;
        let code = request.url.endsWith('/create_sale_correction_case') ? 'CREATED' : 'COMPLETED';
        if (token === 'viewer-token') { ok = false; code = 'ROLE_FORBIDDEN'; }
        else if (['inactive-token','other-tenant-token','other-store-token'].includes(token)) { ok = false; code = 'SCOPE_FORBIDDEN'; }
        else if (token === 'staff-token' && !request.url.endsWith('/create_sale_correction_case')) { ok = false; code = 'ROLE_FORBIDDEN'; }
        else if (body.p_idempotency_key?.includes('active-case')) { ok = false; code = 'ACTIVE_CASE_EXISTS'; }
        else if (body.p_idempotency_key?.includes('over-refund')) { ok = false; code = 'REFUND_EXCEEDS_PAYMENT'; }
        else if (body.p_idempotency_key?.includes('incomplete')) { ok = false; code = 'SUBPROCESS_INCOMPLETE'; }
        response.end(JSON.stringify({ ok, code, caseId: body.p_case_id ?? 'fixture-correction-case', status: body.p_action ?? 'requested', refundId: 'fixture-refund' }));
        return;
      }
      let code = 'RESERVED';
      let ok = true;
      if (token === 'viewer-token') { ok = false; code = 'ROLE_FORBIDDEN'; }
      else if (['inactive-token','other-tenant-token','other-store-token'].includes(token)) { ok = false; code = 'SCOPE_FORBIDDEN'; }
      else if (body.p_idempotency_key?.includes('conflict')) { ok = false; code = 'ALREADY_RESERVED'; }
      else if (body.p_idempotency_key?.includes('idem-different')) { ok = false; code = 'IDEMPOTENCY_CONFLICT'; }
      else if (request.url.endsWith('/cancel_vehicle_sale')) { code = 'CANCELLED'; dealStatus = '失注'; vehicleStatus = '在庫中'; }
      else if (request.url.endsWith('/complete_vehicle_delivery')) { code = 'DELIVERED'; dealStatus = '成約'; vehicleStatus = '納車済み'; }
      else { dealStatus = '成約'; vehicleStatus = '売約済み'; }
      response.end(JSON.stringify({ ok, code, vehicleId: 'fixture-vehicle', dealId: body.p_deal_id, claimId: 'fixture-claim' }));
    });
    return;
  }
  if ((request.url?.startsWith('/rest/v1/memberships') || request.url?.startsWith('/rest/v1/current_user_active_store_membership')) && request.method === 'GET') {
    response.end(JSON.stringify({ tenant_id: '51000000-0000-0000-0000-000000000001', store_id: '51100000-0000-0000-0000-000000000001', role: token === 'viewer-token' ? 'viewer' : 'owner', display_name: 'Fixture User', email: 'fixture@example.invalid' }));
    return;
  }
  if (request.url?.startsWith('/rest/v1/line_link_connections') && request.method === 'GET') {
    if (request.url.includes('key_id=eq.default') && request.url.includes('store_id=eq.51100000-0000-0000-0000-000000000001')) {
      response.end(JSON.stringify({ tenant_id: '51000000-0000-0000-0000-000000000001', store_id: '51100000-0000-0000-0000-000000000001' }));
    } else response.end(JSON.stringify([]));
    return;
  }
  if (request.url?.startsWith('/rest/v1/line_link_inbound_nonces') && request.method === 'POST') {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const body = JSON.parse(raw || '{}');
      if (usedNonces.has(body.nonce)) {
        response.statusCode = 409;
        response.end(JSON.stringify({ code: '23505', message: 'duplicate' }));
      } else {
        usedNonces.add(body.nonce);
        response.statusCode = 201;
        response.end(JSON.stringify({}));
      }
    });
    return;
  }
  if (request.url?.startsWith('/rest/v1/line_link_inbound_nonces') && request.method === 'DELETE') {
    response.end(JSON.stringify([]));
    return;
  }
  if (request.url?.startsWith('/rest/v1/company_subscriptions') && request.method === 'GET') {
    response.end(JSON.stringify({ l_link_integration_enabled: true }));
    return;
  }
  if (request.url?.startsWith('/rest/v1/inspection_reminder_events') && request.method === 'GET') {
    response.end(JSON.stringify([]));
    return;
  }
  if (request.url?.startsWith('/rest/v1/stores') && request.method === 'GET') {
    response.end(JSON.stringify({ id: '51100000-0000-0000-0000-000000000001', tenant_id: '51000000-0000-0000-0000-000000000001', status: 'active', onboarding_completed_at: '2026-01-01T00:00:00Z' }));
    return;
  }
  if (request.url?.startsWith('/rest/v1/deals') && request.method === 'GET') {
    const deal = {
      id: 'fixture-deal', store_id: '51100000-0000-0000-0000-000000000001',
      customer_id: 'fixture-customer', vehicle_id: 'fixture-vehicle', deal_no: 'G3R-001',
      title: 'G3R架空商談', deal_type: '購入相談', status: dealStatus, probability: '高',
      source: 'fixture', budget: 1000000, trade_in_status: 'なし', loan_request: 'なし',
      next_action_at: null, assigned_user_name: 'Fixture User', line_status: '未案内', memo: null,
    };
    response.end(JSON.stringify(request.headers.accept?.includes('object+json') ? deal : [deal]));
    return;
  }
  if (request.url?.startsWith('/rest/v1/vehicles') && request.method === 'GET') {
    const vehicle = { id: 'fixture-vehicle', management_no: 'G3R-V1', registration_no: '架空', maker: 'Fixture', model_name: 'Vehicle', model_year: 2026, mileage_km: 0, base_price: 900000, total_price: 1000000, status: vehicleStatus, location_name: 'A1' };
    response.end(JSON.stringify(request.headers.accept?.includes('object+json') ? vehicle : [vehicle]));
    return;
  }
  if (request.url?.startsWith('/rest/v1/customers') && request.method === 'GET') {
    const customer = { id: 'fixture-customer', name: '架空顧客', phone: null, email: null, line_user_id: null, line_display_name: null, delivery_permission: false, customer_status: '見込み', desired_model: null, budget_min: null, budget_max: null };
    response.end(JSON.stringify(request.headers.accept?.includes('object+json') ? customer : [customer]));
    return;
  }
  if (request.url?.startsWith('/rest/v1/') && request.method === 'GET') {
    response.end(JSON.stringify([]));
    return;
  }
  if (request.url?.startsWith('/rest/v1/') && ['PATCH','POST','DELETE'].includes(request.method)) {
    response.end(JSON.stringify({}));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ message: 'not found' }));
});

server.listen(55432, '127.0.0.1');
