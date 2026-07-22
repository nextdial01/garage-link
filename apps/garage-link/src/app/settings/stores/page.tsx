'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { canAddStore, getGaragePlan, type GarageSubscriptionLike } from '@/lib/billing/garagePlans';
import { createClient } from '@/lib/supabase/client';

type AccessibleStore = {
  id: string;
  name: string | null;
  company_name: string | null;
  is_current: boolean;
};

type MemberRow = { role: string | null; store_id: string };

export default function StoreManagementPage() {
  const [role, setRole] = useState('');
  const [stores, setStores] = useState<AccessibleStore[]>([]);
  const [subscription, setSubscription] = useState<GarageSubscriptionLike | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function load() {
    try {
      setIsLoading(true);
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) throw new Error('ログインが必要です。');
      const { data: member } = await supabase
        .from<MemberRow>('store_members')
        .select('role, store_id')
        .eq('user_id', userData.user.id)
        .single();
      if (!member) throw new Error('所属店舗が見つかりません。');
      setRole(member.role ?? '');
      const [storeResult, billingResponse] = await Promise.all([
        supabase.rpc('list_accessible_garage_stores', {}),
        fetch('/api/billing/subscription'),
      ]);
      setStores((storeResult.data as AccessibleStore[] | null) ?? []);
      const billing = (await billingResponse.json()) as { subscription?: GarageSubscriptionLike };
      setSubscription(billing.subscription ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '店舗情報を取得できませんでした。');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function createStore() {
    try {
      setIsSaving(true);
      setMessage('');
      setErrorMessage('');
      const supabase = createClient();
      const { data, error } = await supabase.rpc('create_garage_store', { p_name: name.trim() });
      if (error) throw new Error(error.message);
      const created = data as { id?: string };
      if (created.id) {
        const { error: switchError } = await supabase.rpc('switch_active_garage_store', { p_store_id: created.id });
        if (switchError) throw new Error(switchError.message);
      }
      setMessage('店舗を追加しました。新しい店舗へ切り替えます。');
      window.setTimeout(() => window.location.assign('/onboarding'), 800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '店舗を追加できませんでした。');
    } finally {
      setIsSaving(false);
    }
  }

  const storeLimit = (subscription?.included_store_count ?? 1) + (subscription?.extra_store_count ?? 0);
  const canCreate = canAddStore(subscription) && stores.length < storeLimit;

  return (
    <AppShell
      activeLabel="設定"
      title="店舗管理・切替"
      description="同じ契約で利用する店舗を管理します。上限は全店舗の合計です。"
      actionButton={<Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">設定へ戻る</Link>}
    >
      {isLoading ? (
        <section className="rounded-2xl bg-white p-6 text-sm font-bold text-slate-500 shadow-sm">読み込み中...</section>
      ) : !['owner', 'admin'].includes(role) ? (
        <PermissionDeniedCard message="店舗管理はオーナー・管理者のみ利用できます。" />
      ) : (
        <div className="mx-auto max-w-4xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</p>}
          {message && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</p>}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">契約内の店舗</h2>
                <p className="mt-1 text-sm text-slate-500">{getGaragePlan(subscription?.plan).name}：{stores.length}/{storeLimit}店舗</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {stores.map((store) => (
                <article key={store.id} className={`rounded-xl border p-4 ${store.is_current ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                  <p className="font-black text-slate-950">{store.name || store.company_name || '店舗'}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{store.is_current ? '現在操作中' : '画面右上から切替可能'}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">店舗を追加</h2>
            <p className="mt-1 text-sm text-slate-500">Standardは追加店舗契約後、Proは標準3店舗まで追加できます。</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="店舗名"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600"
              />
              <button
                type="button"
                disabled={!canCreate || !name.trim() || isSaving}
                onClick={() => void createStore()}
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? '追加中...' : '店舗を追加'}
              </button>
            </div>
            {!canAddStore(subscription) && <p className="mt-3 text-sm font-bold text-amber-700">店舗追加はStandard以上で利用できます。</p>}
            {canAddStore(subscription) && stores.length >= storeLimit && <p className="mt-3 text-sm font-bold text-amber-700">店舗上限に達しています。プラン・契約から追加店舗をお申し込みください。</p>}
          </section>
        </div>
      )}
    </AppShell>
  );
}
