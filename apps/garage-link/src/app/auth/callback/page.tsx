'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/login';
  }
  return value;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('認証を確認しています...');

  useEffect(() => {
    let cancelled = false;

    async function completeAuth() {
      const supabase = createClient();
      const nextPath = safeNextPath(searchParams.get('next'));
      const code = searchParams.get('code');

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
          } else {
            const { data, error } = await supabase.auth.getSession();
            if (error || !data.session) throw error ?? new Error('認証情報が見つかりません');
          }
        }

        if (!cancelled) router.replace(nextPath);
      } catch {
        if (!cancelled) {
          setMessage('認証に失敗しました。再設定メールをもう一度お試しください。');
          window.setTimeout(() => router.replace('/login?error=auth_callback_failed'), 1200);
        }
      }
    }

    void completeAuth();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-700">
      <p className="rounded-xl bg-white px-6 py-4 text-sm shadow-sm">{message}</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-700">
          <p className="rounded-xl bg-white px-6 py-4 text-sm shadow-sm">認証を確認しています...</p>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
