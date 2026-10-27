'use server';
import 'server-only';
import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createBearerAuthClient } from '@/lib/supabase/admin';

const OWNER = '14cbd9ff-779e-4893-8ca8-5a0ce73e66fb';
const STORE = '45d624bb-37ca-4183-a5c4-8ed932a69616';
const TENANT = '4f2c6f87-524c-4b50-9b22-48928603c24c';
const CUSTOMER = '41551ac2-6a9a-4863-8fb0-4db9c746633f';
const BUSINESS_URL = `https://garage-link.tech/api/mobile/v2/customers/${CUSTOMER}`;
const PURPOSE = 'KANNAGI/QA/G/XQ01/held-access-token/current-alias-v2';
type RuntimeIdentity = {deployment_id:string;release_sha:string};
function runtimeIdentity():RuntimeIdentity|null {
 const deployment_id=process.env.VERCEL_DEPLOYMENT_ID??'';
 const git=process.env.VERCEL_GIT_COMMIT_SHA??'';
 const release_sha=process.env.KANNAGI_RELEASE_SHA??git;
 if(!/^dpl_[A-Za-z0-9]+$/.test(deployment_id)||!/^[0-9a-f]{40}$/.test(release_sha)||(git!==''&&git!==release_sha))return null;
 return {deployment_id,release_sha};
}
export async function sessionExpiryReadiness(){return runtimeIdentity();}

type Receipt = { v: 1; releaseSha:string; purpose: string; subject: string; tenant: string; store: string; tokenHash: string; issued: number; exp: number };
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const safe = (code: string, seconds: number | null = null, receipt: string | null = null, validGetStatus: number | null = null, runtime: RuntimeIdentity|null = null) => ({ code, seconds_until_expiry: seconds, receipt, valid_get_status: validGetStatus, capture_runtime:runtime });
const result = (code: string, getStatus: number | null = null, patchStatus: number | null = null) => ({ code, get_status: getStatus, patch_status: patchStatus, evidence_class: 'real_expired_token_normal_Garage_mobile_business_routes' });

async function admit() {
  const requestHeaders = await headers();
  if (requestHeaders.get('origin') !== 'https://garage-link.tech' || requestHeaders.get('sec-fetch-site') !== 'same-origin') return false;
  const now = Date.now(), expiry = Number(process.env.GARAGE_QA_S2S_BOUNDARY_EXPIRES_AT ?? '0');
  if (process.env.GARAGE_QA_S2S_BOUNDARY_ENABLED !== '1' || !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 600_000) return false;
  const user = await createClient();
  const { data, error } = await user.auth.getUser();
  if (error || data.user?.id !== OWNER) return false;
  const { data: member, error: memberError } = await user.from('current_user_active_store_membership')
    .select('tenant_id,store_id,role').eq('user_id', OWNER).eq('status', 'active').single();
  return !memberError && !!member && typeof member === 'object' && 'tenant_id' in member && 'store_id' in member && 'role' in member
    && member.tenant_id === TENANT && member.store_id === STORE && member.role === 'owner';
}

function receiptKey() {
  const secret = process.env.LL_INBOUND_S2S_SECRET__DEFAULT;
  return secret && secret.length >= 32 ? crypto.createHmac('sha256', secret).update(`${PURPOSE}/key`).digest() : null;
}
function sign(payload: Receipt, key: Buffer) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', key).update(`${PURPOSE}\n${body}`).digest('base64url')}`;
}
function validReceipt(receipt: string, token: string, now: number) {
  try {
    const key = receiptKey();
    const runtime=runtimeIdentity();
    if (!key || !runtime || receipt.length > 2048) return false;
    const parts = receipt.split('.');
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
    const payload: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const value = payload as Record<string, unknown>;
    if (Object.keys(value).sort().join(',') !== 'exp,issued,purpose,releaseSha,store,subject,tenant,tokenHash,v'
      || value.v !== 1 || value.releaseSha !== runtime.release_sha || value.purpose !== PURPOSE || value.subject !== OWNER || value.tenant !== TENANT || value.store !== STORE
      || value.tokenHash !== hash(token) || typeof value.issued !== 'number' || typeof value.exp !== 'number'
      || !Number.isSafeInteger(value.issued) || !Number.isSafeInteger(value.exp)
      || value.exp <= value.issued || value.exp > value.issued + 86_400
      || now <= value.exp * 1000 || now > value.exp * 1000 + 300_000) return false;
    const expected = crypto.createHmac('sha256', key).update(`${PURPOSE}\n${parts[0]}`).digest('base64url');
    const actualBytes = Buffer.from(parts[1]), expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
  } catch { return false; }
}

