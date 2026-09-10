import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { mobileVehicle, MOBILE_VEHICLE_FIELDS } from '@/lib/mobile/dto';
import { logAudit } from '@/lib/audit/logAudit';

const MOBILE_EDITABLE_STATUSES = new Set(['在庫中', '展示中', '商談中', '整備中']);

export async function PUT(request: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  if (context.member.role === 'viewer') return Response.json({ ok: false, code: 'forbidden_role', error: '閲覧権限では車両状態を変更できません。' }, { status: 403 });
  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  const status = typeof body?.status === 'string' ? body.status.trim() : '';
  if (!MOBILE_EDITABLE_STATUSES.has(status)) return Response.json({ ok: false, code: 'invalid_status', error: 'この状態はアプリから変更できません。' }, { status: 400 });
  const { vehicleId } = await params;
  const { data, error } = await context.service.from('vehicles').update({ status }).eq('id', vehicleId).eq('store_id', context.member.storeId).neq('status', status).select(MOBILE_VEHICLE_FIELDS).maybeSingle();
  if (error) return Response.json({ ok: false, code: 'vehicle_status_failed', error: '車両状態を更新できませんでした。' }, { status: 500 });
  if (!data) {
    const { data: unchanged } = await context.service.from('vehicles').select(MOBILE_VEHICLE_FIELDS).eq('id', vehicleId).eq('store_id', context.member.storeId).eq('status', status).maybeSingle();
    if (!unchanged) return Response.json({ ok: false, code: 'not_found', error: '車両が見つかりません。' }, { status: 404 });
    return Response.json({ ok: true, idempotent: true, vehicle: mobileVehicle(unchanged as Record<string, unknown>) });
  }
  await logAudit({ supabase: context.service, storeId: context.member.storeId, userId: context.user.id, userEmail: context.member.email, userRole: context.member.role, userDisplayName: context.member.displayName, action: 'update', targetType: 'vehicle', targetId: vehicleId, targetLabel: 'Vehicle status', metadata: { source: 'native_mobile', status }, ipAddress: context.ipAddress, userAgent: context.userAgent });
  return Response.json({ ok: true, vehicle: mobileVehicle(data as Record<string, unknown>) });
}
