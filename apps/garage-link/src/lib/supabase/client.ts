import { createBrowserClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Supabaseブラウザクライアントは1ページに1インスタンスのみが正しい使い方。
// 複数 GoTrueClient が同じ localStorage / navigator.locks を奪い合うと、
// 2回目以降の auth/rpc/update が pending のまま戻らない問題が発生する
// （"Multiple GoTrueClient instances detected"）。
// このリポジトリでは createClient() を各ハンドラ内で個別に呼んでいる箇所が多数あるため、
// 呼び出し方は変えず、ファクトリ側でブラウザでのみ singleton 化することで根本対処する。
// サーバ側（SSR/Route Handler）からは呼ばれない前提だが、念のため window 不在時は毎回新規生成する。
type BrowserClient = ReturnType<typeof createBrowserClient>;
let browserSingleton: BrowserClient | null = null;
const RELEASE_QA_RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGING_RELEASE_QA_HOST = /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i;
const QA_COOKIE_PREFIX = 'base64-';
const QA_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

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
    ) as unknown as BrowserClient;
  }
  if (browserSingleton) return browserSingleton;
  browserSingleton = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { lock: processLock } }
  ) as unknown as BrowserClient;
  return browserSingleton;
}

// A Manual Gmail checkpoint necessarily opens the action link in an operator
// browser rather than the headless browser that submitted the QA form. PKCE's
// verifier is intentionally local to that original browser, so it cannot be
// transferred to a human browser. Restrict implicit flow to a validated,
// run-bound Staging preview only; Production and every ordinary user retain
// the default PKCE client.
export function isStagingReleaseQaImplicitFlow(runId: string | null | undefined, hostname: string): boolean {
  return typeof runId === 'string' && RELEASE_QA_RUN_ID.test(runId) && STAGING_RELEASE_QA_HOST.test(hostname);
}

// @supabase/ssr intentionally forces PKCE. The Manual Gmail QA browser is a
// separate browser, so it needs implicit flow while still persisting sessions
// in the exact cookie format consumed by the ordinary SSR client and
// middleware. This uses the package's public chunk/encoding helpers rather
// than a localStorage fallback, so the session reaches the next navigation.
function createReleaseQaCookieStorage() {
  const cookies = () => Object.fromEntries(
    document.cookie.split(';').flatMap((entry) => {
      const separator = entry.indexOf('=');
      return separator < 1 ? [] : [[entry.slice(0, separator).trim(), entry.slice(separator + 1)]];
    }),
  ) as Record<string, string>;
  const write = (name: string, value: string, maxAge: number) => {
    document.cookie = `${name}=${value}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
  };
  const isChunk = (name: string, key: string) => name === key || new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[0-9]+$`).test(name);
  const encode = (value: string) => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
  };
  const decode = (value: string) => {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  };
  const chunks = (key: string, value: string) => value.length <= 3180
    ? [{ name: key, value }]
    : Array.from({ length: Math.ceil(value.length / 3180) }, (_, index) => ({ name: `${key}.${index}`, value: value.slice(index * 3180, (index + 1) * 3180) }));
  return {
    getItem: async (key: string) => {
      const all = cookies();
      const value = all[key] ?? Array.from({ length: 16 }, (_, index) => all[`${key}.${index}`]).filter(Boolean).join('');
      if (!value) return null;
      if (!value.startsWith(QA_COOKIE_PREFIX)) return value;
      try {
        const decoded = decode(value.slice(QA_COOKIE_PREFIX.length));
        JSON.parse(decoded);
        return decoded;
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string) => {
      const existing = Object.keys(cookies()).filter((name) => isChunk(name, key));
      const nextChunks = chunks(key, `${QA_COOKIE_PREFIX}${encode(value)}`);
      const next = new Set(nextChunks.map(({ name }) => name));
      existing.filter((name) => !next.has(name)).forEach((name) => write(name, '', 0));
      nextChunks.forEach(({ name, value: chunk }) => write(name, chunk, QA_COOKIE_MAX_AGE));
    },
    removeItem: async (key: string) => {
      Object.keys(cookies()).filter((name) => isChunk(name, key)).forEach((name) => write(name, '', 0));
    },
  };
}

export function createReleaseQaManualEmailClient(runId: string | null | undefined): BrowserClient {
  if (typeof window === 'undefined' || !isStagingReleaseQaImplicitFlow(runId, window.location.hostname)) {
    return createClient();
  }
  if (browserSingleton) return browserSingleton;
  browserSingleton = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { lock: processLock, flowType: 'implicit', storage: createReleaseQaCookieStorage() } },
  ) as unknown as BrowserClient;
  return browserSingleton;
}
