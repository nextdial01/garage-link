'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function EmailOtpForm({ returnPath }: { returnPath: string }) {
  const router = useRouter();
  const requested = useRef(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('確認コードを送信しています...');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function sendCode() {
    setError('');
    const response = await fetch('/api/auth/admin-email-otp/request', { method: 'POST' });
    const result = await response.json().catch(() => ({})) as { maskedEmail?: string; retryAfter?: number; error?: string };
    if (!response.ok) {
      setMessage('');
      setError(result.error ?? '確認コードを送信できませんでした。');
      if (response.status === 429) setCooldown(60);
      return;
    }
    setMessage(`${result.maskedEmail ?? '登録済みメールアドレス'}へ6桁の確認コードを送信しました。`);
    setCooldown(result.retryAfter ?? 60);
  }

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void sendCode();
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const response = await fetch('/api/auth/admin-email-otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? '確認コードを確認できませんでした。');
      setLoading(false);
      return;
    }
    router.replace(returnPath);
    router.refresh();
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <form onSubmit={verify} className="mt-6 space-y-4">
      <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-700">
        <p>{message}</p>
        <p className="mt-1 text-xs text-slate-500">この端末では、確認後30日間は追加認証を求めません。</p>
      </div>
      <label className="block">
        <span className="text-xs font-bold text-slate-600">メールに届いた6桁コード</span>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg tracking-[0.35em] outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      <button disabled={loading || code.length !== 6} className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 px-5 py-3 text-sm font-bold text-white disabled:from-slate-300 disabled:to-slate-300">{loading ? '確認中...' : 'この端末を承認する'}</button>
      <button type="button" disabled={cooldown > 0} onClick={() => void sendCode()} className="w-full text-sm font-bold text-sky-700 disabled:text-slate-400">{cooldown > 0 ? `再送まで ${cooldown} 秒` : '確認コードを再送する'}</button>
      <button type="button" onClick={signOut} className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700">ログアウトして別のアカウントを使う</button>
    </form>
  );
}

