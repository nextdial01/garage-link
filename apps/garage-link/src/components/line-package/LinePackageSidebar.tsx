'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const menuItems = [
  { label: 'ダッシュボード', href: '/line-package/dashboard' },
  { label: '友だち管理', href: '/line-package/friends' },
  { label: 'メッセージ配信', href: '/line-package/messages' },
  { label: 'ステップ配信', href: '/line-package/steps' },
  { label: 'シナリオ配信', href: '/line-package/scenarios' },
  { label: '回答フォーム', href: '/line-package/forms' },
  { label: 'リッチメニュー', href: '/line-package/rich-menus' },
  { label: '問い合わせ管理', href: '/line-package/inquiries' },
  { label: '配信履歴', href: '/line-package/delivery-logs' },
  { label: 'LINE設定', href: '/line-package/settings' },
  { label: 'ユーザー管理', href: '/line-package/users' },
  { label: '契約・プラン', href: '/line-package/billing' },
];

export default function LinePackageSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full min-h-screen w-full flex-col border-r border-green-100 bg-white lg:w-72">
      <div className="border-b border-green-100 px-5 py-5">
        <Link href="/line-package/dashboard" className="block">
          <p className="text-xs font-bold uppercase tracking-wide text-green-600">LINE Package</p>
          <p className="mt-1 text-xl font-black text-slate-950">GARAGE LINK LINE</p>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {menuItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                active
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-green-50 hover:text-green-700'
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-green-100 p-4">
        <p className="rounded-xl bg-green-50 px-3 py-3 text-xs font-semibold leading-5 text-green-800">
          LINE単体プランでは車両・商談・帳票機能は表示しません。GARAGE LINKへアップグレードすると利用できます。
        </p>
      </div>
    </aside>
  );
}
