import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { withMaintenanceIdentity } from '@/lib/mobile/maintenanceIdentity';

function todayRange() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const start = new Date(`${day}T00:00:00+09:00`); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request); if (!context.ok) return context.response;
  const { start, end } = todayRange(); const assigned = context.member.displayName;
  const [appointments, deliveries, incomplete, assignedWork, todayIntakes, todayDeals, overdueDeals, unpaid, store] = await Promise.all([
    context.service.from('appointments').select('id, appointment_type, scheduled_at, status, customer_id, vehicle_id, deal_id, assigned_user_name, note').eq('store_id', context.member.storeId).gte('scheduled_at', start).lt('scheduled_at', end).neq('status', 'キャンセル').order('scheduled_at').limit(8),
    context.service.from('maintenance_jobs').select('id, job_no, job_type, status, scheduled_delivery_at, customer_id, vehicle_id, assigned_user_name').eq('store_id', context.member.storeId).gte('scheduled_delivery_at', start).lt('scheduled_delivery_at', end).is('deleted_at', null).order('scheduled_delivery_at').limit(8),
    context.service.from('maintenance_jobs').select('id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, customer_id, vehicle_id, assigned_user_name').eq('store_id', context.member.storeId).is('deleted_at', null).not('status', 'in', '(completed,delivered,cancelled)').order('scheduled_delivery_at').limit(8),
    assigned ? context.service.from('maintenance_jobs').select('id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, customer_id, vehicle_id, assigned_user_name').eq('store_id', context.member.storeId).eq('assigned_user_name', assigned).is('deleted_at', null).not('status', 'in', '(completed,delivered,cancelled)').order('scheduled_delivery_at').limit(8) : Promise.resolve({ data: [], error: null }),
    context.service.from('maintenance_jobs').select('id,job_no,status,scheduled_in_at,customer_id,vehicle_id').eq('store_id', context.member.storeId).gte('scheduled_in_at', start).lt('scheduled_in_at', end).is('deleted_at', null).limit(8),
    context.service.from('deals').select('id,title,status,customer_id,vehicle_id,next_action_at').eq('store_id', context.member.storeId).gte('next_action_at', start).lt('next_action_at', end).is('deleted_at', null).limit(8),
    context.service.from('deals').select('id,title,status,customer_id,vehicle_id,next_action_at').eq('store_id', context.member.storeId).lt('next_action_at', start).is('deleted_at', null).not('status','in','(成約,失注)').order('next_action_at').limit(8),
    context.service.from('invoices').select('id,invoice_no,customer_id,unpaid_amount,payment_due_date').eq('store_id', context.member.storeId).gt('unpaid_amount', 0).is('deleted_at', null).order('payment_due_date').limit(8),
    context.service.from('stores').select('long_stay_threshold_days').eq('id', context.member.storeId).maybeSingle(),
  ]);
  if (appointments.error || deliveries.error || incomplete.error || assignedWork.error || todayIntakes.error || todayDeals.error || overdueDeals.error || unpaid.error || store.error) return Response.json({ ok: false, code: 'today_read_failed', error: '今日の作業を取得できませんでした。' }, { status: 500 });
  try {
    const maintenanceRows = [...(deliveries.data ?? []), ...(incomplete.data ?? []), ...(assignedWork.data ?? []), ...(todayIntakes.data ?? [])];
    const identities = await withMaintenanceIdentity(context.service, context.member.storeId, maintenanceRows);
    const identityById = new Map(identities.map((item) => [String(item.id), { customerName: item.customerName, vehicleLabel: item.vehicleLabel }]));
    const identify = <T extends { id: string }>(rows: T[]) => rows.map((row) => ({ ...row, ...identityById.get(row.id) }));
    const identifiedDeliveries = identify(deliveries.data ?? []);
    const identifiedIncomplete = identify(incomplete.data ?? []);
    const identifiedAssigned = identify(assignedWork.data ?? []);
    const threshold = store.data?.long_stay_threshold_days ?? 90;
    const cutoff = new Date(Date.now() - threshold * 86_400_000).toISOString().slice(0, 10);
    const financialAllowed = ['owner','admin','staff'].includes(context.member.role);
    const [longStay, metrics] = await Promise.all([
      context.service.from('vehicles').select('id,management_no,maker,model_name,purchase_date,status').eq('store_id', context.member.storeId).lte('purchase_date', cutoff).is('deleted_at', null).not('status','in','(売約済み,納車済み,sold,delivered)').limit(8),
      financialAllowed ? context.service.rpc('inventory_dashboard_metrics', { p_store_id: context.member.storeId }) : Promise.resolve({ data: null, error: null }),
    ]);
    if (longStay.error || metrics.error) throw new Error('today_extra_read_failed');
    return Response.json({ ok: true, appointments: appointments.data ?? [], deliveries: identifiedDeliveries, incompleteWork: identifiedIncomplete, assignedWork: identifiedAssigned, todayIntakes: identify(todayIntakes.data ?? []), todayDeals: todayDeals.data ?? [], overdueDeals: overdueDeals.data ?? [], unpaid: financialAllowed ? unpaid.data ?? [] : [], longStay: longStay.data ?? [], inventoryMetrics: metrics.data });
  } catch {
    return Response.json({ ok: false, code: 'today_identity_read_failed', error: '今日の予定を取得できませんでした。' }, { status: 500 });
  }
}
