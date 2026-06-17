'use client';

import { usePathname, useRouter } from 'next/navigation';

const vehiclePaths = [
  '/dashboard',
  '/vehicles',
  '/customers',
  '/deals',
  '/maintenance',
  '/inventory-counts',
  '/analytics',
  '/vehicle-management',
  '/settings',
];

function currentManagement(pathname: string) {
  if (pathname === '/settings/l-link') {
    return 'l-link';
  }

  if (pathname.startsWith('/line')) {
    return 'legacy-line';
  }

  if (vehiclePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return 'vehicle';
  }

  return 'vehicle';
}

export default function ManagementSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const selected = currentManagement(pathname);
  const isLLink = selected === 'l-link';

  function handleChange(value: string) {
    if (value === 'vehicle') {
      router.push('/dashboard');
      return;
    }

    if (value === 'l-link') {
      router.push('/settings/l-link');
    }
  }

  return (
    <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => handleChange('vehicle')}
        className={`rounded-xl px-4 py-2 text-sm font-black transition ${
          !isLLink
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'
        }`}
      >
        車両管理モード
      </button>
      <button
        type="button"
        onClick={() => handleChange('l-link')}
        className={`rounded-xl px-4 py-2 text-sm font-black transition ${
          isLLink
            ? 'bg-green-600 text-white shadow-sm'
            : 'text-slate-500 hover:bg-green-50 hover:text-green-700'
        }`}
      >
        L-Link連携
      </button>
    </div>
  );
}
