import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { uuid } from '@/lib/mobile/v2Resources';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const url = new URL(request.url);
  const type = url.searchParams.get('relatedType');
  const id = url.searchParams.get('relatedId');
  if ((type !== 'vehicle' && type !== 'maintenance_job' && type !== 'trade_in_vehicle') || !uuid(id)) return Response.json({ ok: false, code: 'invalid_related_resource' }, { status: 400 });
  const table = type === 'vehicle' ? 'vehicles' : type === 'maintenance_job' ? 'maintenance_jobs' : 'trade_in_vehicles';
  const { data: related } = await context.service.from(table).select('id').eq('id', id).eq('store_id', context.member.storeId).maybeSingle();
  if (!related) return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
  const { data, error } = await context.service.from('uploaded_files').select('id,photo_category,mime_type,created_at').eq('store_id', context.member.storeId).eq('related_type', type).eq('related_id', id).eq('purpose', 'vehicle_image').is('deleted_at', null).order('created_at', { ascending: false }).limit(50);
  return error ? Response.json({ ok: false, code: 'photos_read_failed' }, { status: 500 }) : Response.json({ ok: true, photos: data ?? [] });
}
