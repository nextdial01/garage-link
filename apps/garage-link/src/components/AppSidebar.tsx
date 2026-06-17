'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import BrandLogo from './BrandLogo';
import { createClient } from '@/lib/supabase/client';
import { getRoleLabel } from '@/lib/auth/permissions';

interface AppSidebarProps {
  activeLabel: string;
}

type MenuItem = {
  label: string;
  href: string;
};

type StoreMemberRow = {
  role: string | null;
};

const importExportAllowedRoles = ['owner', 'admin', 'implementer'];

const vehicleMainItems: MenuItem[] = [
  { label: 'ダッシュボード', href: '/dashboard' },
  { label: '車両一覧', href: '/vehicles' },
  { label: '入庫・出庫管理', href: '/vehicle-management' },
  { label: '整備・車検', href: '/maintenance' },
  { label: '顧客管理', href: '/customers' },
  { label: '商談管理', href: '/deals' },
  { label: '見積・請求', href: '/quotes' },
  { label: '棚卸し', href: '/inventory-counts' },
  { label: '分析', href: '/analytics' },
];

const vehicleSettingItems: MenuItem[] = [
  { label: '会社情報・帳票設定', href: '/settings/company' },
  { label: 'メンバー・権限設定', href: '/settings/members' },
  { label: 'プラン・契約', href: '/settings/billing' },
  { label: 'L-Link連携', href: '/settings/l-link' },
  { label: '環境変数チェック', href: '/settings/env-check' },
  { label: 'セキュリティチェック', href: '/settings/security-check' },
  { label: '監査ログ', href: '/settings/audit-logs' },
  { label: 'ゴミ箱 / アーカイブ', href: '/settings/trash' },
  { label: '本番前チェックリスト', href: '/settings/launch-checklist' },
  { label: '設定', href: '/settings' },
];

function isLineCategory(pathname: string) {
  return pathname === '/line' || pathname.startsWith('/line/');
}

function isActivePath(item: MenuItem, pathname: string) {
  const itemPath = item.href.split('?')[0];

  if (itemPath === '/dashboard' || itemPath === '/line' || itemPath === '/settings') {
    return pathname === itemPath;
  }

  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function MenuLink({
  item,
  pathname,
  activeLabel,
  lineCategory,
}: {
  item: MenuItem;
  pathname: string;
  activeLabel: string;
  lineCategory: boolean;
}) {
  const active = item.label === activeLabel || isActivePath(item, pathname);
  const activeClass = lineCategory
    ? 'bg-green-500 text-white shadow-sm'
    : 'bg-blue-500 text-white shadow-sm';
  const inactiveClass = lineCategory
    ? 'text-slate-300 hover:bg-white/10 hover:text-white'
    : 'text-slate-300 hover:bg-white/10 hover:text-white';

  return (
    <Link
      href={item.href}
      className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-bold transition ${
        active ? activeClass : inactiveClass
      }`}
    >
      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-[11px] font-black">
        {item.label.slice(0, 1)}
      </span>
      {item.label}
    </Link>
  );
}

function MenuGroup({
  title,
  items,
  pathname,
  activeLabel,
  lineCategory,
}: {
  title: string;
  items: MenuItem[];
  pathname: string;
  activeLabel: string;
  lineCategory: boolean;
}) {
  const titleClass = lineCategory ? 'text-green-600' : 'text-blue-600';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-sm">
      <p className={`mb-2 px-2 text-xs font-black tracking-wide ${titleClass}`}>
        {title}
      </p>
      <div className="space-y-1">
        {items.map((item, index) => (
          <MenuLink key={`${item.href}-${item.label}-${index}`} item={item} pathname={pathname} activeLabel={activeLabel} lineCategory={lineCategory} />
        ))}
      </div>
    </div>
  );
}

export default function AppSidebar({ activeLabel }: AppSidebarProps) {
  const pathname = usePathname();
  const [canUseImportExport, setCanUseImportExport] = useState(false);
  const [role, setRole] = useState('');
  const lineCategory = isLineCategory(pathname);
  const mainItems = (() => {
    if (lineCategory) {
      return [
        { label: 'L-Link連携', href: '/settings/l-link' },
        { label: '車両管理へ戻る', href: '/dashboard' },
      ];
    }

    if (role === 'implementer') {
      return vehicleMainItems.filter((item) => ['ダッシュボード', '顧客管理', '商談管理', '分析'].includes(item.label));
    }
    if (role === 'viewer') {
      return vehicleMainItems.filter((item) => ['ダッシュボード', '車両一覧', '顧客管理', '商談管理', '整備・車検', '棚卸し', '分析'].includes(item.label));
    }
    return vehicleMainItems;
  })();
  const settingItems = (() => {
    if (lineCategory) {
      return [];
    }

    if (role === 'viewer' || role === 'staff') {
      return [];
    }
    if (role === 'implementer') {
      return vehicleSettingItems.filter((item) => ['/settings/company', '/settings/import-export'].includes(item.href));
    }
    return vehicleSettingItems.filter((item) => {
      if (item.href === '/settings/import-export') return canUseImportExport;
      if (
        item.href === '/settings/audit-logs' ||
        item.href === '/settings/trash' ||
        item.href === '/settings/security-check' ||
        item.href === '/settings/env-check' ||
        item.href === '/settings/launch-checklist'
      ) {
        return role === 'owner' || role === 'admin';
      }
      return true;
    });
  })();
  const categoryTitle = lineCategory ? 'L-Link連携' : '車両管理';
  const roleRingClass = lineCategory ? 'ring-green-400/30' : 'ring-blue-400/30';
  const modeLinkClass = lineCategory
    ? 'border-green-400/30 bg-green-500/15 text-green-100'
    : 'border-blue-400/30 bg-blue-500/15 text-blue-100';

  useEffect(() => {
    async function loadRole() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user?.id) {
          setCanUseImportExport(false);
          return;
        }

        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('role')
          .eq('user_id', userData.user.id)
          .single();

        const nextRole = member?.role ?? '';
        setRole(nextRole);
        setCanUseImportExport(importExportAllowedRoles.includes(nextRole));
      } catch {
        setRole('');
        setCanUseImportExport(false);
      }
    }

    void loadRole();
  }, []);

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-900 bg-[#071225] px-4 py-5 text-white md:sticky md:top-0 md:h-screen md:w-72 md:border-r md:border-b-0 md:border-slate-900 md:py-6">
      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-white/70">
          <BrandLogo className="mx-auto h-10 w-48 max-w-full" priority />
        </div>
        <div className={`mt-4 rounded-xl border px-3 py-2 text-sm font-black ${modeLinkClass}`}>
          {lineCategory ? 'L-Link移行導線' : '車両管理モード'}
        </div>
        {role && (
          <span className={`mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200 ring-1 ${roleRingClass}`}>
            現在の権限: {getRoleLabel(role)}
          </span>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {mainItems.length > 0 && <MenuGroup title={categoryTitle} items={mainItems} pathname={pathname} activeLabel={activeLabel} lineCategory={lineCategory} />}
        {settingItems.length > 0 && <MenuGroup title="設定" items={settingItems} pathname={pathname} activeLabel={activeLabel} lineCategory={lineCategory} />}
      </nav>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <MenuLink item={{ label: 'ログアウト', href: '/logout' }} pathname={pathname} activeLabel={activeLabel} lineCategory={lineCategory} />
        <p className="mt-3 px-3 text-[11px] font-semibold text-slate-500">GARAGE LINK Business Console</p>
      </div>
    </aside>
  );
}
