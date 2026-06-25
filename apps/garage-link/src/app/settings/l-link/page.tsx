'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';
import {
  GARAGE_PLAN_ORDER,
  GARAGE_PLANS,
  formatGarageYen,
  getGaragePlan,
  normalizeGaragePlanCode,
  canUseLLinkIntegration,
} from '@/lib/billing/garagePlans';
import { getActiveCompanySubscription, type CompanySubscriptionRow } from '@/lib/billing/garageSubscription';
import { getRoleLabel } from '@/lib/auth/permissions';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type StoreRow = {
  id: string;
  name: string | null;
  company_name: string | null;
};

const lLinkAppUrl = process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? 'http://localhost:3001';

function availabilityText(enabled: boolean) {
  return enabled ? 'L-Link連携可' : 'L-Link連携不可';
}

export default function LLinkIntegrationPage() {
  const [role, setRole] = useState('');
  const [store, setStore] = useState<StoreRow | null>(null);
  const [subscription, setSubscription] = useState<CompanySubscriptionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function loadIntegrationStatus() {
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

        const { data: storeData } = await supabase
          .from<StoreRow>('stores')
          .select('id, name, company_name')
          .eq('id', member.store_id)
          .single();
        setStore(storeData ?? { id: member.store_id, name: null, company_name: null });

        const subscriptionData = await getActiveCompanySubscription(supabase, member.store_id);
        setSubscription(subscriptionData ?? { plan: 'free', status: 'active', updated_at: null });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'L-Link連携状態の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadIntegrationStatus();
  }, []);

  const currentPlanCode = normalizeGaragePlanCode(subscription?.plan);
  const currentPlan = getGaragePlan(currentPlanCode);
  const canUseLLink = canUseLLinkIntegration(subscription);
  const planRows = useMemo(
    () => GARAGE_PLAN_ORDER.map((code) => {
      const plan = GARAGE_PLANS[code];
      return {
        code,
        name: plan.name,
        price: formatGarageYen(plan.monthlyPrice),
        available: plan.lLinkIntegrationEnabled,
      };
    }),
    [],
  );

  return (
    <AppShell
      activeLabel="L-Link連携"
      title="L-Link連携"
      description="GARAGE LINKからL-Linkへ接続できる契約状態と、L-Linkアプリへの導線を確認します。"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</section>
      ) : role !== 'owner' && role !== 'admin' ? (
        <PermissionDeniedCard message="L-Link連携状態の確認は店舗オーナー、管理者のみ利用できます。" backHref="/settings" />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black text-blue-700">GARAGE LINK契約状態</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">{currentPlan.name}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  対象会社: {store?.company_name || store?.name || '-'} / 現在の権限: {getRoleLabel(role)}
                </p>
              </div>
              <span className={`inline-flex rounded-full px-4 py-2 text-sm font-black ${canUseLLink ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                {availabilityText(canUseLLink)}
              </span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-500">連携条件</p>
                <p className="mt-2 text-lg font-black text-slate-950">Standard / Pro</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-500">Free / Starter</p>
                <p className="mt-2 text-lg font-black text-slate-950">L-Link連携不可</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-500">Standard / Pro</p>
                <p className="mt-2 text-lg font-black text-slate-950">L-Link連携可</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-green-100 bg-green-50 p-5">
              <h3 className="text-lg font-black text-slate-950">L-Linkは別SaaSです</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                LINE配信、シナリオ配信、回答フォーム、リッチメニュー、Webhook設定などのLINE本体機能はL-Link側で管理します。
                GARAGE LINK側では連携可否と契約状態だけを確認します。
                <span className="mt-1 block font-bold text-slate-700">GARAGE LINKからLINEへ直接送信することはありません。</span>
              </p>

              <div className="mt-4 rounded-xl border border-green-100 bg-white p-4">
                <p className="text-sm font-bold text-slate-700">GARAGE LINKからL-Linkへ連携する対象</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                  <li>車検案内候補</li>
                  <li>点検案内候補</li>
                  <li>買い替え提案候補</li>
                  <li>商談フォロー候補</li>
                  <li>顧客セグメント条件</li>
                  <li>テンプレート候補</li>
                </ul>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  ※ GARAGE LINKがL-Linkへ渡すのは「配信候補」または「配信下書きの作成要求」までです。
                  実際のLINE送信・友だち管理・Webhook処理はL-Link側で行います。
                  なお、データ連携APIは順次提供予定の機能を含みます（提供状況はL-Link側の案内に従ってください）。
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={lLinkAppUrl}
                  className={`rounded-xl px-5 py-3 text-sm font-black text-white shadow-sm transition ${canUseLLink ? 'bg-green-600 hover:bg-green-700' : 'pointer-events-none bg-slate-300'}`}
                  aria-disabled={!canUseLLink}
                >
                  L-Linkアプリへ移動
                </a>
                {!canUseLLink && (
                  <>
                    <p className="w-full text-sm font-bold text-amber-700">L-Link連携はStandard以上で利用できます。</p>
                    <Link href="/settings/billing" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50">
                      プラン・契約を確認
                    </Link>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-lg font-black text-slate-950">プラン別L-Link連携可否</h3>
              <p className="mt-1 text-sm text-slate-500">GARAGE LINKの料金表では、L-Link連携として扱います。</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">プラン</th>
                    <th className="px-5 py-4 text-right">月額</th>
                    <th className="px-5 py-4 text-right">L-Link連携</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {planRows.map((row) => (
                    <tr key={row.code} className={row.code === currentPlanCode ? 'bg-blue-50/60' : 'hover:bg-slate-50'}>
                      <td className="px-5 py-4 font-black text-slate-950">{row.name}</td>
                      <td className="px-5 py-4 text-right">{row.price}</td>
                      <td className="px-5 py-4 text-right font-bold">{availabilityText(row.available)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
