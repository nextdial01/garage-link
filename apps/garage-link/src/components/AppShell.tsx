'use client';

import AppSidebar from './AppSidebar';

interface AppShellProps {
  activeLabel: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  actionButton?: React.ReactNode;
}

export default function AppShell({
  activeLabel,
  title,
  description,
  children,
  actionButton,
}: AppShellProps) {
  const shellBackground = 'bg-[#F6F8FC]';
  const categoryLabel = '車両管理';
  const headerBorderClass = 'border-blue-100';
  const accentText = 'text-blue-700';

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
                <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
                  通知
                </button>
                <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50">
                  ヘルプ
                </button>
                <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
                  テスト店舗
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
