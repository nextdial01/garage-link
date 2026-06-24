'use client';

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
          {error.digest ? (
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>参照コード: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: '8px',
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
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}
