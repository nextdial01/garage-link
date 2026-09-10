import { listGarageMobileStores } from '@/lib/mobile/bearerAuth';

export async function GET(request: Request) {
  const context = await listGarageMobileStores(request);
  if (!context.ok) return context.response;
  return Response.json({ ok: true, stores: context.stores.map((store) => ({ id: store.id, tenantId: store.tenantId, name: store.name, role: store.role })) });
}
