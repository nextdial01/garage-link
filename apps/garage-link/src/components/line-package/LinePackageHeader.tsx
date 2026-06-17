'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type LinePackageHeaderProps = {
  title: string;
  description: string;
  tenantName?: string;
  planLabel?: string;
  action?: ReactNode;
};

export default function LinePackageHeader({
  title,
  description,
  tenantName = 'LINE単体パッケージ',
  planLabel = 'LINE',
  action,
}: LinePackageHeaderProps) {
  return (
    <header className="border-b border-green-100 bg-white px-5 py-5 shadow-sm sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-100">
              {planLabel}
            </span>
            <span className="text-xs font-semibold text-slate-500">{tenantName}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {action}
          <Link
            href="/line-package/settings"
            className="rounded-xl border border-green-200 bg-white px-4 py-2.5 text-sm font-bold text-green-700 shadow-sm transition hover:bg-green-50"
          >
            LINE設定
          </Link>
        </div>
      </div>
    </header>
  );
}
