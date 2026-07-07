'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { isEmailConfirmationRequired, translateAuthError } from '@/lib/auth/auth-errors';
import { createClient } from '@/lib/supabase/client';

const MIN_PASSWORD_LENGTH = 6;

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isResumeMode = searchParams.get('resume') === '1';

  const [storeName, setStoreName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(isResumeMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResumeOnly, setIsResumeOnly] = useState(false);

  useEffect(() => {
    async function detectResumeMode() {
      if (!isResumeMode) {
        return;
      }

      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        setIsBootstrapping(false);
        return;
      }

      const { data: member } = await supabase
        .from<{ store_id: string }>('store_members')
        .select('store_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (!member?.store_id) {
        setIsResumeOnly(true);
        setEmail(userData.user.email ?? '');
      }

      setIsBootstrapping(false);
    }

    void detectResumeMode();
  }, [isResumeMode]);

  async function createStoreForUser(supabase: ReturnType<typeof createClient>) {
    const { error: onboardingError } = await supabase.rpc('create_store_for_current_user', {
      store_name: storeName.trim(),
      owner_display_name: displayName.trim(),
    });

    if (onboardingError) {
      setMessage(translateAuthError(onboardingError.message));
      return false;
    }
    return true;
  }

  async function handleResumeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setInfoMessage('');

    if (!storeName.trim()) {
      setMessage('店舗名を入力してください。');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const ok = await createStoreForUser(supabase);
    setIsSubmitting(false);

    if (ok) {
      router.replace('/onboarding');
    }
  }

  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setInfoMessage('');

    if (!acceptedTerms) {
      setMessage('利用規約とプライバシーポリシーへの同意が必要です。下のチェックボックスにチェックを入れてください。');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`);
      return;
    }

    if (password !== passwordConfirmation) {
      setMessage('パスワードとパスワード確認が一致しません。もう一度確認してください。');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (signUpError) {
      setMessage(translateAuthError(signUpError.message));
      setIsSubmitting(false);
      return;
    }

    if (!authData.user?.id || !authData.session) {
      setInfoMessage('確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。');
      setIsSubmitting(false);
      return;
    }

    const ok = await createStoreForUser(supabase);
    setIsSubmitting(false);

    if (ok) {
      router.replace('/onboarding');
    }
  }

  if (isBootstrapping) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        読み込み中...
      </main>
    );
  }

  if (isResumeOnly) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <BrandLogo className="mx-auto h-16 w-64 max-w-full sm:h-20" priority />
            <p className="mt-4 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              続きから再開
            </p>
            <h1 className="mt-3 text-2xl font-bold">店舗情報の登録</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              アカウント（{email}）は作成済みです。店舗名と担当者名を入力して、設定を続けてください。
            </p>
          </div>

          <form onSubmit={handleResumeSubmit} className="space-y-5">
            <div>
              <label htmlFor="storeName" className="mb-2 block text-sm font-bold text-slate-700">
                店舗名 <span className="text-red-600">*</span>
              </label>
              <input
                id="storeName"
                type="text"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                required
                placeholder="例: かんなぎモータース"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="displayName" className="mb-2 block text-sm font-bold text-slate-700">
                担当者名 <span className="text-red-600">*</span>
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                placeholder="例: 田中 太郎"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {message && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !storeName.trim() || !displayName.trim()}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? '登録中...' : '店舗を作成して次へ'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const canSubmit =
    acceptedTerms &&
    storeName.trim() &&
    displayName.trim() &&
    email.trim() &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === passwordConfirmation &&
    !isSubmitting;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <BrandLogo className="mx-auto h-16 w-64 max-w-full sm:h-20" priority />
          <p className="mt-4 text-xs font-bold tracking-[0.2em] text-blue-600">STEP 1 / 2</p>
          <h1 className="mt-2 text-2xl font-bold">アカウント作成</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            無料プランから始められます。入力後、初期設定（約3分）に進みます。
          </p>
        </div>

        <ol className="mb-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <li className="font-bold text-blue-700">1. この画面でアカウント作成</li>
          <li>2. 店舗の基本情報を登録（オンボーディング）</li>
          <li>3. ダッシュボードから在庫登録を開始</li>
        </ol>

        <form onSubmit={handleSignupSubmit} className="space-y-5">
          <div>
            <label htmlFor="storeName" className="mb-2 block text-sm font-bold text-slate-700">
              店舗名 <span className="text-red-600">*</span>
            </label>
            <input
              id="storeName"
              type="text"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              required
              placeholder="例: かんなぎモータース"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            <p className="mt-1 text-xs text-slate-500">見積書・請求書に表示される名称です</p>
          </div>

          <div>
            <label htmlFor="displayName" className="mb-2 block text-sm font-bold text-slate-700">
              担当者名 <span className="text-red-600">*</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              placeholder="例: 田中 太郎"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-bold text-slate-700">
              メールアドレス <span className="text-red-600">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="例: tanaka@example.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-bold text-slate-700">
                パスワード <span className="text-red-600">*</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
              <p className="mt-1 text-xs text-slate-500">{MIN_PASSWORD_LENGTH}文字以上</p>
            </div>

            <div>
              <label
                htmlFor="passwordConfirmation"
                className="mb-2 block text-sm font-bold text-slate-700"
              >
                パスワード確認 <span className="text-red-600">*</span>
              </label>
              <input
                id="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-4 ${
                  passwordConfirmation && password !== passwordConfirmation
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'
                }`}
              />
              {passwordConfirmation && password !== passwordConfirmation && (
                <p className="mt-1 text-xs font-semibold text-red-600">パスワードが一致しません</p>
              )}
            </div>
          </div>

          <label
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
              acceptedTerms
                ? 'border-green-200 bg-green-50 text-slate-700'
                : 'border-amber-200 bg-amber-50 text-slate-700'
            }`}
          >
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <Link href="/legal/terms" className="font-bold text-blue-600 hover:underline" target="_blank">
                利用規約
              </Link>
              と
              <Link href="/legal/privacy" className="font-bold text-blue-600 hover:underline" target="_blank">
                プライバシーポリシー
              </Link>
              に同意します
            </span>
          </label>

          {!acceptedTerms && (
            <p className="text-xs font-semibold text-amber-800">
              送信するには、上の同意チェックが必要です
            </p>
          )}

          {infoMessage && (
            <p role="status" className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
              {infoMessage}
              {!isEmailConfirmationRequired(infoMessage) && (
                <span className="mt-2 block">
                  <Link href="/login" className="underline">
                    ログイン画面へ
                  </Link>
                </span>
              )}
            </p>
          )}

          {message && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? '作成中...' : '無料でアカウントを作成する'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          すでにアカウントをお持ちの場合は{' '}
          <Link href="/login" className="font-bold text-blue-600">
            ログイン
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          読み込み中...
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
