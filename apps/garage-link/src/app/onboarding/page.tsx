'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { fetchStoreForOnboarding, markOnboardingComplete } from '@/lib/auth/store-onboarding';
import { createClient } from '@/lib/supabase/client';

const STEP_LABELS = ['法人・店舗の基本情報', '最初にやること', '準備完了'];

export default function OnboardingPage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    async function loadStore() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        router.replace('/login?next=/onboarding');
        return;
      }

      const { data: member } = await supabase
        .from<{ store_id: string }>('store_members')
        .select('store_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (!member?.store_id) {
        router.replace('/signup?resume=1');
        return;
      }

      const { store, errorMessage } = await fetchStoreForOnboarding(supabase, member.store_id);

      if (errorMessage || !store) {
        setLoadError(
          errorMessage
            ? translateAuthError(errorMessage)
            : '店舗情報の読み込みに失敗しました。ページを再読み込みしてください。'
        );
        setIsLoading(false);
        return;
      }

      if (store.onboarding_completed_at) {
        router.replace('/dashboard');
        return;
      }

      setStoreId(store.id);
      setCompanyName(store.company_name ?? store.name ?? '');
      setStoreName(store.name ?? '');
      setRepresentativeName(store.representative_name ?? '');
      setPhone(store.phone ?? '');
      setAddress(store.address ?? '');
      setIsLoading(false);
    }

    void loadStore();
  }, [router]);

  async function saveProfile(event?: FormEvent) {
    event?.preventDefault();
    if (!storeId) return false;

    if (!companyName.trim()) {
      setMessage('法人名は必須です。');
      return false;
    }

    if (!storeName.trim()) {
      setMessage('店舗名は必須です。');
      return false;
    }

    setIsSaving(true);
    setMessage('');
    const supabase = createClient();

    const { error } = await supabase
      .from('stores')
      .update({
        name: storeName.trim(),
        company_name: companyName.trim(),
        representative_name: representativeName.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
      })
      .eq('id', storeId);

    setIsSaving(false);

    if (error) {
      setMessage(translateAuthError(error.message));
      return false;
    }
    return true;
  }

  async function completeOnboarding() {
    if (!storeId) return;
    setIsSaving(true);
    setMessage('');
    const supabase = createClient();
    const result = await markOnboardingComplete(supabase, storeId);
    setIsSaving(false);

    if (!result.ok) {
      setMessage(translateAuthError(result.errorMessage ?? '保存に失敗しました。'));
      return;
    }

    if (result.migrationRequired) {
      setMessage(
        'オンボーディング完了の記録列が未適用のため、今回はスキップしてダッシュボードへ進みます。管理者へDB更新を依頼してください。'
      );
    }

    router.replace('/dashboard');
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <div className="text-center">
          <p className="text-sm font-semibold">店舗情報を読み込み中...</p>
          <p className="mt-2 text-xs text-slate-500">数秒かかる場合があります</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
          >
            再読み込み
          </button>
        </section>
      </main>
    );
  }

  const progressPercent = Math.round((step / 3) * 100);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto h-12 w-48 max-w-full" priority />
          <p className="mt-4 text-xs font-bold tracking-[0.2em] text-blue-600">
            STEP {step} / 3 — {STEP_LABELS[step - 1]}
          </p>
          <h1 className="mt-2 text-2xl font-bold">はじめての設定</h1>
          <p className="mt-2 text-sm text-slate-500">
            3分ほどで基本情報を登録すると、在庫登録や見積作成がスムーズになります。
          </p>
          <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {step === 1 && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await saveProfile(event);
              if (ok) setStep(2);
            }}
            className="space-y-4"
          >
            <h2 className="text-lg font-bold">法人・店舗の基本情報</h2>
            <p className="text-sm text-slate-600">
              <span className="text-red-600">*</span> は必須項目です。電話・住所は後からでも追加できます。
            </p>
            <div>
              <label htmlFor="companyName" className="mb-2 block text-sm font-bold">
                法人名 <span className="text-red-600">*</span>
              </label>
              <input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="例: 株式会社かんなぎ"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="storeName" className="mb-2 block text-sm font-bold">
                店舗名 <span className="text-red-600">*</span>
              </label>
              <input
                id="storeName"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                placeholder="例: かんなぎモータース"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="representativeName" className="mb-2 block text-sm font-bold">
                代表者名
              </label>
              <input
                id="representativeName"
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                placeholder="例: 田中 太郎"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-bold">
                電話番号（任意）
              </label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="例: 072-000-0000"
                inputMode="tel"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="address" className="mb-2 block text-sm font-bold">
                住所（任意）
              </label>
              <input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例: 大阪府枚方市..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || !companyName.trim() || !storeName.trim()}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSaving ? '保存中...' : '保存して次へ'}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">最初にやること</h2>
            <p className="text-sm text-slate-600">最初はこの3つだけで大丈夫です。</p>
            <ol className="space-y-3 text-sm leading-7 text-slate-700">
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="font-bold text-blue-700">1.</span> 車両を1台登録する（在庫管理の起点）
              </li>
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="font-bold text-blue-700">2.</span> 見積書用の会社情報・ロゴは後から
                <Link href="/settings/company" className="ml-1 font-bold text-blue-600 hover:underline">
                  会社情報設定
                </Link>
                から追加できます
              </li>
              <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="font-bold text-blue-700">3.</span> プラン変更は
                <Link href="/settings/billing" className="ml-1 font-bold text-blue-600 hover:underline">
                  プラン・契約
                </Link>
                から申込できます（Freeプランから開始）
              </li>
            </ol>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold hover:bg-slate-50"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex-1 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-2xl">
              ✓
            </div>
            <h2 className="text-lg font-bold">準備完了です</h2>
            <p className="text-sm leading-7 text-slate-600">
              まずは1台登録すると始めやすいです。困ったときはヘルプをご確認ください。
            </p>
            <Link
              href="/vehicles/new"
              className="block w-full rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              先に1台登録する
            </Link>
            <Link
              href="/help"
              className="block w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              ヘルプを見る
            </Link>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void completeOnboarding()}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSaving ? '保存中...' : 'ダッシュボードへ進む'}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setStep(2)}
              className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700"
            >
              前のステップに戻る
            </button>
          </div>
        )}

        {message && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
