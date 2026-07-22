'use client';

import { useEffect, useState } from 'react';
import PermissionDeniedCard from './PermissionDeniedCard';
import { getCurrentStoreMember, getRoleLabel } from '@/lib/auth/permissions';

export default function RoleAccessGate({
  allowedRoles,
  backHref = '/dashboard',
  children,
}: {
  allowedRoles: string[];
  backHref?: string;
  children: React.ReactNode;
}) {
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const member = await getCurrentStoreMember();
          setRole(member.role);
        } catch {
          setRole('');
        } finally {
          setIsLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
        権限を確認しています...
      </section>
    );
  }

  if (!allowedRoles.includes(role)) {
    return <PermissionDeniedCard backHref={backHref} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
        現在の権限: {getRoleLabel(role)}
      </div>
      {children}
    </div>
  );
}
