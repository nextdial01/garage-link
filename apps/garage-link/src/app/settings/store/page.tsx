'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { canAddStore, formatGarageYen, getGaragePlan } from '@/lib/billing/garagePlans';
import { getActiveCompanySubscription, type CompanySubscriptionRow } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_PRIMARY_TABS, PRIMARY_TAB_OPTIONS, PURCHASE_RECOGNITION_OPTIONS, SALES_RECOGNITION_OPTIONS, resolvePrimaryTabs, sanitizePrimaryTabs, type PrimaryTabKey, type PurchaseRecognitionBasis, type SalesRecognitionBasis } from '@/lib/store/uiPreferences';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

const LONG_STAY_MIN = 1;
const LONG_STAY_MAX = 365;

type StorePreferenceRow = {
  long_stay_threshold_days: number | null;
  primary_navigation_tabs: string[] | null;
  sales_recognition_basis: SalesRecognitionBasis | null;
  purchase_recognition_basis: PurchaseRecognitionBasis | null;
};

export default function StoreSettingsPage() {
  const [role, setRole] = useState('');
  const [storeId, setStoreId] = useState('');
  const [subscription, setSubscription] = useState<CompanySubscriptionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [thresholdInput, setThresholdInput] = useState('90');
  const [thresholdSaved, setThresholdSaved] = useState(90);
  const [thresholdError, setThresholdError] = useState('');
  const [thresholdMessage, setThresholdMessage] = useState('');
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [primaryTabs, setPrimaryTabs] = useState<PrimaryTabKey[]>(DEFAULT_PRIMARY_TABS);
  const [salesBasis, setSalesBasis] = useState<SalesRecognitionBasis>('delivery');
  const [purchaseBasis, setPurchaseBasis] = useState<PurchaseRecognitionBasis>('purchase_confirmed');
  const [preferenceMessage, setPreferenceMessage] = useState('');
  const [preferenceError, setPreferenceError] = useState('');
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  useEffect(() => {
    async function loadStorePlan() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');

        setRole(member.role ?? '');
        setStoreId(member.store_id);
        setSubscription(await getActiveCompanySubscription(supabase, member.store_id));

        // 長期滞留閾値（041）。RLSにより自店舗のみ読込可能（store_id越境なし）
        const { data: storeRow, error: storeError } = await supabase
          .from<StorePreferenceRow>('stores')
          .select('long_stay_threshold_days, primary_navigation_tabs, sales_recognition_basis, purchase_recognition_basis')
          .eq('id', member.store_id)
          .single();
        if (!storeError && storeRow) {
          const v = storeRow.long_stay_threshold_days ?? 90;
          setThresholdSaved(v);
          setThresholdInput(String(v));
          setPrimaryTabs(resolvePrimaryTabs(storeRow.primary_navigation_tabs));
          setSalesBasis(storeRow.sales_recognition_basis ?? 'delivery');
          setPurchaseBasis(storeRow.purchase_recognition_basis ?? 'purchase_confirmed');
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '店舗設定の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadStorePlan();
  }, []);

  const plan = getGaragePlan(subscription?.plan);
  const storeAdditionAllowed = canAddStore(subscription);

  async function handleSaveThreshold() {
    setThresholdError(''); setThresholdMessage('');
    const trimmed = thresholdInput.trim();
    if (!/^\d+$/.test(trimmed)) {
      setThresholdError(`正の整数で${LONG_STAY_MIN}〜${LONG_STAY_MAX}の値を入力してください。`);
      return;
    }
    const n = Number(trimmed);
    if (n < LONG_STAY_MIN || n > LONG_STAY_MAX) {
      setThresholdError(`${LONG_STAY_MIN}〜${LONG_STAY_MAX}の範囲で入力してください。`);
      return;
    }
    setIsSavingThreshold(true);
    try {
      const supabase = createClient();
      // 自店舗のみ。RLS write_admin で他店舗・他社への更新は不可。
      const { error } = await supabase.from('stores').update({ long_stay_threshold_days: n }).eq('id', storeId);
      if (error) throw new Error(error.message);
      setThresholdSaved(n);
      setThresholdMessage('長期滞留の閾値を保存しました。');
    } catch (e) {
      setThresholdError(e instanceof Error ? e.message : '保存に失敗しました。');
    } finally {
      setIsSavingThreshold(false);
    }
  }

  function togglePrimaryTab(tab: PrimaryTabKey) {
    setPrimaryTabs((current) => {
      const exists = current.includes(tab);

      if (exists) {
        const next = current.filter((value) => value !== tab);
        return next.includes('menu') ? next : [...next, 'menu'];
      }

      if (current.length >= 5) {
        setPreferenceError('主タブは最大5個までです。');
        return current;
      }

      setPreferenceError('');
      const next = [...current, tab];
      return sanitizePrimaryTabs(next);
    });
  }

  async function handleSavePreferences() {
    setPreferenceError('');
    setPreferenceMessage('');

    const sanitizedTabs = sanitizePrimaryTabs(primaryTabs);
    if (sanitizedTabs.length === 0) {
      setPreferenceError('主タブを1つ以上選択してください。');
      return;
    }

    setIsSavingPreferences(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('stores')
        .update({
          primary_navigation_tabs: sanitizedTabs,
          sales_recognition_basis: salesBasis,
          purchase_recognition_basis: purchaseBasis,
        })
        .eq('id', storeId);

      if (error) {
        throw new Error(error.message);
      }

      setPrimaryTabs(sanitizedTabs);
      setPreferenceMessage('主タブと集計基準を保存しました。');
    } catch (error) {
      setPreferenceError(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSavingPreferences(false);
    }
  }

  return (
    <AppShell
      activeLabel="店舗設定"
      title="店舗設定"
      description="店舗名、住所、営業時間、通知先などを設定します"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</section>
      ) : role !== 'owner' && role !== 'admin' ? (
        <PermissionDeniedCard backHref="/settings" />
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">店舗設定</h3>
            <p className="mt-2 text-sm text-slate-500">店舗情報の編集機能は今後実装します。</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">主タブと集計基準</h3>
                <p className="mt-2 text-sm text-slate-500">
                  スマホ下部ナビに出す主タブと、売上・仕入の集計基準を設定します。主タブは最大5個までです。
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                現在 {primaryTabs.length} / 5
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PRIMARY_TAB_OPTIONS.map((option) => {
                const checked = primaryTabs.includes(option.key);
                const locked = option.key === 'menu';

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => !locked && togglePrimaryTab(option.key)}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      checked ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50/50'
                    } ${locked ? 'cursor-default' : ''}`}
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

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">売上の集計基準</p>
                <div className="mt-3 space-y-3">
                  {SALES_RECOGNITION_OPTIONS.map((option) => (
                    <label key={option.value} className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 ${salesBasis === option.value ? 'border-blue-600 bg-white' : 'border-slate-200 bg-white/70'}`}>
                      <input
                        type="radio"
                        name="salesBasis"
                        value={option.value}
                        checked={salesBasis === option.value}
                        onChange={() => setSalesBasis(option.value)}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-900">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">仕入の集計基準</p>
                <div className="mt-3 space-y-3">
                  {PURCHASE_RECOGNITION_OPTIONS.map((option) => (
                    <label key={option.value} className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 ${purchaseBasis === option.value ? 'border-blue-600 bg-white' : 'border-slate-200 bg-white/70'}`}>
                      <input
                        type="radio"
                        name="purchaseBasis"
                        value={option.value}
                        checked={purchaseBasis === option.value}
                        onChange={() => setPurchaseBasis(option.value)}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-900">{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSavePreferences}
                disabled={isSavingPreferences}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
              >
                {isSavingPreferences ? '保存中...' : '主タブと集計基準を保存する'}
              </button>
              <span className="text-xs text-slate-500">スマホ下部ナビと、今後の経営数字で使う基準です。</span>
            </div>
            {preferenceError && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{preferenceError}</p>}
            {preferenceMessage && <p className="mt-3 rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">{preferenceMessage}</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">在庫管理設定</h3>
            <p className="mt-2 text-sm text-slate-500">
              長期滞留と判定する在庫日数の閾値を設定します。ダッシュボードの「長期滞留台数」や車両一覧のハイライト・フィルタで使用されます。
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                長期滞留と判定する在庫日数
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={LONG_STAY_MIN}
                    max={LONG_STAY_MAX}
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="text-sm text-slate-700">日</span>
                </div>
              </label>
              <button
                type="button"
                onClick={handleSaveThreshold}
                disabled={isSavingThreshold}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
              >
                {isSavingThreshold ? '保存中...' : '保存する'}
              </button>
              <span className="text-xs text-slate-500">現在の保存値: {thresholdSaved}日</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">初期値は90日。指定範囲は{LONG_STAY_MIN}〜{LONG_STAY_MAX}日です。</p>
            {thresholdError && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{thresholdError}</p>}
            {thresholdMessage && <p className="mt-3 rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">{thresholdMessage}</p>}
          </section>

          <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">店舗追加のプラン制限</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">現在のプラン</p>
                <p className="mt-1 text-xl font-black text-slate-950">{plan.name}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">店舗追加</p>
                <p className="mt-1 text-xl font-black text-slate-950">{storeAdditionAllowed ? '可能' : '不可'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">追加料金</p>
                <p className="mt-1 text-xl font-black text-slate-950">{formatGarageYen(5000)}/月・店舗</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Free / Starterでは店舗追加はできません。Standard / Proでは追加店舗 {formatGarageYen(5000)}/月・店舗 で申し込めます。
            </p>
            {!storeAdditionAllowed && (
              <Link href="/settings/billing" className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                プラン変更を申し込む
              </Link>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
