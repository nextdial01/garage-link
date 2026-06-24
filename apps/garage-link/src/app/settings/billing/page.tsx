'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import {
  GARAGE_PLAN_ORDER,
  GARAGE_PLANS,
  canAddStaff,
  canAddStorage,
  canAddStore,
  formatGarageYen,
  formatStorage,
  getGaragePlan,
  normalizeGaragePlanCode,
  type GaragePlanCode,
} from '@/lib/billing/garagePlans';
import { getActiveCompanySubscription } from '@/lib/billing/garageSubscription';
import { getRoleLabel } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type StoreRow = {
  id: string;
  name: string | null;
  company_name: string | null;
};

type CompanySubscriptionRow = {
  id: string;
  company_id: string;
  plan: string;
  status: string;
  included_staff_count: number;
  extra_staff_count: number;
  included_store_count: number;
  extra_store_count: number;
  storage_limit_mb: number;
  extra_storage_gb: number;
  current_inventory_limit: number;
  l_link_integration_enabled: boolean;
  started_at: string | null;
  updated_at: string | null;
};

type RequestType = 'plan_change' | 'add_staff' | 'add_store' | 'add_storage' | 'support';

type FormState = {
  request_type: RequestType;
  requested_plan: GaragePlanCode;
  requested_extra_staff_count: string;
  requested_extra_store_count: string;
  requested_extra_storage_gb: string;
  support_hours: string;
  message: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const requestTypeLabels: Record<RequestType, string> = {
  plan_change: 'プラン変更',
  add_staff: 'スタッフ追加',
  add_store: '店舗追加',
  add_storage: 'ストレージ追加',
  support: '個別サポート',
};

function toNonNegativeInt(value: string) {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toNonNegativeNumber(value: string) {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default function BillingSettingsPage() {
  const [role, setRole] = useState('');
  const [store, setStore] = useState<StoreRow | null>(null);
  const [subscription, setSubscription] = useState<CompanySubscriptionRow | null>(null);
  const [form, setForm] = useState<FormState>({
    request_type: 'plan_change',
    requested_plan: 'starter',
    requested_extra_staff_count: '1',
    requested_extra_store_count: '1',
    requested_extra_storage_gb: '10',
    support_hours: '1',
    message: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    async function loadBilling() {
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

        const subscriptionData = await getActiveCompanySubscription(supabase, member.store_id, { ensure: true });
        setSubscription(subscriptionData as CompanySubscriptionRow);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '契約情報の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadBilling();
  }, []);

  const currentPlanCode = normalizeGaragePlanCode(subscription?.plan);
  const currentPlan = getGaragePlan(currentPlanCode);

  const validationMessage = (() => {
    if (form.request_type === 'add_staff' && !canAddStaff(currentPlanCode)) return 'Freeプランではスタッフ追加はできません。';
    if (form.request_type === 'add_store' && !canAddStore(currentPlanCode)) return '店舗追加はStandard以上で利用できます。';
    if (form.request_type === 'add_storage' && !canAddStorage(currentPlanCode)) return 'Freeプランではストレージ追加はできません。';
    return '';
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!store?.id || !subscription) {
      setErrorMessage('契約情報を取得できていません。');
      return;
    }

    if (role !== 'owner' && role !== 'admin') {
      setErrorMessage('プラン・契約の申込はオーナーまたは管理者のみ実行できます。');
      return;
    }

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    try {
      setIsSubmitting(true);
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

      const { error } = await supabase.from('plan_change_requests').insert({
        company_id: store.id,
        requested_by: userData.user.id,
        request_type: form.request_type,
        current_plan: currentPlanCode,
        requested_plan: form.request_type === 'plan_change' ? form.requested_plan : null,
        requested_extra_staff_count: form.request_type === 'add_staff' ? toNonNegativeInt(form.requested_extra_staff_count) : 0,
        requested_extra_store_count: form.request_type === 'add_store' ? toNonNegativeInt(form.requested_extra_store_count) : 0,
        requested_extra_storage_gb: form.request_type === 'add_storage' ? toNonNegativeInt(form.requested_extra_storage_gb) : 0,
        support_hours: form.request_type === 'support' ? toNonNegativeNumber(form.support_hours) : 0,
        message: form.message.trim() || null,
        status: 'pending',
      });

      if (error) throw new Error(error.message);
      setSuccessMessage('お申し込みを受け付けました。内容を確認後、担当者よりご連絡いたします。');
      setForm((current) => ({ ...current, message: '' }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '申込の送信に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell
      activeLabel="プラン・契約"
      title="プラン・契約"
      description="現在の契約内容、料金プラン、追加オプションの申込を管理します。"
      actionButton={
        <>
          <Link href="/admin/plan-requests" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
            申込管理
          </Link>
          <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
            設定へ戻る
          </Link>
        </>
      }
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</section>
      ) : role !== 'owner' && role !== 'admin' ? (
        <PermissionDeniedCard message="プラン・契約の確認と申込は店舗オーナー、管理者のみ利用できます。" backHref="/settings" />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          {successMessage && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}

          <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
            現在の権限: {getRoleLabel(role)} / 対象会社: {store?.company_name || store?.name || '-'}
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['現在のプラン', currentPlan.name],
              ['月額料金', `${formatGarageYen(currentPlan.monthlyPrice)} / 月`],
              ['現在庫上限', `${subscription?.current_inventory_limit ?? currentPlan.inventoryLimit}台`],
              ['標準スタッフ数 / 追加スタッフ数', `${subscription?.included_staff_count ?? currentPlan.includedStaffCount}名 / ${subscription?.extra_staff_count ?? 0}名`],
              ['標準店舗数 / 追加店舗数', `${subscription?.included_store_count ?? currentPlan.includedStoreCount}店舗 / ${subscription?.extra_store_count ?? 0}店舗`],
              ['標準ストレージ / 追加ストレージ', `${formatStorage(subscription?.storage_limit_mb ?? currentPlan.storageLimitMb)} / ${subscription?.extra_storage_gb ?? 0}GB`],
              ['ストレージ使用量', '集計準備中'],
              ['見積・請求', currentPlan.quoteInvoiceLimit === null ? '無制限' : `月${currentPlan.quoteInvoiceLimit}件`],
              ['外部連携', subscription?.l_link_integration_enabled ? '可' : '不可'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-lg font-bold text-slate-950">プラン比較</h3>
              <p className="mt-1 text-sm text-slate-500">表示価格は税抜です。Stripe決済連携は後工程で実装します。</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">項目</th>
                    {GARAGE_PLAN_ORDER.map((code) => <th key={code} className="px-5 py-4 text-right">{GARAGE_PLANS[code].name}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['月額', (code: GaragePlanCode) => formatGarageYen(GARAGE_PLANS[code].monthlyPrice)],
                    ['現在庫', (code: GaragePlanCode) => `${GARAGE_PLANS[code].inventoryLimit}台`],
                    ['標準スタッフ', (code: GaragePlanCode) => `${GARAGE_PLANS[code].includedStaffCount}名`],
                    ['スタッフ追加', (code: GaragePlanCode) => GARAGE_PLANS[code].extraStaffPrice ? `${formatGarageYen(GARAGE_PLANS[code].extraStaffPrice)}/月・名` : '不可'],
                    ['標準店舗', (code: GaragePlanCode) => `${GARAGE_PLANS[code].includedStoreCount}店舗`],
                    ['店舗追加', (code: GaragePlanCode) => GARAGE_PLANS[code].extraStorePrice ? `${formatGarageYen(GARAGE_PLANS[code].extraStorePrice)}/月・店舗` : '不可'],
                    ['ストレージ', (code: GaragePlanCode) => formatStorage(GARAGE_PLANS[code].storageLimitMb)],
                    ['ストレージ追加', (code: GaragePlanCode) => GARAGE_PLANS[code].extraStoragePricePer10Gb ? `${formatGarageYen(GARAGE_PLANS[code].extraStoragePricePer10Gb)}/月・10GB` : '不可'],
                    ['見積・請求', (code: GaragePlanCode) => GARAGE_PLANS[code].quoteInvoiceLimit === null ? '無制限' : `月${GARAGE_PLANS[code].quoteInvoiceLimit}件`],
                    ['外部連携', (code: GaragePlanCode) => GARAGE_PLANS[code].lLinkIntegrationEnabled ? '可' : '不可'],
                    ['チャットサポート', () => '無料'],
                    ['個別サポート', (code: GaragePlanCode) => `${formatGarageYen(GARAGE_PLANS[code].individualSupportHourlyPrice)}/時`],
                  ].map(([label, formatter]) => (
                    <tr key={label as string} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-bold text-slate-700">{label as string}</td>
                      {GARAGE_PLAN_ORDER.map((code) => (
                        <td key={code} className="px-5 py-4 text-right">{(formatter as (code: GaragePlanCode) => string)(code)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-950">申込フォーム</h3>
            <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">申込種別</span>
                <select className={inputClass} value={form.request_type} onChange={(event) => setForm((current) => ({ ...current, request_type: event.target.value as RequestType }))}>
                  {Object.entries(requestTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">希望プラン</span>
                <select className={inputClass} value={form.requested_plan} onChange={(event) => setForm((current) => ({ ...current, requested_plan: event.target.value as GaragePlanCode }))} disabled={form.request_type !== 'plan_change'}>
                  {GARAGE_PLAN_ORDER.map((code) => <option key={code} value={code}>{GARAGE_PLANS[code].name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">追加するスタッフ数</span>
                <input type="number" min="0" className={inputClass} value={form.requested_extra_staff_count} onChange={(event) => setForm((current) => ({ ...current, requested_extra_staff_count: event.target.value }))} disabled={form.request_type !== 'add_staff'} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">追加する店舗数</span>
                <input type="number" min="0" className={inputClass} value={form.requested_extra_store_count} onChange={(event) => setForm((current) => ({ ...current, requested_extra_store_count: event.target.value }))} disabled={form.request_type !== 'add_store'} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">追加するストレージ容量（GB）</span>
                <input type="number" min="0" step="10" className={inputClass} value={form.requested_extra_storage_gb} onChange={(event) => setForm((current) => ({ ...current, requested_extra_storage_gb: event.target.value }))} disabled={form.request_type !== 'add_storage'} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">サポート希望時間</span>
                <input type="number" min="0" step="0.5" className={inputClass} value={form.support_hours} onChange={(event) => setForm((current) => ({ ...current, support_hours: event.target.value }))} disabled={form.request_type !== 'support'} />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-700">備考</span>
                <textarea className={`${inputClass} min-h-32`} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
              </label>
              {validationMessage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 md:col-span-2">{validationMessage}</p>}
              <div className="flex justify-end md:col-span-2">
                <button type="submit" disabled={isSubmitting || Boolean(validationMessage)} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {isSubmitting ? '送信中...' : '申し込む'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AppShell>
  );
}
