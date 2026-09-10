import { mobileReadPage, mobileReadResult, mobileReadHeaders } from '@/lib/mobile/pagination';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { withMaintenanceIdentity } from '@/lib/mobile/maintenanceIdentity';

const FIELDS = 'id, customer_id, vehicle_id, job_no, job_type, status, scheduled_in_at, scheduled_delivery_at, estimated_total_amount, assigned_user_name, updated_at';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const page = mobileReadPage(request);
  if (!page) return Response.json({ ok: false, code: 'invalid_page', error: '一覧の取得条件が正しくありません。' }, { status: 400 });
  const { data, error } = await context.service.from('maintenance_jobs').select(FIELDS).eq('store_id', context.member.storeId).is('deleted_at', null).neq('is_archived', true).order('scheduled_delivery_at', { ascending: true }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit);
  if (error) return Response.json({ ok: false, code: 'maintenance_list_failed', error: '整備案件を取得できませんでした。' }, { status: 500 });
  const result = mobileReadResult(data ?? [], page);
  try {
    const jobs = await withMaintenanceIdentity(context.service, context.member.storeId, result.rows);
    return Response.json({ ok: true, jobs, nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
  } catch {
    return Response.json({ ok: false, code: 'maintenance_identity_read_failed', error: '整備案件を取得できませんでした。' }, { status: 500 });
  }
}
