'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppSidebar from './AppSidebar';
import ContextHelp from './ContextHelp';
import {
  getGarageUiContext,
  invalidateGarageUiContext,
  notifyGarageStoreSwitch,
  subscribeGarageStoreSwitch,
} from '@/lib/store/garageUiContext';
import { toUserErrorMessage } from '@/lib/errors/user-error';

interface AppShellProps {
  activeLabel: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  actionButton?: React.ReactNode;
}

type AccessibleStore = {
  id: string;
  tenantId: string;
  name: string | null;
  companyName: string | null;
  isCurrent: boolean;
};

export default function AppShell({
  activeLabel,
  title,
  description,
  children,
  actionButton,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [storeLabel, setStoreLabel] = useState('読み込み中...');
  const [stores, setStores] = useState<AccessibleStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState('');
  const [storeContextState, setStoreContextState] = useState<'loading' | 'active' | 'selection_required' | 'no_access'>('loading');
  const [isSwitchingStore, setIsSwitchingStore] = useState(false);
  const [storeSwitchError, setStoreSwitchError] = useState('');
  const [ownerPreview] = useState(() => typeof document !== 'undefined' && document.cookie.split(';').some((cookie) => cookie.trim() === 'garage_owner_preview=1'));
  const shellBackground = 'bg-[#F6F8FC]';
  const headerBorderClass = 'border-blue-100';

  useEffect(() => {
    async function loadStoreContext() {
      try {
        const context = await getGarageUiContext();
        setStoreContextState(context.state);
        setStoreLabel(context.storeLabel);
        setStores(context.stores);
        setActiveStoreId(context.stores.find((item) => item.isCurrent)?.id ?? context.storeId);

        if (context.state === 'active' && !context.onboardingCompleted && pathname !== '/onboarding') {
          router.replace('/onboarding');
        }
      } catch {
        setStoreLabel('店舗');
        setStoreContextState('no_access');
      }
    }

    void loadStoreContext();
  }, [pathname, router]);

  useEffect(() => subscribeGarageStoreSwitch(() => {
    invalidateGarageUiContext();
    window.location.reload();
  }), []);

  async function switchStore(storeId: string) {
    if (!storeId || storeId === activeStoreId || isSwitchingStore) return;
    const selectedStore = stores.find((store) => store.id === storeId);
    if (!selectedStore?.tenantId) return;
    try {
      setIsSwitchingStore(true);
      setStoreSwitchError('');
      const response = await fetch('/api/stores/active', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: selectedStore.tenantId, storeId }),
      });
      const result = await response.json() as { error?: string; version?: number };
      if (!response.ok) throw new Error(result.error || '店舗を切り替えられませんでした。');
      invalidateGarageUiContext();
      notifyGarageStoreSwitch({ tenantId: selectedStore.tenantId, storeId, version: result.version });
      setActiveStoreId(storeId);
      window.location.replace(pathname);
    } catch (error) {
      setStoreSwitchError(toUserErrorMessage(error, '店舗を切り替えられませんでした。'));
      setIsSwitchingStore(false);
    }
  }

  return (
    <main className={`flex min-h-screen flex-col text-slate-950 lg:flex-row ${shellBackground}`}>
      <AppSidebar activeLabel={activeLabel} />

      <section className="min-w-0 flex-1 pb-24 lg:pb-0">
        <header className={`sticky top-0 z-[var(--z-app-header)] border-b bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 ${headerBorderClass}`}>
          <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Link href="/help" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
                  ヘルプ
                </Link>
                    {stores.length > 1 || !activeStoreId ? (
                  <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">
                    <span className="sr-only">表示店舗</span>
                    <select
                      value={activeStoreId}
                      disabled={isSwitchingStore}
                      onChange={(event) => void switchStore(event.target.value)}
                      className="max-w-[220px] bg-transparent outline-none disabled:opacity-60"
                        >
                          {!activeStoreId && <option value="">操作する店舗を選択</option>}
                          {Array.from(new Set(stores.map((item) => item.tenantId))).map((tenantId) => (
                            <optgroup key={tenantId} label={stores.find((item) => item.tenantId === tenantId)?.companyName || '契約内の店舗'}>
                              {stores.filter((item) => item.tenantId === tenantId).map((item) => (
                                <option key={item.id} value={item.id}>{item.name || item.companyName || '店舗'}</option>
                              ))}
                            </optgroup>
                          ))}
                    </select>
                  </label>
                ) : (
                  <div className="max-w-[220px] truncate rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
                    {storeLabel}
                  </div>
                )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-normal text-slate-950 sm:text-2xl">{title}</h1>
                  {description && <ContextHelp title={title} description={description} />}
                </div>
              </div>

              {actionButton && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {actionButton}
                </div>
              )}
            </div>
          </div>
            </header>

            {storeSwitchError && (
              <p role="alert" className="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 sm:mx-6 lg:mx-8">
                {storeSwitchError}
              </p>
            )}

            {ownerPreview && (
              <div role="status" className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900 sm:mx-6 lg:mx-8">
                <span className="block">STAGING OWNER PREVIEW</span>
                <span className="block text-xs font-bold">合成データ・外部送信なし</span>
              </div>
            )}

            <div className="relative mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
              {isSwitchingStore && (
                <div className="absolute inset-0 z-30 flex min-h-40 items-center justify-center rounded-2xl bg-white/95 text-sm font-black text-blue-800" aria-live="polite">
                  店舗を切り替えています...
                </div>
              )}
              {storeContextState === 'selection_required' ? (
                <section className="rounded-2xl border border-blue-200 bg-white p-8 text-center shadow-sm">
                  <h2 className="text-lg font-black text-slate-950">操作する店舗を選択してください</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-600">画面右上の店舗一覧には、現在利用できる店舗だけが表示されます。</p>
                </section>
              ) : storeContextState === 'no_access' ? (
                <section className="rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
                  <h2 className="text-lg font-black text-slate-950">利用可能な店舗がありません</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-600">店舗への所属状態を管理者へ確認してください。</p>
                </section>
              ) : storeContextState === 'loading' ? (
                <section className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">店舗情報を確認しています...</section>
              ) : (
                <div aria-hidden={isSwitchingStore}>{children}</div>
              )}
            </div>
      </section>
    </main>
  );
}
