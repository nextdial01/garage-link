'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { requireActiveGarageStore, subscribeGarageStoreSwitch } from '@/lib/store/garageUiContext';
import { toUserErrorMessage } from '@/lib/errors/user-error';
import type { MasterEntry } from './masters';
import type { TaxDisplayMode } from './money';

export function useBusinessSettings() {
  const generation = useRef(0);
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [entries, setEntries] = useState<MasterEntry[]>([]);
  const [mode, setMode] = useState<TaxDisplayMode>('included');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError('');
    setEntries([]); setStoreId(''); setRole('');
    try {
      const context = await requireActiveGarageStore({ force: true });
      const client = createClient();
      const [masters, store] = await Promise.all([
        client.from('store_master_entries').select('id,store_id,kind,label,is_active,sort_order').eq('store_id', context.storeId).order('sort_order'),
        client.from<{ tax_display_mode: string }>('stores').select('tax_display_mode').eq('id', context.storeId).single(),
      ]);
      if (masters.error || store.error || !store.data) throw new Error('店舗のマスター・金額表示設定を取得できませんでした。');
      if (current !== generation.current) return;
      setStoreId(context.storeId); setRole(context.role);
      setEntries((masters.data ?? []) as MasterEntry[]);
      setMode(store.data.tax_display_mode === 'excluded' ? 'excluded' : 'included');
    } catch (failure) {
      if (current !== generation.current) return;
      setEntries([]); setStoreId(''); setRole('');
      setError(toUserErrorMessage(failure, '店舗設定を取得できませんでした。'));
    } finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void reload(); });
    const unsubscribe = subscribeGarageStoreSwitch(() => { void reload(); });
    return () => { mounted = false; unsubscribe(); };
  }, [reload]);
  return { storeId, role, entries, mode, loading, error, reload };
}
