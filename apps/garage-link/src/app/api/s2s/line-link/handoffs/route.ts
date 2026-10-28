import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyLLinkS2SRequest } from '@/lib/line-link/s2sAuth';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';
import { assertServiceTenantStoreContext } from '@/lib/security/garageTenantContext';
import { isUuid, readHandoffBody } from '@/lib/line-link/handoffs';
export const dynamic = 'force-dynamic';
const fail = (status: number, code: string) => NextResponse.json({ ok: false, code }, { status });
export async function POST(request: Request) {
 try {
  const body = await readHandoffBody(request, 4096); if (body.length > 4096) return fail(413, 'invalid_body');
  const auth = await verifyLLinkS2SRequest({ method: 'POST', path: new URL(request.url).pathname, headers: request.headers, body });
  if (!auth.ok) return fail(auth.status, auth.code);
  if (!await canStoreUseLLink(auth.context)) return fail(403, 'feature_preparing');
  let input: Record<string, unknown>; try { input = JSON.parse(body); } catch { return fail(400, 'invalid_body'); }
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['read', 'validate', 'ack'].includes(String(input.mode)) || !isUuid(input.request_id) || input.store_id !== auth.storeId || Object.keys(input).sort().join(',') !== (input.mode === 'ack' ? 'broadcast_id,mode,request_id,store_id' : 'mode,request_id,store_id') || (input.mode === 'ack' && !isUuid(input.broadcast_id))) return fail(400, 'invalid_body');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail(503, 'unavailable');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await assertServiceTenantStoreContext(db, auth.context);
  const { data: row, error } = await db.from('garage_link_handoffs').select('id,store_id,customer_id,kind,source_id,source_version,vehicle_id,payload,status,l_broadcast_id,created_at,revoked_at').eq('store_id', auth.storeId).eq('id', input.request_id).maybeSingle();
  if (error || !row) return fail(404, 'not_found');
  const validation = await db.rpc('garage_link_validate_handoff', { p_store_id: auth.storeId, p_request_id: input.request_id });
  if (validation.error || typeof validation.data !== 'boolean') return fail(503, 'validation_unavailable');
  const eligible = validation.data;
  if (input.mode === 'validate') return NextResponse.json({ ok: true, store_id: auth.storeId, eligible });
  if (!eligible) return fail(409, 'source_changed');
  if (input.mode === 'ack') {
   const result = await db.rpc('garage_link_ack_handoff', { p_store_id: auth.storeId, p_request_id: input.request_id, p_broadcast_id: input.broadcast_id });
   if (result.error) return fail(409, 'ack_conflict');
   return NextResponse.json({ ok: true, store_id: auth.storeId, request_id: input.request_id, broadcast_id: input.broadcast_id });
  }
  const { id, store_id, customer_id, kind, source_id, source_version, created_at, payload, status, l_broadcast_id } = row;
  return NextResponse.json({ ok: true, store_id: auth.storeId, handoff: { id, store_id, customer_id, kind, source_id, source_version, created_at, payload, status, l_broadcast_id } });
 } catch { return fail(500, 'handoff_failed'); }
}
