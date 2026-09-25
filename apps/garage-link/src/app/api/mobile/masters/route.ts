import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
export async function GET(request: Request) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { data, error } = await context.service.from('store_master_entries')
    .select('id,kind,label,is_active,sort_order').eq('store_id', context.member.storeId)
    .order('sort_order').order('label');
  if (error) return Response.json({ ok: false, error: 'マスターを取得できませんでした。' }, { status: 500 });
  const store = await context.service.from('stores').select('tax_display_mode').eq('id',context.member.storeId).single();
  if (store.error || !store.data) return Response.json({ ok:false, error:'店舗設定を取得できませんでした。' }, {status:500});
  return Response.json({ ok: true, entries: data ?? [], taxDisplayMode: store.data.tax_display_mode }, { headers: { 'Cache-Control': 'no-store' } });
}
