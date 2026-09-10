import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { readMobileQuote } from '@/lib/mobile/quoteService';

export async function GET(request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const context = await getGarageMobileBearerContext(request);
  if (!context.ok) return context.response;
  const { quoteId } = await params;
  try {
    const quote = await readMobileQuote(context.service, context.member.storeId, quoteId);
    return quote ? Response.json({ ok: true, quote }) : Response.json({ ok: false, code: 'not_found', error: '見積が見つかりません。' }, { status: 404 });
  } catch { return Response.json({ ok: false, code: 'quote_read_failed', error: '見積を取得できませんでした。' }, { status: 500 }); }
}
