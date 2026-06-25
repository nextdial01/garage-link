import { createBrowserClient } from '@supabase/ssr';

// Supabaseブラウザクライアントは1ページに1インスタンスのみが正しい使い方。
// 複数 GoTrueClient が同じ localStorage / navigator.locks を奪い合うと、
// 2回目以降の auth/rpc/update が pending のまま戻らない問題が発生する
// （"Multiple GoTrueClient instances detected"）。
// このリポジトリでは createClient() を各ハンドラ内で個別に呼んでいる箇所が多数あるため、
// 呼び出し方は変えず、ファクトリ側でブラウザでのみ singleton 化することで根本対処する。
// サーバ側（SSR/Route Handler）からは呼ばれない前提だが、念のため window 不在時は毎回新規生成する。
type BrowserClient = ReturnType<typeof createBrowserClient>;
let browserSingleton: BrowserClient | null = null;

// ロックを直列化する軽量フォールバック。
// 既定の navigator.locks は別タブや前バージョンのページが取得したロックが
// 開放されないと無期限にブロックされうるため、シングルトン前提のこのアプリでは
// プロセス内（タブ内）の単純な Promise チェーンで十分。
let lockChain: Promise<unknown> = Promise.resolve();
function processLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const next = lockChain.then(() => fn());
  lockChain = next.catch(() => undefined);
  return next;
}

export function createClient(): BrowserClient {
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    );
  }
  if (browserSingleton) return browserSingleton;
  browserSingleton = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { lock: processLock } }
  );
  return browserSingleton;
}
