'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { trackConversion } from '@/lib/analytics/conversion';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { fetchStoreForOnboarding, markOnboardingComplete } from '@/lib/auth/store-onboarding';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_PRIMARY_TABS, PRIMARY_TAB_OPTIONS, PURCHASE_RECOGNITION_OPTIONS, SALES_RECOGNITION_OPTIONS, resolvePrimaryTabs, sanitizePrimaryTabs, type PrimaryTabKey, type PurchaseRecognitionBasis, type SalesRecognitionBasis } from '@/lib/store/uiPreferences';

const STEP_LABELS = ['業態と基本情報', '売上の集計基準', '仕入の集計基準', '主タブと目標'];
const LONG_STAY_PRESETS = [30, 60, 90, 120];
const businessTypeOptions = ['中古車販売中心', 'バイク販売中心', '整備中心', '鈑金・修理中心', '複合型'];
const vehicleFocusOptions = ['車', 'バイク', '車とバイクの両方', 'その他'];

type ExtendedStoreRow = {
  id: string;
  name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  address?: string | null;
  representative_name?: string | null;
  onboarding_completed_at?: string | null;
  business_type?: string | null;
  vehicle_focus?: string | null;
  sales_recognition_basis?: SalesRecognitionBasis | null;
  purchase_recognition_basis?: PurchaseRecognitionBasis | null;
  long_stay_threshold_days?: number | null;
  management_target_gross_profit_yen?: number | null;
  primary_navigation_tabs?: string[] | null;
};

function cardClass(active: boolean) {
  return active
    ? 'border-blue-600 bg-blue-50 text-blue-900'
    : 'border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50/40';
}

