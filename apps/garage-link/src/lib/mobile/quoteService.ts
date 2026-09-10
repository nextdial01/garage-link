import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { MOBILE_QUOTE_FIELDS, MOBILE_QUOTE_ITEM_FIELDS, mobileQuote } from '@/lib/mobile/dto';

export async function readMobileQuote(service: SupabaseClient, storeId: string, quoteId: string) {
  const [{ data: quote, error: quoteError }, { data: items, error: itemsError }] = await Promise.all([
    service.from('quotes').select(MOBILE_QUOTE_FIELDS).eq('id', quoteId).eq('store_id', storeId).maybeSingle(),
    service.from('quote_items').select(MOBILE_QUOTE_ITEM_FIELDS).eq('quote_id', quoteId).eq('store_id', storeId).order('item_order', { ascending: true }),
  ]);
  if (quoteError || itemsError) throw new Error('quote_read_failed');
  return quote ? mobileQuote(quote as Record<string, unknown>, (items ?? []) as Array<Record<string, unknown>>) : null;
}
