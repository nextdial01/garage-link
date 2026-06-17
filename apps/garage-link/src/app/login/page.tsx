'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push('/dashboard');
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
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {message && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoading ? 'ログイン中...' : 'ログインする'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href="/signup" className="font-bold text-blue-600">
            アカウント作成
          </Link>
          <Link href="/forgot-password" className="font-bold text-slate-600">
            パスワード再設定
          </Link>
        </div>
      </section>
    </main>
  );
}
