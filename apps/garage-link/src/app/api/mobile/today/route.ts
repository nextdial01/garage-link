import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { withMaintenanceIdentity } from '@/lib/mobile/maintenanceIdentity';

function todayRange() {
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request); if (!context.ok) return context.response;
  const { start, end } = todayRange(); const assigned = context.member.displayName;
  const [appointments, deliveries, incomplete, assignedWork] = await Promise.all([
    context.service.from('appointments').select('id, appointment_type, scheduled_at, status, customer_id, vehicle_id, deal_id, assigned_user_name, note').eq('store_id', context.member.storeId).gte('scheduled_at', start).lt('scheduled_at', end).neq('status', 'キャンセル').order('scheduled_at'),
    context.service.from('maintenance_jobs').select('id, job_no, job_type, status, scheduled_delivery_at, customer_id, vehicle_id, assigned_user_name').eq('store_id', context.member.storeId).gte('scheduled_delivery_at', start).lt('scheduled_delivery_at', end).is('deleted_at', null).order('scheduled_delivery_at'),
    context.service.from('maintenance_jobs').select('id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, customer_id, vehicle_id, assigned_user_name').eq('store_id', context.member.storeId).is('deleted_at', null).not('status', 'in', '(completed,delivered,cancelled)').order('scheduled_delivery_at').limit(100),
    assigned ? context.service.from('maintenance_jobs').select('id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, customer_id, vehicle_id, assigned_user_name').eq('store_id', context.member.storeId).eq('assigned_user_name', assigned).is('deleted_at', null).not('status', 'in', '(completed,delivered,cancelled)').order('scheduled_delivery_at').limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  if (appointments.error || deliveries.error || incomplete.error || assignedWork.error) return Response.json({ ok: false, code: 'today_read_failed', error: '今日の作業を取得できませんでした。' }, { status: 500 });
  try {
    const maintenanceRows = [...(deliveries.data ?? []), ...(incomplete.data ?? []), ...(assignedWork.data ?? [])];
    const identities = await withMaintenanceIdentity(context.service, context.member.storeId, maintenanceRows);
    const identityById = new Map(identities.map((item) => [String(item.id), { customerName: item.customerName, vehicleLabel: item.vehicleLabel }]));
    const identify = <T extends { id: string }>(rows: T[]) => rows.map((row) => ({ ...row, ...identityById.get(row.id) }));
    const identifiedDeliveries = identify(deliveries.data ?? []);
    const identifiedIncomplete = identify(incomplete.data ?? []);
    const identifiedAssigned = identify(assignedWork.data ?? []);
    return Response.json({ ok: true, appointments: appointments.data ?? [], deliveries: identifiedDeliveries, incompleteWork: identifiedIncomplete, assignedWork: identifiedAssigned });
  } catch {
    return Response.json({ ok: false, code: 'today_identity_read_failed', error: '今日の予定を取得できませんでした。' }, { status: 500 });
  }
}
