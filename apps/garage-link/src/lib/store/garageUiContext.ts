import { createClient } from '@/lib/supabase/client';
import {
  createGarageUiContextCache,
  normalizeGarageUiContext,
} from '@/lib/store/garageUiContextCore';

const garageUiContextCache = createGarageUiContextCache(async () => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_garage_ui_context_v2', {});
  if (error) throw new Error(error.message);
  return normalizeGarageUiContext(data);
});

export function getGarageUiContext(options: { force?: boolean } = {}) {
  return garageUiContextCache.get(options);
}

export async function requireActiveGarageStore(options: { force?: boolean } = {}) {
  const context = await getGarageUiContext(options);
  if (context.state !== 'active' || !context.tenantId || !context.storeId) {
    throw new Error(
      context.state === 'selection_required'
        ? '操作する店舗を選択してください。'
        : '利用可能な店舗がありません。',
    );
  }
  return context;
}

export function invalidateGarageUiContext() {
  garageUiContextCache.invalidate();
}

const STORE_SWITCH_CHANNEL = 'garage-link-active-store';
const STORE_SWITCH_STORAGE_KEY = 'garage-link:active-store-changed';

export type GarageStoreSwitchEvent = {
  tenantId: string;
  storeId: string;
  version?: number;
};

export function notifyGarageStoreSwitch(event: GarageStoreSwitchEvent) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORE_SWITCH_STORAGE_KEY, JSON.stringify({ ...event, at: Date.now() }));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(STORE_SWITCH_CHANNEL);
    channel.postMessage(event);
    channel.close();
  }
}

export function subscribeGarageStoreSwitch(listener: (event: GarageStoreSwitchEvent) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORE_SWITCH_STORAGE_KEY || !event.newValue) return;
    try {
      listener(JSON.parse(event.newValue) as GarageStoreSwitchEvent);
    } catch {
      // Local signals are cache invalidation hints, never authorization input.
    }
  };
  window.addEventListener('storage', onStorage);
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(STORE_SWITCH_CHANNEL) : null;
  if (channel) channel.onmessage = (event: MessageEvent<GarageStoreSwitchEvent>) => listener(event.data);
  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.close();
  };
}
