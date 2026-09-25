'use client';

import Link from 'next/link';
import { useHydrated } from '@/lib/browser/useHydrated';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { loginErrorMessage } from '@/lib/auth/login-error-contract';
import { releaseQaRunId } from '@/lib/auth/releaseQaCallback';

export function GarageLoginForm({ embedded = false }: { embedded?: boolean }) {
  const isHydrated = useHydrated();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');
  const qaRunId = releaseQaRunId(searchParams.get('qa_run'));
  const forgotPasswordHref = `/forgot-password${qaRunId ? `?qa_run=${encodeURIComponent(qaRunId)}` : ''}`;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaContainer = useRef<HTMLDivElement>(null);
  const captchaEnabled = process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION === 'true';
  const captchaSiteKey = process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY ?? '1x00000000000000000000AA';

  useEffect(() => {
    if (!captchaEnabled) return;
    const browser = window as typeof window & {
      turnstile?: {
        render: (target: HTMLElement, options: Record<string, unknown>) => string;
        remove: (widgetId: string) => void;
      };
      onGarageTurnstileLoad?: () => void;
    };
    let active = true;
    let widgetId: string | undefined;
    const renderWidget = () => {
      if (!active || !browser.turnstile || !captchaContainer.current || widgetId !== undefined) return;
      widgetId = browser.turnstile.render(captchaContainer.current, {
        sitekey: captchaSiteKey,
        callback: (token: string) => { if (active) setCaptchaToken(token); },
        'expired-callback': () => { if (active) setCaptchaToken(null); },
        'error-callback': () => { if (active) setCaptchaToken(null); },
      });
    };
    browser.onGarageTurnstileLoad = renderWidget;
    // Next reuses the loaded Script when client navigation mounts this form again.
    renderWidget();
    return () => {
      active = false;
      if (widgetId !== undefined) browser.turnstile?.remove(widgetId);
      if (browser.onGarageTurnstileLoad === renderWidget) delete browser.onGarageTurnstileLoad;
    };
  }, [captchaEnabled, captchaSiteKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);

    if (captchaEnabled && !captchaToken) {
      setMessage('ボット対策の確認を完了してください。');
      setIsLoading(false);
      return;
    }

    const response = await fetch('/api/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        captchaToken: captchaEnabled ? captchaToken : undefined,
      }),
    }).catch(() => null);
    if (!response) {
      setMessage('ログインサーバーへ接続できませんでした。時間をおいて再試行してください。');
      setIsLoading(false);
      return;
    }
    const result = await response.json().catch(() => null) as { code?: string } | null;

    if (!response.ok) {
      setMessage(loginErrorMessage(result?.code));
      const browser = window as typeof window & { turnstile?: { reset: () => void } };
      browser.turnstile?.reset();
      setCaptchaToken(null);
      setIsLoading(false);
      return;
    }

    const redirectPath = nextPath?.startsWith('/') && !nextPath.startsWith('//') && !/[\\\x00-\x1f]/.test(nextPath) && !['/login', '/signup', '/security/email-otp', '/security/mfa'].includes(nextPath.split(/[?#]/)[0]) ? nextPath : '/dashboard';
    // A fresh document consumes the new server cookie without stale client auth or router caches.
    window.location.replace(redirectPath);
  }

  const card = (
    <section className="w-full rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_55px_rgba(15,35,70,0.10)] sm:p-9">
      <div className="mb-6 text-center">
        {!embedded && (
          <div className="mx-auto flex justify-center rounded-2xl bg-white px-4 py-2">
            <BrandLogo className="h-16 w-64 max-w-full sm:h-20" priority />
          </div>
        )}
        <h1 className={`${embedded ? '' : 'mt-4 '}text-xl font-black text-[#061735]`}>ログイン</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          メールアドレスとパスワードでログインします
        </p>
        {nextPath && nextPath !== '/dashboard' && (
          <p className="mt-3 rounded-xl bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">
            ログイン後、元のページ（{nextPath}）へ移動します
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-bold text-slate-600">
            メールアドレス <span className="text-red-600">*</span>
          </label>
          <input
            id="email"
            name="email"
            disabled={!isHydrated || isLoading}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="メールアドレス"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-xs font-bold text-slate-600">
              パスワード <span className="text-red-600">*</span>
            </label>
            <Link href={forgotPasswordHref} className="text-xs font-bold text-blue-600 hover:underline">
              忘れた方はこちら
            </Link>
          </div>
          <input
            id="password"
            name="password"
            disabled={!isHydrated || isLoading}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            placeholder="パスワード"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          />
        </div>

        {message && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {message}
          </p>
        )}

        {captchaEnabled && (
          <div className="flex justify-center">
            <div id="garage-login-turnstile" ref={captchaContainer} />
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onGarageTurnstileLoad" strategy="lazyOnload" />
          </div>
        )}

        <button
          type="submit"
          disabled={!isHydrated || isLoading || !email.trim() || !password}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(14,165,233,0.20)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300"
        >
          {isLoading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        アカウントをお持ちでない方は{' '}
        <Link href="/signup" className="font-bold text-blue-600 hover:underline">
          新規登録
        </Link>
      </p>
    </section>
  );

  if (embedded) {
    return card;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <div className="w-full max-w-md">{card}</div>
    </main>
  );
}
