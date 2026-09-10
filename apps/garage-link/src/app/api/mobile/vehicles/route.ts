import { mobileReadPage, mobileReadResult, mobileReadHeaders } from '@/lib/mobile/pagination';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_VEHICLE_FIELDS, mobileVehicle } from '@/lib/mobile/dto';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const page = mobileReadPage(request);
  if (!page) return Response.json({ ok: false, code: 'invalid_page', error: '一覧の取得条件が正しくありません。' }, { status: 400 });
  const term = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  let query = context.service.from('vehicles').select(MOBILE_VEHICLE_FIELDS).eq('store_id', context.member.storeId).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit);
  if (term) {
    const escaped = term.slice(0, 100).replace(/[\\%_,()"']/g, ' ');
    if (escaped) query = query.or(`management_no.ilike.%${escaped}%,maker.ilike.%${escaped}%,model_name.ilike.%${escaped}%,registration_no.ilike.%${escaped}%`);
  }
  const { data, error } = await query;
  if (error) return Response.json({ ok: false, code: 'vehicle_list_failed', error: '車両を取得できませんでした。' }, { status: 500 });
  const result = mobileReadResult(data ?? [], page);
  return Response.json({ ok: true, vehicles: result.rows.map((row) => mobileVehicle(row as Record<string, unknown>)), nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
}
