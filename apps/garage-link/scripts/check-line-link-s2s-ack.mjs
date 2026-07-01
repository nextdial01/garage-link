// GARAGE LINK 側 S2S 確認応答（ACK）エンドポイントの静的安全性チェック（実 DB / 実 LINE 送信なし）。
// 既存 check-line-link-s2s.mjs のスタイルに合わせて node スクリプト 1 本で完結。
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
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const migrationSql = read('supabase/migrations/20260629000000_inspection_reminder_ack_fn.sql');
const schemaSql = read('supabase/schema/035_inspection_reminders.sql');

// --- SQL function contract (checked in both the migration and its schema/ mirror) ---
for (const [label, sql] of [['migration', migrationSql], ['schema/035', schemaSql]]) {
  assert(/create or replace function public\.acknowledge_inspection_reminder_events/.test(sql), `${label}: acknowledge_inspection_reminder_events not defined`);
  assert(/security definer/.test(sql), `${label}: function must be SECURITY DEFINER`);
  assert(/set search_path = public/.test(sql), `${label}: function must set an explicit search_path`);
  assert(/grant execute on function public\.acknowledge_inspection_reminder_events\(uuid, jsonb\) to service_role/.test(sql), `${label}: must grant execute to service_role`);
  assert(!/grant\s+update\s+on\s+table\s+public\.inspection_reminder_events/i.test(sql), `${label}: must NOT grant raw UPDATE on inspection_reminder_events`);
  assert(/e\.status = 'pending'/.test(sql), `${label}: must only transition pending events`);
  assert(/status = 'completed'/.test(sql), `${label}: must set status to completed on success`);
  assert(/already_acknowledged/.test(sql), `${label}: must report already_acknowledged for repeat acks`);
  assert(/'rejected'/.test(sql), `${label}: must report rejected for non-owned/non-pending events`);
  assert(/e\.store_id = p_store_id/.test(sql), `${label}: must scope every mutation by p_store_id`);
}

// migration and its schema/ mirror must not drift apart (same convention as the
// stale-event-invalidation change to generate_inspection_reminder_events).
function extractFn(sql) {
  const start = sql.indexOf('create or replace function public.acknowledge_inspection_reminder_events');
  const end = sql.indexOf('grant execute on function public.acknowledge_inspection_reminder_events', start);
  return sql.slice(start, end === -1 ? undefined : end).trim();
}
assert(
  extractFn(migrationSql) === extractFn(schemaSql),
  'schema/035 and the migration must define an identical acknowledge_inspection_reminder_events function (no drift)'
);

// --- Route contract ---
const route = read('src/app/api/s2s/line-link/delivery-candidates/ack/route.ts');
const routeCode = stripComments(route);
assert(/export async function POST/.test(routeCode), 'ack route must export POST');
assert(!/export async function GET/.test(routeCode), 'ack route must not accept GET');
assert(/verifyLLinkS2SRequest/.test(routeCode), 'ack route must verify S2S signature');
assert(/auth\.storeId/.test(routeCode), 'ack route must use the HMAC-verified store id');
assert(/p_store_id:\s*auth\.storeId/.test(routeCode), 'ack route must pass auth.storeId (not a body field) as p_store_id');
assert(!/body\.store_id|parsedBody\.store_id|acknowledgements\.store_id/i.test(routeCode), 'ack route must never read store_id from the request body');
assert(/SUPABASE_SERVICE_ROLE_KEY/.test(route), 'ack route must use the service role key');
assert(!/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(route), 'ack route must not use the anon key');
assert(!/api\.line\.me|messages\/push|messages\/multicast|messages\/broadcast/.test(routeCode), 'ack route must not call LINE');
assert(/acknowledge_inspection_reminder_events/.test(routeCode), 'ack route must call the acknowledge RPC');
assert(/logServerError/.test(routeCode), 'ack route must log failures via logServerError');
assert(/line_link_s2s_ack_failed/.test(routeCode), 'ack route must use the line_link_s2s_ack_failed log code');
// Code (not comments) must never leak secrets.
{
  const code = stripComments(route);
  assert(!/NextResponse\.json\s*\([^)]*secret/i.test(code), 'ack route must never include secret in JSON response');
  assert(!/console\.(log|warn|error|info)\s*\([^)]*secret/i.test(code), 'ack route must not log secret values');
}

// --- The existing candidate pull route must remain untouched by this change ---
const pullRoute = read('src/app/api/s2s/line-link/delivery-candidates/route.ts');
const pullRouteCode = stripComments(pullRoute);
assert(/\.eq\('status', 'pending'\)/.test(pullRouteCode), 'existing pull route must remain read-only (status=pending filter unchanged)');
assert(
  !/\.update\(|\.upsert\(|\.insert\(|\.delete\(/.test(pullRouteCode),
  'existing pull route must remain purely read-only (no write methods introduced)'
);

if (failures.length > 0) {
  console.error('[check-line-link-s2s-ack] FAIL');
  for (const m of failures) console.error('  - ' + m);
  process.exit(1);
}
console.log('[check-line-link-s2s-ack] OK');
