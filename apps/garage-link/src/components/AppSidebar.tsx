'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import BrandLogo from './BrandLogo';
import ContextHelp from './ContextHelp';
import { getRoleLabel } from '@/lib/auth/permissions';
import { getGarageUiContext } from '@/lib/store/garageUiContext';
import { DEFAULT_PRIMARY_TABS, PRIMARY_TAB_OPTIONS, filterMenuGroupsByRole, getPrimaryTabMeta, resolvePrimaryTabs, type PrimaryTabKey } from '@/lib/store/uiPreferences';

interface AppSidebarProps {
  activeLabel: string;
}

type CountChip = {
  tone: 'red' | 'amber' | 'blue';
  label: string;
  value: number;
};

type CountMap = Partial<Record<PrimaryTabKey | 'menu', CountChip[]>>;

const defaultCountMap: CountMap = {};

function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard' || href === '/settings' || href === '/menu') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function toneClass(tone: CountChip['tone']) {
  switch (tone) {
    case 'red':
      return 'bg-red-50 text-red-700 ring-red-200';
    case 'amber':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
    default:
      return 'bg-blue-50 text-blue-700 ring-blue-200';
  }
}

function buildMenuCounts(primaryTabs: PrimaryTabKey[], baseCounts: CountMap): CountChip[] {
  const hiddenPrimaryKeys = PRIMARY_TAB_OPTIONS.map((item) => item.key).filter((key) => key !== 'menu' && !primaryTabs.includes(key));
  const chips = hiddenPrimaryKeys.flatMap((key) => baseCounts[key] ?? []);
  const urgent = chips.filter((chip) => chip.tone === 'red').reduce((sum, chip) => sum + chip.value, 0);
  const today = chips.filter((chip) => chip.tone === 'amber').reduce((sum, chip) => sum + chip.value, 0);
  const result: CountChip[] = [];

  if (urgent > 0) {
    result.push({ tone: 'red', label: '緊急', value: urgent });
  }
  if (today > 0) {
    result.push({ tone: 'amber', label: '今日', value: today });
  }

  return result.slice(0, 2);
}

