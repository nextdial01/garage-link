import { vehicleDate } from '@/lib/business/vehicleFields';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_VEHICLE_FIELDS, mobileVehicle } from '@/lib/mobile/dto';
import { logAudit } from '@/lib/audit/logAudit';

export async function GET(request: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { vehicleId } = await params;
  const [{ data: vehicle, error: vehicleError }, { data: files, error: filesError }] = await Promise.all([
    context.service.from('vehicles').select(MOBILE_VEHICLE_FIELDS).eq('id', vehicleId).eq('store_id', context.member.storeId).maybeSingle(),
    context.service.from('uploaded_files').select('id, purpose, file_type, mime_type, size_bytes, photo_category, created_at').eq('store_id', context.member.storeId).eq('related_type', 'vehicle').eq('related_id', vehicleId).eq('purpose', 'vehicle_image').is('deleted_at', null).order('created_at', { ascending: false }),
  ]);
  if (vehicleError) return Response.json({ ok: false, code: 'vehicle_read_failed', error: '車両を取得できませんでした。' }, { status: 500 });
  if (!vehicle) return Response.json({ ok: false, code: 'not_found', error: '車両が見つかりません。' }, { status: 404 });
  if (filesError) return Response.json({ ok: false, code: 'vehicle_files_failed', error: '車両画像を取得できませんでした。' }, { status: 500 });
  return Response.json({ ok: true, vehicle: mobileVehicle(vehicle as Record<string, unknown>), imageFiles: files ?? [] });
}


const editableText = (value: unknown, max: number) =>
  value === null ? null : typeof value === 'string' ? value.trim().slice(0, max) || null : undefined;
const editableMileage = (value: unknown) =>
  value === null ? null : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000 ? value : undefined;

export async function PUT(request: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (context.member.role === 'viewer') {
    return Response.json({ ok: false, code: 'forbidden_role', error: '閲覧権限では車両情報を変更できません。' }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ ok: false, code: 'invalid_request', error: '更新内容を確認してください。' }, { status: 400 });

  const mapping = [
    ['managementNo', 'management_no', 120],
    ['maker', 'maker', 120],
    ['modelName', 'model_name', 160],
    ['grade', 'grade', 160],
    ['registrationNo', 'registration_no', 120],
    ['color', 'color', 100],
    ['locationName', 'location_name', 120],
    ['description', 'description', 2_000],
  ] as const;
  if (Object.prototype.hasOwnProperty.call(body, 'maker') && !editableText(body.maker, 120)) {
    return Response.json({ ok: false, code: 'invalid_vehicle_update', error: 'メーカーは空欄にできません。' }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'modelName') && !editableText(body.modelName, 160)) {
    return Response.json({ ok: false, code: 'invalid_vehicle_update', error: '車名は空欄にできません。' }, { status: 400 });
  }

  const update: Record<string, string | number | null> = {};
  for (const [inputKey, column, max] of mapping) {
    if (!Object.prototype.hasOwnProperty.call(body, inputKey)) continue;
    const value = editableText(body[inputKey], max);
    if (value === undefined) return Response.json({ ok: false, code: 'invalid_vehicle_update', error: '車両情報を確認してください。' }, { status: 400 });
    update[column] = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'mileageKm')) {
    const mileage = editableMileage(body.mileageKm);
    if (mileage === undefined) return Response.json({ ok: false, code: 'invalid_vehicle_update', error: '走行距離を確認してください。' }, { status: 400 });
    update.mileage_km = mileage;
  }
  for (const [key, column] of [['inspectionExpiryDate','inspection_expiry_date'],['liabilityInsuranceExpiryDate','liability_insurance_expiry_date']] as const) {
    if (!(key in body)) continue;
    const value = vehicleDate(body[key]);
    if (value === undefined) return Response.json({ ok: false, error: '満了日はYYYY-MM-DD形式で入力してください。' }, { status: 400 });
    update[column] = value;
  }
  if (!Object.keys(update).length) {
    return Response.json({ ok: false, code: 'empty_update', error: '変更する項目がありません。' }, { status: 400 });
  }

  const { vehicleId } = await params;
  if ('maker' in update) {
    const { data: before } = await context.service.from('vehicles').select('maker').eq('id', vehicleId).eq('store_id', context.member.storeId).maybeSingle();
    if (before?.maker !== update.maker) {
      const { data: entry, error: masterError } = await context.service.from('store_master_entries').select('id').eq('store_id', context.member.storeId).eq('kind', 'vehicle_maker').eq('label', String(update.maker)).eq('is_active', true).maybeSingle();
      if (masterError || !entry) return Response.json({ ok: false, error: '有効なメーカーを選択してください。' }, { status: masterError ? 500 : 400 });
    }
  }
  const { data, error } = await context.service
    .from('vehicles')
    .update(update)
    .eq('id', vehicleId)
    .eq('store_id', context.member.storeId)
    .select(MOBILE_VEHICLE_FIELDS)
    .maybeSingle();
  if (error) return Response.json({ ok: false, code: 'vehicle_update_failed', error: '車両情報を更新できませんでした。' }, { status: 500 });
  if (!data) return Response.json({ ok: false, code: 'not_found', error: '車両が見つかりません。' }, { status: 404 });

  await logAudit({
    supabase: context.service,
    storeId: context.member.storeId,
    userId: context.user.id,
    userEmail: context.member.email,
    userRole: context.member.role,
    userDisplayName: context.member.displayName,
    action: 'update',
    targetType: 'vehicle',
    targetId: vehicleId,
    targetLabel: 'Vehicle fields',
    metadata: { source: 'native_mobile', fields: Object.keys(update) },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return Response.json({ ok: true, vehicle: mobileVehicle(data as Record<string, unknown>) });
}
