import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyLLinkS2SRequest } from '@/lib/line-link/s2sAuth';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';
import { assertServiceTenantStoreContext } from '@/lib/security/garageTenantContext';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = () => NextResponse.json({ ok: false, code: 'invalid_body', error: '確認対象の配信候補が不正です。' }, { status: 400 });
const failed = () => NextResponse.json({ ok: false, code: 'validation_failed', error: '配信候補の最新状態を確認できませんでした。' }, { status: 500 });

// Read only. Authenticate the exact signed path/body/store before querying.
// Completed means imported/ACKed, so it must remain eligible for validation.
export async function POST(request: Request) {
  let body: string;
  try { body = await request.text(); } catch { return invalid(); }
  if (Buffer.byteLength(body, 'utf8') > 16_384) return invalid();
  const auth = await verifyLLinkS2SRequest({ method: 'POST', path: new URL(request.url).pathname, headers: request.headers, body });
  if (!auth.ok) return NextResponse.json({ ok: false, code: auth.code, error: auth.error }, { status: auth.status });
  if (!(await canStoreUseLLink(auth.context))) {
    return NextResponse.json({ ok: false, code: 'feature_preparing', error: 'L-LINK連携は現在提供準備中です。' }, { status: 403 });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return invalid(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid();
  const ids = (parsed as { event_ids?: unknown }).event_ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200
    || ids.some(id => typeof id !== 'string' || !UUID.test(id))) return invalid();
  const eventIds = (ids as string[]).map(id => id.toLowerCase());
  if (new Set(eventIds).size !== eventIds.length) return invalid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return failed();
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await assertServiceTenantStoreContext(db, auth.context);
    const { data, error } = await db.rpc('validate_garage_delivery_candidates', {
      p_company_id: auth.context.tenantId,
      p_store_id: auth.context.storeId,
      p_event_ids: eventIds,
      p_key_id: auth.keyId,
    });
    if (error || !Array.isArray(data) || data.length !== eventIds.length) return failed();
    const remaining = new Set(eventIds);
    const results: Array<{ event_id: string; eligible: boolean }> = [];
    for (const row of data as Array<{ event_id?: unknown; eligible?: unknown }>) {
      if (typeof row.event_id !== 'string' || !remaining.delete(row.event_id.toLowerCase()) || typeof row.eligible !== 'boolean') return failed();
      results.push({ event_id: row.event_id.toLowerCase(), eligible: row.eligible });
    }
    if (remaining.size) return failed();
    return NextResponse.json({ ok: true, store_id: auth.context.storeId, results });
  } catch {
    return failed();
  }
}
