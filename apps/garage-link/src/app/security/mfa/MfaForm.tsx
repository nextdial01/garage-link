'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'loading' | 'enroll' | 'challenge' | 'complete';

type PreparedFactor =
  | { mode: 'challenge'; factorId: string }
  | { mode: 'enroll'; factorId: string; qrCode: string; secret: string };

let pendingFactorPreparation: Promise<PreparedFactor> | null = null;

function prepareFactor() {
  if (pendingFactorPreparation) return pendingFactorPreparation;
  pendingFactorPreparation = (async () => {
    const supabase = createClient();
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const verified = factors.data.totp[0];
    if (verified) return { mode: 'challenge', factorId: verified.id } as const;

    const unverified = factors.data.all.filter(
      (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
    );
    for (const factor of unverified) {
      const removal = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removal.error) throw removal.error;
    }

    const enrollment = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'GARAGE LINK 管理者' });
    if (enrollment.error) throw enrollment.error;
    return {
      mode: 'enroll',
      factorId: enrollment.data.id,
      qrCode: enrollment.data.totp.qr_code,
      secret: enrollment.data.totp.secret,
    } as const;
  })().finally(() => { pendingFactorPreparation = null; });
  return pendingFactorPreparation;
}

export function MfaForm({ returnPath }: { returnPath: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (assurance.data?.currentLevel === 'aal2') {
        setMode('complete');
        router.replace(returnPath);
        router.refresh();
        return;
      }
      try {
        const prepared = await prepareFactor();
        if (!active) return;
        setFactorId(prepared.factorId);
        if (prepared.mode === 'enroll') {
          setQrCode(prepared.qrCode);
          setSecret(prepared.secret);
        }
        setMode(prepared.mode);
      } catch {
        if (active) setError('二段階認証を開始できませんでした。管理者に連絡してください。');
      }
    })();
    return () => { active = false; };
  }, [returnPath, router]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const result = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (result.error) {
      setError('認証コードを確認できませんでした。最新の6桁コードを入力してください。');
      setLoading(false);
      return;
    }
    router.replace(returnPath);
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (mode === 'loading' || mode === 'complete') return <p className="mt-6 text-sm text-slate-600">確認中...</p>;
  return (
    <form onSubmit={verify} className="mt-6 space-y-4">
      {mode === 'enroll' && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4">
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-slate-700">
            <p className="font-bold text-slate-900">認証アプリは「Google Authenticator」がおすすめです</p>
            <p className="mt-1">スマホへ無料でインストールし、アプリの「＋」から「QRコードをスキャン」を選んで、下のQRコードを読み取ってください。</p>
            <p className="mt-1 text-xs text-slate-600">Microsoft Authenticatorや1Passwordも利用できます。</p>
          </div>
          <p className="text-sm font-bold text-slate-800">認証アプリでQRコードを読み取ってください</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="認証アプリ登録用QRコード" className="mx-auto h-48 w-48" />
          <details className="text-xs text-slate-600"><summary>手動入力用コード</summary><code className="mt-2 block break-all rounded bg-white p-2">{secret}</code></details>
        </div>
      )}
      <label className="block">
        <span className="text-xs font-bold text-slate-600">認証アプリの6桁コード</span>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg tracking-[0.35em] outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      <button disabled={loading || code.length !== 6} className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 px-5 py-3 text-sm font-bold text-white disabled:from-slate-300 disabled:to-slate-300">{loading ? '確認中...' : '二段階認証を完了する'}</button>
      <p className="text-xs leading-5 text-slate-500">認証端末を利用できない場合は、別のオーナーまたは運用担当者へMFA解除を依頼してください。</p>
      <button type="button" onClick={signOut} className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700">ログアウトして別のアカウントを使う</button>
    </form>
  );
}
