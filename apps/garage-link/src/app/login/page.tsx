'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { resolvePostAuthPath } from '@/lib/auth/post-auth-redirect';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(translateAuthError(error.message));
      setIsLoading(false);
      return;
    }

    if (!data.user?.id) {
      setMessage('ログインに失敗しました。もう一度お試しください。');
      setIsLoading(false);
      return;
    }

    const redirectPath = await resolvePostAuthPath(supabase, data.user.id, { nextPath });
    router.replace(redirectPath);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex justify-center rounded-2xl bg-white px-4 py-2">
            <BrandLogo className="h-16 w-64 max-w-full sm:h-20" priority />
          </div>
          <h1 className="mt-4 text-2xl font-bold">ログイン</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            メールアドレスとパスワードでログインします
          </p>
          {nextPath && nextPath !== '/dashboard' && (
            <p className="mt-3 rounded-xl bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">
              ログイン後、元のページ（{nextPath}）へ移動します
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              メールアドレス <span className="text-red-600">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="例: tanaka@example.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              パスワード <span className="text-red-600">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {message && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !email.trim() || !password}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoading ? 'ログイン中...' : 'ログインする'}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link href="/signup" className="font-bold text-blue-600">
            初めての方：アカウント作成
          </Link>
          <Link href="/forgot-password" className="font-bold text-slate-600">
            パスワードを忘れた
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          読み込み中...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
