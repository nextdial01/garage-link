'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppSidebar from './AppSidebar';
import { fetchStoreOnboardingStatus } from '@/lib/auth/store-onboarding';
import { createClient } from '@/lib/supabase/client';

interface AppShellProps {
  activeLabel: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  actionButton?: React.ReactNode;
}

type StoreMemberRow = {
  store_id: string;
};

type StoreRow = {
  name: string | null;
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
  const shellBackground = 'bg-[#F6F8FC]';
  const categoryLabel = '車両管理';
  const headerBorderClass = 'border-blue-100';
  const accentText = 'text-blue-700';

  useEffect(() => {
    async function loadStoreContext() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user?.id) {
          setStoreLabel('未ログイン');
          return;
        }

        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();

        if (!member?.store_id) {
          setStoreLabel('店舗未登録');
          return;
        }

        const { data: store } = await supabase
          .from<StoreRow>('stores')
          .select('name')
          .eq('id', member.store_id)
          .single();

        setStoreLabel(store?.name?.trim() || '店舗');

        const { onboardingCompleted } = await fetchStoreOnboardingStatus(
          supabase,
          member.store_id
        );

        if (!onboardingCompleted && pathname !== '/onboarding') {
          router.replace('/onboarding');
        }
      } catch {
        setStoreLabel('店舗');
      }
    }

    void loadStoreContext();
  }, [pathname, router]);

  return (
    <main className={`flex min-h-screen flex-col text-slate-950 md:flex-row ${shellBackground}`}>
      <AppSidebar activeLabel={activeLabel} />

      <section className="min-w-0 flex-1">
        <header className={`sticky top-0 z-20 border-b bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 ${headerBorderClass}`}>
          <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                  {categoryLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-400 shadow-sm" disabled aria-disabled="true">
                  通知
                </button>
                <Link href="/help" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
                  ヘルプ
                </Link>
                <div className="max-w-[220px] truncate rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
                  {storeLabel}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className={`text-xs font-black ${accentText}`}>{categoryLabel} / GARAGE LINK</p>
                <h1 className="mt-1 text-xl font-black tracking-normal text-slate-950 sm:text-2xl">{title}</h1>
                {description && (
                  <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
                )}
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
