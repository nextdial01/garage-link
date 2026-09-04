import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';

const FIELDS = 'id, customer_id, vehicle_id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, estimated_total_amount, assigned_user_name, updated_at';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { data, error } = await context.service.from('maintenance_jobs').select(FIELDS).eq('store_id', context.member.storeId).is('deleted_at', null).neq('is_archived', true).order('scheduled_delivery_at', { ascending: true }).limit(100);
  if (error) return Response.json({ ok: false, code: 'maintenance_list_failed', error: '整備案件を取得できませんでした。' }, { status: 500 });
  return Response.json({ ok: true, jobs: data ?? [] });
}
