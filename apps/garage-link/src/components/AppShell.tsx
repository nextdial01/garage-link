'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppSidebar from './AppSidebar';
import ContextHelp from './ContextHelp';
import { getRoleLabel } from '@/lib/auth/permissions';
import { getGarageUiContext, invalidateGarageUiContext } from '@/lib/store/garageUiContext';
import { createClient } from '@/lib/supabase/client';

interface AppShellProps {
  activeLabel: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  actionButton?: React.ReactNode;
}

type AccessibleStore = {
  id: string;
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
  const [role, setRole] = useState('viewer');
  const [stores, setStores] = useState<AccessibleStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState('');
  const [isSwitchingStore, setIsSwitchingStore] = useState(false);
  const shellBackground = 'bg-[#F6F8FC]';
  const headerBorderClass = 'border-blue-100';

  useEffect(() => {
    async function loadStoreContext() {
      try {
        const context = await getGarageUiContext();
        setRole(context.role);
        setStoreLabel(context.storeLabel);
        setStores(context.stores);
        setActiveStoreId(context.stores.find((item) => item.isCurrent)?.id ?? context.storeId);

        if (!context.onboardingCompleted && pathname !== '/onboarding') {
          router.replace('/onboarding');
        }
      } catch {
        setStoreLabel('店舗');
      }
    }

    void loadStoreContext();
  }, [pathname, router]);

  async function switchStore(storeId: string) {
    if (!storeId || storeId === activeStoreId) return;
    try {
      setIsSwitchingStore(true);
      const supabase = createClient();
      const { error } = await supabase.rpc('switch_active_garage_store', { p_store_id: storeId });
      if (error) throw error;
      invalidateGarageUiContext();
      window.location.reload();
    } catch {
      setIsSwitchingStore(false);
    }
  }

  return (
    <main className={`flex min-h-screen flex-col text-slate-950 lg:flex-row ${shellBackground}`}>
      <AppSidebar activeLabel={activeLabel} />

      <section className="min-w-0 flex-1 pb-24 lg:pb-0">
        <header className={`sticky top-0 z-20 border-b bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 ${headerBorderClass}`}>
          <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Link href="/help" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
                  ヘルプ
                </Link>
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 ring-1 ring-inset ring-blue-100">
                  権限: {getRoleLabel(role)}
                </div>
                {stores.length > 1 ? (
                  <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">
                    <span className="sr-only">表示店舗</span>
                    <select
                      value={activeStoreId}
                      disabled={isSwitchingStore}
                      onChange={(event) => void switchStore(event.target.value)}
                      className="max-w-[220px] bg-transparent outline-none disabled:opacity-60"
                    >
                      {stores.map((item) => (
                        <option key={item.id} value={item.id}>{item.name || item.companyName || '店舗'}</option>
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

        <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">{children}</div>
      </section>
    </main>
  );
}
