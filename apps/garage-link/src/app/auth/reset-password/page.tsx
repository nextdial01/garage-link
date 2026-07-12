'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { translateAuthError } from '@/lib/auth/auth-errors';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (password.length < 8) {
      setMessage('パスワードは8文字以上で入力してください。');
      return;
    }
    if (password !== confirmation) {
      setMessage('パスワードが一致しません。');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setMessage(translateAuthError(error.message));
        return;
      }
      setIsDone(true);
      await createClient().auth.signOut();
      window.setTimeout(() => router.replace('/login?notice=password_updated'), 1200);
    } catch {
      setMessage('パスワードを変更できませんでした。再設定メールをもう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold tracking-[0.25em] text-blue-600">GARAGE LINK</p>
        <h1 className="mt-3 text-2xl font-bold">新しいパスワードを設定</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">8文字以上で入力してください。</p>

        {isDone ? (
          <p className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            パスワードを変更しました。ログイン画面へ移動します。
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-bold text-slate-700">
              新しいパスワード
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              もう一度入力
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            {message && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-slate-300"
            >
              {isLoading ? '変更中...' : 'パスワードを変更する'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
