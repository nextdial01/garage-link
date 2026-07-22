import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const read = (path) => {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) failures.push(`missing file: ${path}`);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};
const assert = (condition, message) => { if (!condition) failures.push(message); };
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const migration = read('supabase/migrations/20260718000200_l_link_inquiry_identity.sql');
assert(/external_response_id text/.test(migration), 'external response identity column is required');
assert(/unique index[\s\S]*store_id, external_source, external_response_id/.test(migration), 'external identity must be unique per store');
assert(/grant select, insert on table public\.line_form_responses to service_role/.test(migration), 'S2S service role must have least-privilege inquiry access');

const route = read('src/app/api/s2s/line-link/inquiries/route.ts');
const code = codeOnly(route);
assert(/verifyLLinkS2SRequest/.test(code), 'route must verify HMAC authentication');
assert(/MAX_BODY_BYTES = 64 \* 1024/.test(code), 'route must bound request size');
assert(/\.eq\('store_id', auth\.storeId\)/.test(code), 'lookup must use signed store id');
assert(/store_id: auth\.storeId/.test(code), 'insert must use signed store id');
assert(/external_source: 'l-link'/.test(code), 'insert must identify L-LINK source');
assert(/createError\.code === '23505'/.test(code), 'route must handle concurrent duplicate delivery');
assert(!/line_user_id/.test(code), 'route must not accept or store LINE user id');
assert(!/api\.line\.me|messages\/push|messages\/multicast/.test(code), 'route must not send LINE messages');

const middleware = codeOnly(read('src/middleware.ts'));
assert(/pathname\.startsWith\('\/api\/s2s\/line-link\/'\)/.test(middleware), 'middleware must pass S2S routes to HMAC authentication');

if (failures.length) {
  console.error('[check-l-link-inquiry-s2s] FAIL');
  failures.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}
console.log('[check-l-link-inquiry-s2s] OK');
