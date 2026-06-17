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

export default function StoreSettingsPage() {
  const [role, setRole] = useState('');
  const [subscription, setSubscription] = useState<CompanySubscriptionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

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
        setSubscription(await getActiveCompanySubscription(supabase, member.store_id));
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
