'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { resolvePostAuthPath } from '@/lib/auth/post-auth-redirect';
import { createClient } from '@/lib/supabase/client';

export function GarageLoginForm({ embedded = false }: { embedded?: boolean }) {
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

  const card = (
    <section className="w-full rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_55px_rgba(15,35,70,0.10)] sm:p-9">
      <div className="mb-6 text-center">
        {!embedded && (
          <div className="mx-auto flex justify-center rounded-2xl bg-white px-4 py-2">
            <BrandLogo className="h-16 w-64 max-w-full sm:h-20" priority />
          </div>
        )}
        <h1 className={`${embedded ? '' : 'mt-4 '}text-xl font-black text-[#061735]`}>ログイン</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          メールアドレスとパスワードでログインします
        </p>
        {nextPath && nextPath !== '/dashboard' && (
          <p className="mt-3 rounded-xl bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">
            ログイン後、元のページ（{nextPath}）へ移動します
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-bold text-slate-600">
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
            placeholder="メールアドレス"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-xs font-bold text-slate-600">
              パスワード <span className="text-red-600">*</span>
            </label>
            <Link href="/forgot-password" className="text-xs font-bold text-blue-600 hover:underline">
              忘れた方はこちら
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            placeholder="パスワード"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
        </div>

        {message && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading || !email.trim() || !password}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(14,165,233,0.20)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300"
        >
          {isLoading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className="font-bold text-blue-600 hover:underline">
          新規登録
        </Link>
      </p>
    </section>
  );

  if (embedded) {
    return card;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <div className="w-full max-w-md">{card}</div>
    </main>
  );
}
