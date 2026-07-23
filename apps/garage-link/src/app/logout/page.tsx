'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    async function signOut() {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    }

    void signOut();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="rounded-2xl border border-slate-200 bg-white px-8 py-6 text-center shadow-sm">
        <p className="text-sm font-bold text-slate-700">
          ログアウト中です...
        </p>
      </section>
    </main>
  );
}