export default function OnboardingPage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [businessType, setBusinessType] = useState('中古車販売中心');
  const [vehicleFocus, setVehicleFocus] = useState('車');
  const [salesBasis, setSalesBasis] = useState<SalesRecognitionBasis>('delivery');
  const [purchaseBasis, setPurchaseBasis] = useState<PurchaseRecognitionBasis>('purchase_confirmed');
  const [longStayThresholdDays, setLongStayThresholdDays] = useState('90');
  const [managementTargetGrossProfitYen, setManagementTargetGrossProfitYen] = useState('');
  const [primaryTabs, setPrimaryTabs] = useState<PrimaryTabKey[]>(DEFAULT_PRIMARY_TABS);
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

      const extendedStore = store as ExtendedStoreRow;
      setStoreId(store.id);
      setCompanyName(store.company_name ?? store.name ?? '');
      setStoreName(store.name ?? '');
      setRepresentativeName(store.representative_name ?? '');
      setPhone(store.phone ?? '');
      setAddress(store.address ?? '');
      setBusinessType(extendedStore.business_type ?? '中古車販売中心');
      setVehicleFocus(extendedStore.vehicle_focus ?? '車');
      setSalesBasis(extendedStore.sales_recognition_basis ?? 'delivery');
      setPurchaseBasis(extendedStore.purchase_recognition_basis ?? 'purchase_confirmed');
      setLongStayThresholdDays(String(extendedStore.long_stay_threshold_days ?? 90));
      setManagementTargetGrossProfitYen(
        extendedStore.management_target_gross_profit_yen ? String(extendedStore.management_target_gross_profit_yen) : ''
      );
      setPrimaryTabs(resolvePrimaryTabs(extendedStore.primary_navigation_tabs));
      setIsLoading(false);
    }

    void loadStore();
  }, [router]);

  const progressPercent = Math.round((step / STEP_LABELS.length) * 100);

  const reviewItems = useMemo(() => {
    return [
      { label: '業態', value: businessType },
      { label: '主な取扱い', value: vehicleFocus },
      { label: '売上の集計基準', value: SALES_RECOGNITION_OPTIONS.find((item) => item.value === salesBasis)?.label ?? salesBasis },
      { label: '仕入の集計基準', value: PURCHASE_RECOGNITION_OPTIONS.find((item) => item.value === purchaseBasis)?.label ?? purchaseBasis },
      { label: '長期在庫閾値', value: `${longStayThresholdDays || '90'}日` },
      { label: '主タブ', value: sanitizePrimaryTabs(primaryTabs).map((tab) => PRIMARY_TAB_OPTIONS.find((item) => item.key === tab)?.label ?? tab).join(' / ') },
      { label: '粗利目標', value: managementTargetGrossProfitYen ? `${Number(managementTargetGrossProfitYen).toLocaleString()}円` : '未設定' },
    ];
  }, [businessType, longStayThresholdDays, managementTargetGrossProfitYen, primaryTabs, purchaseBasis, salesBasis, vehicleFocus]);

  async function saveStep(event?: FormEvent) {
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

    if (!/^\d+$/.test(longStayThresholdDays.trim())) {
      setMessage('長期在庫の閾値は数字で入力してください。');
      return false;
    }

    const nextTabs = sanitizePrimaryTabs(primaryTabs);
    if (nextTabs.length === 0) {
      setMessage('主タブを1つ以上選択してください。');
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
        business_type: businessType,
        vehicle_focus: vehicleFocus,
        sales_recognition_basis: salesBasis,
        purchase_recognition_basis: purchaseBasis,
        long_stay_threshold_days: Number(longStayThresholdDays.trim()),
        management_target_gross_profit_yen: managementTargetGrossProfitYen.trim() ? Number(managementTargetGrossProfitYen.trim()) : null,
        primary_navigation_tabs: nextTabs,
      })
      .eq('id', storeId);

    setIsSaving(false);

    if (error) {
      setMessage(translateAuthError(error.message));
      return false;
    }

    setPrimaryTabs(nextTabs);
    return true;
  }

  async function completeOnboarding() {
    const saved = await saveStep();
    if (!saved || !storeId) return;

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
      setMessage('オンボーディング完了の記録列が未適用のため、今回はダッシュボードへ進みます。');
    }

    trackConversion('onboarding_complete');
    router.replace('/dashboard');
  }

  function togglePrimaryTab(tab: PrimaryTabKey) {
    setPrimaryTabs((current) => {
      const exists = current.includes(tab);

      if (exists) {
        const next = current.filter((value) => value !== tab);
        return next.includes('menu') ? next : [...next, 'menu'];
      }

      if (current.length >= 5) {
        setMessage('主タブは最大5個までです。');
        return current;
      }

      setMessage('');
      return sanitizePrimaryTabs([...current, tab]);
    });
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

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto h-12 w-48 max-w-full" priority />
          <p className="mt-4 text-xs font-bold tracking-[0.2em] text-blue-600">
            STEP {step} / {STEP_LABELS.length} - {STEP_LABELS[step - 1]}
          </p>
          <h1 className="mt-2 text-2xl font-bold">はじめての設定</h1>
          <p className="mt-2 text-sm text-slate-500">
            先に主タブと集計基準だけ決めておくと、あとから迷いにくくなります。
          </p>
          <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {step === 1 && (
          <form
            onSubmit={async (event) => {
              const ok = await saveStep(event);
              if (ok) setStep(2);
            }}
            className="space-y-6"
          >
            <div className="grid gap-4 md:grid-cols-2">
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
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="representativeName" className="mb-2 block text-sm font-bold">代表者名</label>
                <input
                  id="representativeName"
                  value={representativeName}
                  onChange={(e) => setRepresentativeName(e.target.value)}
                  placeholder="例: 田中 太郎"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-bold">電話番号</label>
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="例: 072-000-0000"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="address" className="mb-2 block text-sm font-bold">住所</label>
              <input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例: 大阪府枚方市..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-bold">店舗の業態</p>
                <div className="space-y-3">
                  {businessTypeOptions.map((option) => (
                    <button key={option} type="button" onClick={() => setBusinessType(option)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${cardClass(businessType === option)}`}>
                      <span className="text-sm font-black">{option}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-bold">主な取扱い</p>
                <div className="space-y-3">
                  {vehicleFocusOptions.map((option) => (
                    <button key={option} type="button" onClick={() => setVehicleFocus(option)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${cardClass(vehicleFocus === option)}`}>
                      <span className="text-sm font-black">{option}</span>
                    </button>
                  ))}
                </div>
              </div>
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
            <h2 className="text-lg font-bold">売上の集計基準</h2>
            <p className="text-sm text-slate-600">迷った場合は納車日がおすすめです。</p>
            <div className="space-y-3">
              {SALES_RECOGNITION_OPTIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setSalesBasis(option.value)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${cardClass(salesBasis === option.value)}`}>
                  <p className="text-sm font-black">{option.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold hover:bg-slate-50">
                戻る
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await saveStep();
                  if (ok) setStep(3);
                }}
                className="flex-1 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">仕入の集計基準</h2>
            <p className="text-sm text-slate-600">仕入の見方だけ、店舗の運用に合わせて決めておきます。</p>
            <div className="space-y-3">
              {PURCHASE_RECOGNITION_OPTIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setPurchaseBasis(option.value)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${cardClass(purchaseBasis === option.value)}`}>
                  <p className="text-sm font-black">{option.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(2)} className="flex-1 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold hover:bg-slate-50">
                戻る
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await saveStep();
                  if (ok) setStep(4);
                }}
                className="flex-1 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold">主タブと目標</h2>
              <p className="mt-1 text-sm text-slate-600">スマホ下部ナビに出す主タブは最大5個までです。</p>
            </div>

            <div>
              <p className="mb-3 text-sm font-bold">長期在庫の閾値</p>
              <div className="flex flex-wrap gap-3">
                {LONG_STAY_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLongStayThresholdDays(String(preset))}
                    className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${cardClass(longStayThresholdDays === String(preset))}`}
                  >
                    {preset}日
                  </button>
                ))}
                <input
                  value={longStayThresholdDays}
                  onChange={(e) => setLongStayThresholdDays(e.target.value)}
                  inputMode="numeric"
                  className="w-28 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="managementTargetGrossProfitYen" className="mb-2 block text-sm font-bold">
                月間の粗利目標（任意）
              </label>
              <input
                id="managementTargetGrossProfitYen"
                value={managementTargetGrossProfitYen}
                onChange={(e) => setManagementTargetGrossProfitYen(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="例: 500000"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold">主タブ</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {primaryTabs.length} / 5
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {PRIMARY_TAB_OPTIONS.map((option) => {
                  const checked = primaryTabs.includes(option.key);
                  const locked = option.key === 'menu';
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => !locked && togglePrimaryTab(option.key)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${cardClass(checked)} ${locked ? 'cursor-default' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{option.label}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{option.description}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {locked ? '固定' : checked ? '表示中' : '未表示'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">最終確認</p>
              <dl className="mt-3 grid gap-3 md:grid-cols-2">
                {reviewItems.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <dt className="text-xs font-bold text-slate-500">{item.label}</dt>
                    <dd className="mt-1 text-sm font-black text-slate-900">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void completeOnboarding()}
                className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? '保存中...' : '設定を完了してダッシュボードへ進む'}
              </button>
              <button type="button" onClick={() => setStep(3)} className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700">
                前のステップに戻る
              </button>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link href="/vehicles/new" className="block rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-center text-sm font-bold text-blue-700 hover:bg-blue-100">
                  先に1台登録する
                </Link>
                <Link href="/help" className="block rounded-xl border border-slate-300 px-5 py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">
                  ヘルプを見る
                </Link>
              </div>
            </div>
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
