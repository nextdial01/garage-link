import { mobileReadPage, mobileReadResult, mobileReadHeaders } from '@/lib/mobile/pagination';
import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { MOBILE_CUSTOMER_FIELDS } from '@/lib/mobile/dto';

export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request); if (!context.ok) return context.response;
  const page = mobileReadPage(request);
  if (!page) return Response.json({ ok: false, code: 'invalid_page', error: '一覧の取得条件が正しくありません。' }, { status: 400 });
  const term = new URL(request.url).searchParams.get('q')?.trim() ?? ''; let query = context.service.from('customers').select(MOBILE_CUSTOMER_FIELDS).eq('store_id', context.member.storeId).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(page.offset, page.offset + page.limit);
  if (term) { const escaped = term.slice(0, 100).replace(/[\\%_,()"']/g, ' '); if (escaped) query = query.or(`name.ilike.%${escaped}%,kana.ilike.%${escaped}%,phone.ilike.%${escaped}%,mobile_phone.ilike.%${escaped}%`); }
  const { data, error } = await query; if (error) return Response.json({ ok: false, code: 'customer_list_failed', error: '顧客を取得できませんでした。' }, { status: 500 });
  const result = mobileReadResult(data ?? [], page);
  return Response.json({ ok: true, customers: result.rows, nextOffset: result.nextOffset }, { headers: mobileReadHeaders });
}
