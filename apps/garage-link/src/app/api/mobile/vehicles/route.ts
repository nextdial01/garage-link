import { mobileReadPage, mobileReadResult, mobileReadHeaders } from '@/lib/mobile/pagination';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_VEHICLE_FIELDS, mobileVehicle } from '@/lib/mobile/dto';
import { assertVehicleLimitAvailable, VEHICLE_LIMIT_MESSAGE } from '@/lib/billing/garageSubscription';
import { logAudit } from '@/lib/audit/logAudit';

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


const MOBILE_CREATE_STATUSES = new Set(['在庫中', '展示中', '商談中', '整備中']);
const cleanText = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const cleanMileage = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000 ? value : null;

export async function POST(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (context.member.role === 'viewer') {
    return Response.json({ ok: false, code: 'forbidden_role', error: '閲覧権限では車両を登録できません。' }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ ok: false, code: 'invalid_request', error: '車両情報を確認してください。' }, { status: 400 });

  const vin = cleanText(body.vin, 120);
  const maker = cleanText(body.maker, 120);
  const modelName = cleanText(body.modelName, 160);
  const status = cleanText(body.status, 40) ?? '在庫中';
  const mileageKm = body.mileageKm === undefined ? null : cleanMileage(body.mileageKm);
  if (!vin || !maker || !modelName || !MOBILE_CREATE_STATUSES.has(status) || (body.mileageKm !== undefined && mileageKm === null)) {
    return Response.json({ ok: false, code: 'invalid_vehicle', error: '車台番号・メーカー・車名・走行距離を確認してください。' }, { status: 400 });
  }

  try {
    await assertVehicleLimitAvailable(context.service as unknown as Parameters<typeof assertVehicleLimitAvailable>[0], context.member.storeId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return Response.json({
      ok: false,
      code: message === VEHICLE_LIMIT_MESSAGE ? 'vehicle_limit_reached' : 'vehicle_limit_check_failed',
      error: message === VEHICLE_LIMIT_MESSAGE ? VEHICLE_LIMIT_MESSAGE : '登録可能台数を確認できませんでした。',
    }, { status: message === VEHICLE_LIMIT_MESSAGE ? 409 : 500 });
  }

  const payload = {
    store_id: context.member.storeId,
    management_no: cleanText(body.managementNo, 120),
    vin,
    maker,
    model_name: modelName,
    registration_no: cleanText(body.registrationNo, 120),
    mileage_km: mileageKm,
    color: cleanText(body.color, 100),
    location_name: cleanText(body.locationName, 120),
    status,
    description: cleanText(body.description, 2_000),
  };
  const { data, error } = await context.service
    .from('vehicles')
    .insert(payload)
    .select(MOBILE_VEHICLE_FIELDS)
    .single();
  if (error || !data) {
    return Response.json({ ok: false, code: 'vehicle_create_failed', error: '車両を登録できませんでした。' }, { status: 500 });
  }

  await logAudit({
    supabase: context.service,
    storeId: context.member.storeId,
    userId: context.user.id,
    userEmail: context.member.email,
    userRole: context.member.role,
    userDisplayName: context.member.displayName,
    action: 'create',
    targetType: 'vehicle',
    targetId: String(data.id),
    targetLabel: [maker, modelName].filter(Boolean).join(' '),
    metadata: { source: 'native_mobile' },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return Response.json({ ok: true, vehicle: mobileVehicle(data as Record<string, unknown>) }, { status: 201 });
}
