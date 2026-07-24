import { createClient } from '@/lib/supabase/client';
import {
  createGarageUiContextCache,
  normalizeGarageUiContext,
} from '@/lib/store/garageUiContextCore';

const garageUiContextCache = createGarageUiContextCache(async () => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_garage_ui_context', {});
  if (error) throw new Error(error.message);
  return normalizeGarageUiContext(data);
});

export function getGarageUiContext(options: { force?: boolean } = {}) {
  return garageUiContextCache.get(options);
}

export function invalidateGarageUiContext() {
  garageUiContextCache.invalidate();
}
