import { selectGarageMobileStore } from '@/lib/mobile/bearerAuth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  // Cookie-only cross-site requests cannot mutate the active store. Native
  // callers provide a validated Bearer, and no cookie auth fallback exists.
  if (!request.headers.get('authorization')?.match(/^Bearer\s+\S+/i)) {
    return Response.json({ ok: false, code: 'unauthorized' }, { status: 401 });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ ok: false, code: 'invalid_request' }, { status: 415 });
  }
  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (typeof input.tenantId !== 'string' || typeof input.storeId !== 'string'
    || !UUID.test(input.tenantId) || !UUID.test(input.storeId)) {
    return Response.json({ ok: false, code: 'invalid_store' }, { status: 400 });
  }
  const result = await selectGarageMobileStore(request, input.tenantId, input.storeId);
  if (!result.ok) return result.response;
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
