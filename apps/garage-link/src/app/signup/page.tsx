'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (password !== passwordConfirmation) {
      setMessage('パスワードとパスワード確認が一致しません。');
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setMessage(signUpError.message);
      setIsLoading(false);
      return;
    }

    if (!authData.user?.id || !authData.session) {
      setMessage('確認メールを送信しました。メール確認後にログインしてください。');
      setIsLoading(false);
      return;
    }

    const { error: onboardingError } = await supabase.rpc(
      'create_store_for_current_user',
      {
        store_name: storeName,
        owner_display_name: displayName,
      }
    );

    setIsLoading(false);

    if (onboardingError) {
      setMessage(onboardingError.message);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex justify-center rounded-2xl bg-white px-4 py-2">
            <BrandLogo className="h-16 w-64 max-w-full sm:h-20" priority />
          </div>
          <h1 className="mt-4 text-2xl font-bold">アカウント作成</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            店舗情報とログイン情報を登録します
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="storeName"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              店舗名
            </label>
            <input
              id="storeName"
              type="text"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              担当者名
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

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

          <div className="grid gap-5 sm:grid-cols-2">
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

            <div>
              <label
                htmlFor="passwordConfirmation"
                className="mb-2 block text-sm font-bold text-slate-700"
              >
                パスワード確認
              </label>
              <input
                id="passwordConfirmation"
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>
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
            {isLoading ? '作成中...' : 'アカウントを作成する'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          すでにアカウントをお持ちの場合は{' '}
          <Link href="/login" className="font-bold text-blue-600">
            ログイン
          </Link>
        </p>
      </section>
    </main>
  );
}
