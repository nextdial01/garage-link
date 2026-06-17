'use client';

import type { ReactNode } from 'react';
import LinePackageHeader from '@/components/line-package/LinePackageHeader';
import LinePackageSidebar from '@/components/line-package/LinePackageSidebar';

type LinePackageShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
};

export default function LinePackageShell({
  title,
  description,
  children,
  action,
}: LinePackageShellProps) {
  return (
    <div className="min-h-screen bg-[#F3FBF6] text-slate-950">
      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
        <LinePackageSidebar />
        <div className="min-w-0">
          <LinePackageHeader title={title} description={description} action={action} />
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
