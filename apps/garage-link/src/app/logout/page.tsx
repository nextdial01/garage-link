'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    async function signOut() {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
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