let captureAttempted = false;
export async function captureGarageExpiry(token: string) {
  try {
    if (typeof token !== 'string' || !token || token.length > 16384 || !await admit()) return safe('DENIED');
    const runtime=runtimeIdentity();
    if(!runtime)return safe('DEPENDENCY_RUNTIME_IDENTITY');
    const auth = createBearerAuthClient();
    if (!auth) return safe('DEPENDENCY_AUTH_CONFIG');
    const verified = await auth.auth.getUser(token);
    if (verified.error || verified.data.user?.id !== OWNER) return safe('VALID_CAPTURE_REQUIRED');
    const exp: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
    const issued = Math.floor(Date.now() / 1000);
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= issued || exp > issued + 86_400) return safe('INVALID_EXPIRY_METADATA');
    const key = receiptKey();
    if (!key) return safe('DEPENDENCY_RECEIPT_KEY');
    if (captureAttempted) return safe('BUSINESS_CAPTURE_ALREADY_CONSUMED');
    captureAttempted = true;
    const positive = await fetch(BUSINESS_URL, { method: 'GET', headers: { Authorization: `Bearer ${token}`, 'x-garage-store-id': STORE }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    const validGetStatus = positive.status;
    await positive.body?.cancel().catch(() => undefined);
    if (validGetStatus !== 200) return safe('STOP_UNEXPECTED_BUSINESS_VALID_READ_STATUS', exp - issued, null, validGetStatus);
    return safe('VALID_TOKEN_CAPTURED', exp - issued, sign({ v: 1, releaseSha:runtime.release_sha, purpose: PURPOSE, subject: OWNER, tenant: TENANT, store: STORE, tokenHash: hash(token), issued, exp }, key), validGetStatus, runtime);
  } catch { return safe('UNKNOWN_CAPTURE'); }
}

// Module memory protects one instance; it is not a durable cross-instance lock.
// The browser latch and the parent's attempt-before-click ledger are required.
let businessAttempted = false;
export async function probeGarageExpiredBusinessRoutes(token: string, receipt: string) {
  let getStatus: number | null = null, patchStatus: number | null = null;
  try {
    if (typeof token !== 'string' || !token || token.length > 16384 || typeof receipt !== 'string' || receipt.length > 2048 || !await admit()) return result('DENIED');
    if (!validReceipt(receipt, token, Date.now())) return result('DEPENDENCY_REAL_EXPIRY_OR_RECEIPT');
    if (businessAttempted) return result('BUSINESS_CASE_ALREADY_CONSUMED');
    businessAttempted = true;
    const requestHeaders = { Authorization: `Bearer ${token}`, 'x-garage-store-id': STORE };
    const first = await fetch(BUSINESS_URL, { method: 'GET', headers: requestHeaders, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    getStatus = first.status;
    await first.body?.cancel().catch(() => undefined);
    if (getStatus !== 401 && getStatus !== 403) return result('STOP_UNEXPECTED_BUSINESS_READ_STATUS', getStatus);
    // This fixed synthetic contactless customer's memo is the only possible
    // update if authentication unexpectedly passes. There is no send operation.
    const second = await fetch(BUSINESS_URL, { method: 'PATCH', headers: { ...requestHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ memo: 'QA_SESSION_EXPIRY_NO_DELIVERY' }), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    patchStatus = second.status;
    await second.body?.cancel().catch(() => undefined);
    return result(patchStatus === 401 || patchStatus === 403 ? 'BUSINESS_READ_WRITE_REJECTED_AFTER_REAL_EXPIRY' : 'STOP_UNEXPECTED_BUSINESS_WRITE_STATUS', getStatus, patchStatus);
  } catch { return result('UNKNOWN_BUSINESS_OUTCOME_NO_RETRY', getStatus, patchStatus); }
}
