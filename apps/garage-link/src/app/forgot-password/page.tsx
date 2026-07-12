'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsSuccess(false);
    setIsLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });

    setIsLoading(false);

    if (error) {
      setMessage(translateAuthError(error.message));
      return;
    }

    setIsSuccess(true);
    setMessage('再設定メールを送りました。届かないときは迷惑メールもご確認ください。');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-[0.25em] text-blue-600">
            GARAGE LINK
          </p>
          <h1 className="mt-2 text-2xl font-bold">パスワード再設定</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            登録済みのメールアドレスに再設定メールを送ります
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
              placeholder="例: tanaka@example.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {message && (
            <p
              className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                isSuccess
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoading ? '送信中...' : 'メールを送る'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-bold text-blue-600">
            ログインへ戻る
          </Link>
        </p>
      </section>
    </main>
  );
}
