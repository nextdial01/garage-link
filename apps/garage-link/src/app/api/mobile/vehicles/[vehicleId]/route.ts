import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_VEHICLE_FIELDS, mobileVehicle } from '@/lib/mobile/dto';

export async function GET(request: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { vehicleId } = await params;
  const [{ data: vehicle, error: vehicleError }, { data: files, error: filesError }] = await Promise.all([
    context.service.from('vehicles').select(MOBILE_VEHICLE_FIELDS).eq('id', vehicleId).eq('store_id', context.member.storeId).maybeSingle(),
    context.service.from('uploaded_files').select('id, purpose, file_type, mime_type, size_bytes, created_at').eq('store_id', context.member.storeId).eq('related_type', 'vehicle').eq('related_id', vehicleId).eq('purpose', 'vehicle_image').is('deleted_at', null).order('created_at', { ascending: false }),
  ]);
  if (vehicleError) return Response.json({ ok: false, code: 'vehicle_read_failed', error: '車両を取得できませんでした。' }, { status: 500 });
  if (!vehicle) return Response.json({ ok: false, code: 'not_found', error: '車両が見つかりません。' }, { status: 404 });
  if (filesError) return Response.json({ ok: false, code: 'vehicle_files_failed', error: '車両画像を取得できませんでした。' }, { status: 500 });
  return Response.json({ ok: true, vehicle: mobileVehicle(vehicle as Record<string, unknown>), imageFiles: files ?? [] });
}
