// GARAGE LINK 側 S2S エンドポイントの静的安全性チェック（実 DB / 実 LINE 送信なし）。
// 既存 garage-link の検査スタイルに合わせて node スクリプト 1 本で完結。
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }
function read(rel) {
  const path = resolve(root, rel);
  assert(existsSync(path), `missing file: ${rel}`);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const sql = read('supabase/schema/042_line_link_inbound_nonces.sql');
assert(/create table if not exists public\.line_link_inbound_nonces/.test(sql), 'nonce table not created');
assert(/nonce text primary key/.test(sql), 'nonce must be PK');
assert(/enable row level security/.test(sql), 'RLS must be enabled on nonce table');
assert(/grant select, insert, delete on table public\.line_link_inbound_nonces to service_role/.test(sql), 'nonce table grants must be service_role only');
assert(!/grant.*to authenticated/.test(sql), 'nonce table must NOT grant to authenticated');
assert(/cleanup_line_link_inbound_nonces/.test(sql), 'cleanup function must exist');

const grants = read('supabase/schema/043_line_link_s2s_service_role_grants.sql');
assert(/grant select on table public\.inspection_reminder_events to service_role/.test(grants), 'inspection_reminder_events must grant select to service_role');
assert(!/grant.*inspection_reminder_events.*to authenticated/i.test(grants), 'inspection_reminder_events grant file must NOT widen authenticated access');
assert(!/grant.*inspection_reminder_events.*to anon/i.test(grants), 'inspection_reminder_events grant file must NOT widen anon access');

const s2s = read('src/lib/line-link/s2sAuth.ts');
assert(/server-only/.test(s2s), 's2sAuth.ts must be server-only');
assert(/createHmac\('sha256'/.test(s2s), 'must use HMAC-SHA256');
assert(/timingSafeEqual/.test(s2s), 'must use timing-safe comparison');
assert(/TIMESTAMP_TOLERANCE_SEC = 300/.test(s2s), 'timestamp tolerance must be 300s');
assert(/NONCE_TTL_MIN = 10/.test(s2s), 'nonce TTL must be 10 minutes');
assert(/X-LL-Key-Id|x-ll-key-id/.test(s2s), 'must read X-LL-Key-Id header');
assert(/x-ll-signature/.test(s2s), 'must read X-LL-Signature header');
assert(/x-ll-timestamp/.test(s2s), 'must read X-LL-Timestamp header');
assert(/x-ll-nonce/.test(s2s), 'must read X-LL-Nonce header');
assert(/x-ll-store-id/.test(s2s), 'must read X-LL-Store-Id header');
assert(/LL_INBOUND_S2S_SECRET__/.test(s2s), 'secret env var pattern must follow contract');
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

assert(!/api\.line\.me|messages\/push|messages\/multicast|messages\/broadcast/.test(s2s), 's2sAuth must not call LINE');
// Code (not comments) must not write secret into NextResponse.json / return body.
{
  const code = stripComments(s2s);
  assert(!/NextResponse\.json\s*\([^)]*secret/i.test(code), 's2sAuth must never include secret in JSON response');
  assert(!/console\.(log|warn|error|info)\s*\([^)]*secret/i.test(code), 's2sAuth must not log secret values');
}

const route = read('src/app/api/s2s/line-link/delivery-candidates/route.ts');
const routeCode = stripComments(route);
assert(/verifyLLinkS2SRequest/.test(routeCode), 'route must verify S2S signature');
assert(/SUPABASE_SERVICE_ROLE_KEY/.test(route), 'route must use service role key');
assert(!/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(route), 'route must not use anon key');
assert(/\.eq\('store_id', auth\.storeId\)/.test(routeCode), 'route must scope by signed storeId');
assert(/\.eq\('status', 'pending'\)/.test(routeCode), 'route must select pending only');
assert(!/api\.line\.me|messages\/push|messages\/multicast|messages\/broadcast/.test(routeCode), 'route must not call LINE');
assert(!/line_user_id/.test(routeCode), 'route response code must NOT include line_user_id');
assert(!/\bphone\b|\bemail\b/.test(routeCode), 'route response code must NOT include phone/email');
// Response shape locked to public fields only
assert(/event_id: row\.id/.test(route) && /reference_date: row\.inspection_expiry_date/.test(route),
  'route response shape must match contract');
// Must NOT alter inspection_reminder_events from the route file (nonce writes happen in s2sAuth, not here)
assert(!/inspection_reminder_events[\s\S]{0,200}\.(insert|update|upsert|delete)/.test(routeCode),
  'route must NOT write inspection_reminder_events');

if (failures.length > 0) {
  console.error('[check-line-link-s2s] FAIL');
  for (const m of failures) console.error('  - ' + m);
  process.exit(1);
}
console.log('[check-line-link-s2s] OK');
