'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { canAddStore, formatGarageYen, getGaragePlan } from '@/lib/billing/garagePlans';
import { getActiveCompanySubscription, type CompanySubscriptionRow } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

const LONG_STAY_MIN = 1;
const LONG_STAY_MAX = 365;

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
          .from<{ long_stay_threshold_days: number | null }>('stores')
          .select('long_stay_threshold_days')
          .eq('id', member.store_id)
          .single();
        if (!storeError && storeRow) {
          const v = storeRow.long_stay_threshold_days ?? 90;
          setThresholdSaved(v);
          setThresholdInput(String(v));
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
        <PermissionDeniedCard />
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">店舗設定</h3>
            <p className="mt-2 text-sm text-slate-500">店舗情報の編集機能は今後実装します。</p>
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
