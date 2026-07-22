'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminAccessForm({ returnPath }: { returnPath: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch('/api/security/admin-access')
      .then(async (response) => ({ response, result: await response.json().catch(() => null) as { configured?: boolean; error?: string } | null }))
      .then(({ response, result }) => {
        if (!response.ok) setError(result?.error ?? '管理者アクセス設定を確認できませんでした。');
        else setConfigured(Boolean(result?.configured));
      });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!configured && code !== confirmation) {
      setError('確認用のアクセスコードが一致しません。');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/security/admin-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? '管理者アクセスの確認に失敗しました。');
        return;
      }
      router.replace(returnPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-xs font-bold text-slate-600">{configured ? '管理者アクセスコード' : '新しい管理者アクセスコード（12文字以上）'}</span>
        <input type="password" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
      </label>
      {configured === false && (
        <label className="block">
          <span className="text-xs font-bold text-slate-600">確認用アクセスコード</span>
          <input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
        </label>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      <button disabled={loading || configured === null || code.length < 12 || (!configured && confirmation.length < 12)} className="w-full rounded-xl bg-[#061735] px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">{loading ? '確認中...' : configured ? '管理者画面へ進む' : 'コードを設定して進む'}</button>
    </form>
  );
}
