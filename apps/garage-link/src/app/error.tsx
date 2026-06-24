'use client';

import Link from 'next/link';
import { useEffect } from 'react';

// ルートセグメントの予期しない例外をユーザーに安全な画面で見せます。
// スタックトレース・内部メッセージは表示せず、識別用の digest のみ案内します。
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 内部詳細は出さず、サーバーログと突き合わせるための digest のみ記録する。
    console.error('[garage-link] unexpected client error', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">問題が発生しました</h1>
      <p className="text-sm text-slate-600">
        画面の表示中に予期しないエラーが発生しました。お手数ですが、もう一度お試しください。
      </p>
      {error.digest ? (
        <p className="text-xs text-slate-400">参照コード: {error.digest}</p>
      ) : null}
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
        >
          再試行
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ダッシュボードへ
        </Link>
      </div>
    </div>
  );
}
