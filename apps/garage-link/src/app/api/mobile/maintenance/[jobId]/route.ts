import { createHash } from 'node:crypto';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { logAudit } from '@/lib/audit/logAudit';
import { withMaintenanceIdentity } from '@/lib/mobile/maintenanceIdentity';

const FIELDS = 'id, customer_id, vehicle_id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, estimated_total_amount, assigned_user_name, updated_at';
const UPDATABLE = new Set(['received', 'estimating', 'waiting', 'working', 'completed']);
const KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;
const dateValue = (value: unknown) => value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value))) ? value : undefined;

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await getGarageMobileBearerContext(request); if (!context.ok) return context.response;
  const { jobId } = await params; const { data, error } = await context.service.from('maintenance_jobs').select(FIELDS).eq('id', jobId).eq('store_id', context.member.storeId).is('deleted_at', null).maybeSingle();
  if (error) return Response.json({ ok: false, code: 'maintenance_read_failed', error: '整備案件を取得できませんでした。' }, { status: 500 });
  if (!data) return Response.json({ ok: false, code: 'not_found', error: '整備案件が見つかりません。' }, { status: 404 });
  try {
    const [job] = await withMaintenanceIdentity(context.service, context.member.storeId, [data]);
    return Response.json({ ok: true, job });
  } catch {
    return Response.json({ ok: false, code: 'maintenance_identity_read_failed', error: '整備案件を取得できませんでした。' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await getGarageMobileBearerContext(request); if (!context.ok) return context.response;
  if (context.member.role === 'viewer') return Response.json({ ok: false, code: 'forbidden_role', error: '閲覧権限では整備案件を更新できません。' }, { status: 403 });
  const body = await request.json().catch(() => null) as { status?: unknown; scheduledDeliveryAt?: unknown } | null;
  const status = typeof body?.status === 'string' ? body.status : '';
  const delivery = dateValue(body?.scheduledDeliveryAt);
  const deliveryPresent = Boolean(body && Object.prototype.hasOwnProperty.call(body, 'scheduledDeliveryAt'));
  const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() ?? '';
  if (!UPDATABLE.has(status) || !KEY_RE.test(idempotencyKey) || (deliveryPresent && delivery === undefined)) return Response.json({ ok: false, code: 'invalid_request', error: '更新内容または操作IDが正しくありません。' }, { status: 400 });
  const { jobId } = await params;
  const fingerprint = createHash('sha256').update(JSON.stringify({ status, scheduledDeliveryAt: deliveryPresent ? delivery : '__omitted__' })).digest('hex');
  const { data, error } = await context.service.rpc('garage_mobile_update_maintenance', {
    p_store_id: context.member.storeId, p_job_id: jobId, p_actor_user_id: context.user.id, p_actor_role: context.member.role,
    p_idempotency_key: idempotencyKey, p_request_fingerprint: fingerprint, p_status: status, p_delivery_present: deliveryPresent, p_delivery_at: delivery ?? null,
  });
  if (error || !data || typeof data !== 'object') return Response.json({ ok: false, code: 'maintenance_update_failed', error: '整備案件を更新できませんでした。' }, { status: 500 });
  const result = data as { outcome?: string; job?: Record<string, unknown> };
  if (result.outcome === 'conflict') return Response.json({ ok: false, code: 'idempotency_conflict', error: '同じ操作IDに異なる更新内容は使用できません。' }, { status: 409 });
  if (result.outcome === 'not_found') return Response.json({ ok: false, code: 'not_found', error: '整備案件が見つかりません。' }, { status: 404 });
  if (!result.job) return Response.json({ ok: false, code: 'maintenance_update_failed', error: '整備案件を更新できませんでした。' }, { status: 500 });
  const { data: job, error: readError } = await context.service.from('maintenance_jobs').select(FIELDS).eq('id', jobId).eq('store_id', context.member.storeId).is('deleted_at', null).maybeSingle();
  if (readError || !job) return Response.json({ ok: false, code: 'maintenance_readback_failed', error: '更新後の整備案件を取得できませんでした。' }, { status: 500 });
  if (result.outcome === 'updated') await logAudit({ supabase: context.service, storeId: context.member.storeId, userId: context.user.id, userEmail: context.member.email, userRole: context.member.role, userDisplayName: context.member.displayName, action: 'update', targetType: 'maintenance_job', targetId: jobId, targetLabel: typeof job.job_no === 'string' ? job.job_no : jobId, metadata: { source: 'native_mobile', status, delivery_present: deliveryPresent, operation_key_hash_present: true }, ipAddress: context.ipAddress, userAgent: context.userAgent });
  try {
    const [identifiedJob] = await withMaintenanceIdentity(context.service, context.member.storeId, [job]);
    return Response.json({ ok: true, idempotent: result.outcome === 'replayed', job: identifiedJob });
  } catch {
    return Response.json({ ok: false, code: 'maintenance_identity_read_failed', error: '整備案件を取得できませんでした。' }, { status: 500 });
  }
}
