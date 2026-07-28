'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AcceptMembershipPage() {
  const [state, setState] = useState<'checking' | 'login' | 'accepting' | 'done' | 'error'>('checking');
  const [message, setMessage] = useState('招待を確認しています。');

  useEffect(() => {
    async function accept() {
      const values = new URLSearchParams(window.location.hash.slice(1));
      const membershipId = values.get('membership');
      const token = values.get('token');
      if (!membershipId || !token) {
        setState('error');
        setMessage('招待リンクが不正です。管理者へ再発行を依頼してください。');
        return;
      }
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setState('login');
        setMessage('招待対象のメールアドレスでログインしてから、このリンクをもう一度開いてください。');
        return;
      }
      setState('accepting');
      setMessage('招待を承認しています。');
      const { data, error } = await supabase.rpc('accept_membership_invite', {
        p_membership_id: membershipId,
        p_invite_token: token,
      });
      const result = data as { ok?: boolean } | null;
      if (error || !result?.ok) {
        setState('error');
        setMessage('招待を承認できませんでした。期限・取消状態・ログイン中のメールアドレスを確認してください。');
        return;
      }
      window.history.replaceState(null, '', '/membership/accept');
      setState('done');
      setMessage('参加が完了しました。');
    }
    void accept();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">GARAGE LINK メンバー招待</h1>
        <p className={`mt-4 text-sm leading-6 ${state === 'error' ? 'text-red-700' : 'text-slate-600'}`}>{message}</p>
        <div className="mt-6 flex gap-3">
          {state === 'login' && <Link href="/login" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">ログインする</Link>}
          {state === 'done' && <Link href="/dashboard" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">ダッシュボードへ</Link>}
          {state === 'error' && <Link href="/login" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">ログイン画面へ</Link>}
        </div>
      </section>
    </main>
  );
}
