'use client';

import Link from 'next/link';
import { useEffect } from 'react';

// レイアウト/ルートレベルの致命的例外用フォールバック。html/bodyを自前で描画する必要があります。
// スタックトレース・内部メッセージは表示しません。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[garage-link] unexpected global error', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px',
            textAlign: 'center',
            color: '#0f172a',
          }}
        >
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>問題が発生しました</h1>
          <p style={{ fontSize: '14px', color: '#475569' }}>
            予期しないエラーが発生しました。お手数ですが、もう一度お試しください。
          </p>
          <p style={{ fontSize: '13px', color: '#64748b' }}>
            入力内容が残っている場合があります。再読み込みの前に、もう一度お試しください。
          </p>
          {error.digest ? (
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>参照コード: {error.digest}</p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                borderRadius: '12px',
                background: '#16a34a',
                color: '#fff',
                fontWeight: 700,
                fontSize: '14px',
                padding: '10px 20px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              もう一度試す
            </button>
            <Link
              href="/dashboard"
              style={{
                borderRadius: '12px',
                background: '#fff',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '14px',
                padding: '10px 20px',
                border: '1px solid #cbd5e1',
                textDecoration: 'none',
              }}
            >
              トップへ戻る
            </Link>
            <Link
              href="/login"
              style={{
                borderRadius: '12px',
                background: '#fff',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '14px',
                padding: '10px 20px',
                border: '1px solid #cbd5e1',
                textDecoration: 'none',
              }}
            >
              ログイン画面へ
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