function PrimaryLink({
  tab,
  pathname,
  counts,
}: {
  tab: PrimaryTabKey;
  pathname: string;
  counts: CountMap;
}) {
  const meta = getPrimaryTabMeta(tab);
  const active = isActivePath(pathname, meta.href);
  const chips = (tab === 'menu' ? counts.menu : counts[tab]) ?? [];

  return (
    <div
      className={`w-full rounded-2xl border px-4 py-3 transition ${
        active
          ? 'border-[#123B6A] bg-[#123B6A] text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50/60'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <Link href={meta.href} className={`min-w-0 flex-1 py-1 text-sm font-black ${active ? 'text-white' : 'text-slate-900'}`}>
          {meta.label}
        </Link>
        <ContextHelp title={meta.label} description={meta.description} inverted={active} />
      </div>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={`${meta.key}-${chip.label}`}
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${active ? 'bg-white/15 text-white ring-white/10' : toneClass(chip.tone)}`}
            >
              {chip.label} {chip.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppSidebar({ activeLabel }: AppSidebarProps) {
  const pathname = usePathname();
  const [menuReady, setMenuReady] = useState(false);
  const [role, setRole] = useState('viewer');
  const [storeLabel, setStoreLabel] = useState('店舗');
  const [primaryTabs, setPrimaryTabs] = useState<PrimaryTabKey[]>(DEFAULT_PRIMARY_TABS);
  const [counts, setCounts] = useState<CountMap>(defaultCountMap);

  useEffect(() => {
    async function loadSidebar() {
      try {
        const context = await getGarageUiContext();
        const nextPrimaryTabs = resolvePrimaryTabs(context.primaryNavigationTabs);
        setPrimaryTabs(nextPrimaryTabs);
        setRole(context.role);
        setStoreLabel(context.storeLabel);
        const uiCounts = context.counts;

        const nextCounts: CountMap = {
          vehicles: uiCounts.vehicleAttention > 0 ? [{ tone: 'red', label: '要確認', value: uiCounts.vehicleAttention }] : [],
          deals: [
            ...(uiCounts.dealsOverdue > 0 ? [{ tone: 'red' as const, label: '期限超過', value: uiCounts.dealsOverdue }] : []),
            ...(uiCounts.dealsToday > 0 ? [{ tone: 'amber' as const, label: '今日', value: uiCounts.dealsToday }] : []),
          ].slice(0, 2),
          customers: [
            ...(uiCounts.customersOverdue > 0 ? [{ tone: 'red' as const, label: '期限超過', value: uiCounts.customersOverdue }] : []),
            ...(uiCounts.customersToday > 0 ? [{ tone: 'amber' as const, label: '今日', value: uiCounts.customersToday }] : []),
          ].slice(0, 2),
          maintenance: [
            ...(uiCounts.maintenanceOverdue > 0 ? [{ tone: 'red' as const, label: '期限超過', value: uiCounts.maintenanceOverdue }] : []),
            ...(uiCounts.maintenanceToday > 0 ? [{ tone: 'amber' as const, label: '今日', value: uiCounts.maintenanceToday }] : []),
          ].slice(0, 2),
          appointments: [
            ...(uiCounts.appointmentsToday > 0 ? [{ tone: 'amber' as const, label: '今日', value: uiCounts.appointmentsToday }] : []),
            ...(uiCounts.appointmentsOpen > 0 ? [{ tone: 'blue' as const, label: '未完了', value: uiCounts.appointmentsOpen }] : []),
          ].slice(0, 2),
          inquiries: uiCounts.inquiryPending > 0 ? [{ tone: 'amber', label: '未完了', value: uiCounts.inquiryPending }] : [],
        };

        nextCounts.menu = buildMenuCounts(nextPrimaryTabs, nextCounts);
        setCounts(nextCounts);
      } catch {
        setPrimaryTabs(DEFAULT_PRIMARY_TABS);
      } finally {
        setMenuReady(true);
      }
    }

    void loadSidebar();
  }, []);

  const visibleMenuGroups = useMemo(() => filterMenuGroupsByRole(role), [role]);
  const desktopPrimaryTabs = useMemo(() => resolvePrimaryTabs(primaryTabs), [primaryTabs]);
  const mobileTabs = useMemo(() => resolvePrimaryTabs(primaryTabs).slice(0, 5), [primaryTabs]);

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-[#F4F6FA] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-slate-200 px-5 py-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <BrandLogo className="h-10 w-36 max-w-full" priority />
              {menuReady && (
                <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                  権限: {getRoleLabel(role)}
                </span>
              )}
            </div>
            <p className="mt-4 truncate text-sm font-black text-slate-900">{storeLabel}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
          <section>
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-xs font-black tracking-[0.18em] text-slate-500">よく使う画面</p>
              {(role === 'owner' || role === 'admin') && (
                <Link href="/settings/store" className="text-xs font-bold text-blue-700 hover:underline">
                  主タブを変更
                </Link>
              )}
            </div>
            <div className="space-y-3">
              {desktopPrimaryTabs.map((tab) => (
                <PrimaryLink key={tab} tab={tab} pathname={pathname} counts={counts} />
              ))}
            </div>
          </section>

          {visibleMenuGroups.map((group) => (
            <section key={group.title} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="mb-2 px-2 text-xs font-black tracking-[0.18em] text-slate-500">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = item.label === activeLabel || isActivePath(pathname, item.href);
                  const chips = item.primaryTabKey ? counts[item.primaryTabKey] ?? [] : [];

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition ${
                        active ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0 text-sm font-bold">{item.label}</span>
                      {chips.length > 0 && (
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          {chips.map((chip) => (
                            <span key={`${item.href}-${chip.label}`} className={`rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${toneClass(chip.tone)}`}>
                              {chip.label} {chip.value}
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-slate-200 px-4 py-4">
          <Link
            href="/logout"
            className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ログアウト
          </Link>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5 gap-2">
          {mobileTabs.map((tab) => {
            const meta = getPrimaryTabMeta(tab);
            const active = isActivePath(pathname, meta.href);
            const chips = (tab === 'menu' ? counts.menu : counts[tab]) ?? [];
            const primaryChip = chips[0];

            return (
              <Link
                key={tab}
                href={meta.href}
                className={`relative flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-center transition ${
                  active ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-[11px] font-black">{meta.shortLabel}</span>
                {primaryChip && (
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${toneClass(primaryChip.tone)}`}>
                    {primaryChip.value}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
