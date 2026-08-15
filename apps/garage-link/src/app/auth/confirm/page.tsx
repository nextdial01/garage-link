import { parseControlledEmailConfirmation } from '@/lib/auth/controlledEmailConfirmation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type ConfirmPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export default async function AuthConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const confirmation = parseControlledEmailConfirmation({
    tokenHash: one(params.token_hash),
    type: one(params.type),
    next: one(params.next),
  });

  if (!confirmation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-700">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">確認リンクを利用できません</h1>
          <p className="mt-3 text-sm leading-6">リンクが無効または期限切れです。最初から操作をやり直してください。</p>
        </section>
      </main>
    );
  }

  // GET never consumes the token. This explicit POST protects one-time Auth
  // links from common mail-scanner and link-prefetch side effects.
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-700">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-xs font-bold tracking-[0.25em] text-blue-600">GARAGE LINK</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">
          {confirmation.type === 'recovery' ? 'パスワード再設定を続ける' : 'メールアドレスを確認する'}
        </h1>
        <p className="mt-3 text-sm leading-6">内容を確認してから、下のボタンを押してください。</p>
        <form action="/api/auth/confirm" method="post" className="mt-6">
          <input type="hidden" name="token_hash" value={confirmation.tokenHash} />
          <input type="hidden" name="type" value={confirmation.type} />
          <input type="hidden" name="next" value={confirmation.next} />
          <button type="submit" className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
            {confirmation.type === 'recovery' ? 'パスワード再設定を続ける' : 'メールアドレスを確認する'}
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500">確認はこの画面でのみ完了します。</p>
      </section>
    </main>
  );
}
