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
import { formatRetentionDeadline } from '@/lib/billing/contractAccess';
import { translateDbError } from '@/lib/errors/translate-db-error';
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
  tenant_id: string | null;
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
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  cancelled_at?: string | null;
  data_delete_scheduled_at?: string | null;
  data_deleted_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

type GaragePlanUsage = {
  inventory_count: number;
  document_count: number;
  staff_count: number;
  store_count: number;
  storage_bytes: number;
};

type BillingInvoice = {
  id: string;
  number: string;
  issuedAt: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  pdfUrl: string;
};

type InvoiceLoadState = 'loading' | 'ready' | 'not_configured' | 'no_customer' | 'error';

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

const invoiceStatusLabels = {
  paid: '支払済み',
  open: '支払待ち',
  void: '取消済み',
  uncollectible: '回収不能',
} as const;

function formatInvoiceDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
}

function formatInvoicePeriod(start: string, end: string) {
  const endDate = new Date(new Date(end).getTime() - 1);
  const format = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${format.format(new Date(start))}〜${format.format(endDate)}`;
}

function formatInvoiceAmount(amount: number, currency: string) {
  const normalizedCurrency = currency.toUpperCase();
  const normalizedAmount = normalizedCurrency === 'JPY' ? amount : amount / 100;
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: normalizedCurrency }).format(normalizedAmount);
}

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
  const [usage, setUsage] = useState<GaragePlanUsage | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [invoiceLoadState, setInvoiceLoadState] = useState<InvoiceLoadState>('loading');
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
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
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

        const [subscriptionResponse, invoiceResponse] = await Promise.all([
          fetch('/api/billing/subscription'),
          fetch('/api/billing/invoices'),
        ]);
        const subscriptionPayload = (await subscriptionResponse.json()) as {
          ok?: boolean;
          error?: string;
          subscription?: CompanySubscriptionRow;
        };

        if (!subscriptionResponse.ok || !subscriptionPayload.ok || !subscriptionPayload.subscription) {
          throw new Error(subscriptionPayload.error ?? '契約情報の取得に失敗しました。');
        }

        setSubscription(subscriptionPayload.subscription);
        const { data: usageData } = await supabase.rpc('get_garage_plan_usage', {
          p_store_id: member.store_id,
        });
        setUsage((usageData as GaragePlanUsage | null) ?? null);

        const invoicePayload = (await invoiceResponse.json()) as {
          ok?: boolean;
          invoices?: BillingInvoice[];
          state?: InvoiceLoadState;
        };
        if (invoiceResponse.ok && invoicePayload.ok) {
          setInvoices(invoicePayload.invoices ?? []);
          setInvoiceLoadState(invoicePayload.state ?? 'ready');
        } else {
          setInvoiceLoadState('error');
        }
      } catch (error) {
        setErrorMessage(translateDbError(error instanceof Error ? error.message : '契約情報の取得に失敗しました。'));
      } finally {
        setIsLoading(false);
      }
    }

    void loadBilling();
  }, []);

  useEffect(() => {
    async function finalizeCheckout() {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('checkout') !== 'success') return;

      const sessionId = params.get('session_id');
      if (!sessionId) return;

      try {
        setSuccessMessage('');
        setErrorMessage('');
        const response = await fetch(`/api/billing/checkout?session_id=${encodeURIComponent(sessionId)}`);
        const payload = (await response.json()) as { ok?: boolean; error?: string; plan?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? '決済結果の反映に失敗しました。');
        }
        setSuccessMessage(`Stripe 決済が完了しました。プランを ${payload.plan ?? ''} に更新しました。`);
        window.history.replaceState({}, '', '/settings/billing');
        window.location.reload();
      } catch (error) {
        setErrorMessage(translateDbError(error instanceof Error ? error.message : '決済結果の反映に失敗しました。'));
      }
    }

    void finalizeCheckout();
  }, []);

  useEffect(() => {
    async function loadStripeStatus() {
      try {
        const response = await fetch('/api/billing/status');
        const payload = (await response.json()) as { checkoutReady?: boolean };
        setStripeConfigured(Boolean(payload.checkoutReady));
      } catch {
        setStripeConfigured(false);
      }
    }

    void loadStripeStatus();
  }, []);

  const currentPlanCode = normalizeGaragePlanCode(subscription?.plan);
  const currentPlan = getGaragePlan(currentPlanCode);
  const isCancelledRetention = subscription?.status === 'cancelled';

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
      if (form.request_type === 'plan_change') {
        await handleStripeCheckout(form.requested_plan);
        return;
      }
      if (form.request_type === 'add_staff' || form.request_type === 'add_store' || form.request_type === 'add_storage') {
        if (!termsAccepted) {
          setErrorMessage('契約変更には利用規約への同意が必要です。');
          return;
        }
        const amount = form.request_type === 'add_staff'
          ? toNonNegativeInt(form.requested_extra_staff_count)
          : form.request_type === 'add_store'
            ? toNonNegativeInt(form.requested_extra_store_count)
            : toNonNegativeInt(form.requested_extra_storage_gb);
        const response = await fetch('/api/billing/change-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: form.request_type, amount, termsAccepted: true }),
        });
        const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? '追加オプションを反映できませんでした。');
        setSuccessMessage(payload.message ?? '追加オプションを反映しました。');
        window.setTimeout(() => window.location.reload(), 1200);
        return;
      }
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

      const { error } = await supabase.from('plan_change_requests').insert({
        company_id: store.id,
        tenant_id: subscription.tenant_id,
            requested_by: userData.user.id,
            request_type: 'support',
            current_plan: currentPlanCode,
            requested_plan: null,
            requested_extra_staff_count: 0,
            requested_extra_store_count: 0,
            requested_extra_storage_gb: 0,
            support_hours: toNonNegativeNumber(form.support_hours),
        message: form.message.trim() || null,
        status: 'pending',
      });

      if (error) throw new Error(translateDbError(error.message));
      setSuccessMessage('お申し込みを受け付けました。内容を確認後、担当者よりご連絡いたします。');
      setForm((current) => ({ ...current, message: '' }));
    } catch (error) {
      setErrorMessage(translateDbError(error instanceof Error ? error.message : '申込の送信に失敗しました。'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStripeCheckout(planCode?: GaragePlanCode) {
    setSuccessMessage('');
    setErrorMessage('');

    const targetPlan = planCode ?? form.requested_plan;

    if (!termsAccepted) {
      setErrorMessage('決済へ進むには利用規約への同意が必要です。');
      return;
    }

    if (targetPlan === 'free' || targetPlan === currentPlanCode) {
      setErrorMessage('有料プランへ変更する場合のみ Stripe 決済を利用できます。');
      return;
    }

    try {
      setIsStripeLoading(true);
      const hasPaidSubscription = Boolean(subscription?.stripe_subscription_id) && !isCancelledRetention;
      const response = await fetch(hasPaidSubscription ? '/api/billing/change-plan' : '/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan, termsAccepted: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string; message?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'プラン変更の開始に失敗しました。');
      }
      if (payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setSuccessMessage(payload.message ?? 'プラン変更を受け付けました。');
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setErrorMessage(translateDbError(error instanceof Error ? error.message : 'Checkout の開始に失敗しました。'));
    } finally {
      setIsStripeLoading(false);
    }
  }

  function planCardSummary(code: GaragePlanCode) {
    const plan = GARAGE_PLANS[code];
    return [
      `在庫 ${plan.inventoryLimit}台`,
      `スタッフ ${plan.includedStaffCount}名`,
      plan.quoteInvoiceLimit === null ? '見積・請求 無制限' : `見積・請求 月${plan.quoteInvoiceLimit}件`,
    ];
  }

  return (
    <AppShell
      activeLabel="プラン・契約"
      title="プラン・契約"
      description="今のプラン確認と、プラン変更の申込ができます。"
      actionButton={
        <>
          <Link href="/admin/plan-requests" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
            申込履歴
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
          {isCancelledRetention && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              契約は解約済みです。Free プランへの復帰はできません。データは{' '}
              {formatRetentionDeadline(subscription?.data_delete_scheduled_at)} まで保管され、その後削除されます。利用再開は有料プランへの再契約のみ可能です。
            </p>
          )}

          <section className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm">
            <p className="text-sm font-bold text-blue-700">{isCancelledRetention ? '解約済み契約' : '現在の契約'}</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-black text-slate-950">{currentPlan.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {store?.company_name || store?.name || '—'} ／ {formatGarageYen(currentPlan.monthlyPrice)} / 月
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">在庫 {usage?.inventory_count ?? 0}/{subscription?.current_inventory_limit ?? currentPlan.inventoryLimit}台</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">スタッフ {usage?.staff_count ?? 0}/{(subscription?.included_staff_count ?? currentPlan.includedStaffCount) + (subscription?.extra_staff_count ?? 0)}名</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">店舗 {usage?.store_count ?? 1}/{(subscription?.included_store_count ?? currentPlan.includedStoreCount) + (subscription?.extra_store_count ?? 0)}</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">保存容量 {formatStorage(Math.ceil((usage?.storage_bytes ?? 0) / 1024 / 1024))}/{formatStorage((subscription?.storage_limit_mb ?? currentPlan.storageLimitMb) + (subscription?.extra_storage_gb ?? 0) * 1024)}</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">L-LINK {subscription?.l_link_integration_enabled ? '利用可' : '対象外'}</span>
              </div>
            </div>
            {subscription?.pending_plan && subscription.pending_plan_effective_at && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {getGaragePlan(subscription.pending_plan).name}への変更を予約済みです。{formatInvoiceDate(subscription.pending_plan_effective_at)}から機能と契約内容を切り替えます。
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-950">チャットサポート</h3>
            <p className="mt-1 text-sm text-slate-600">通常のお問い合わせは、株式会社かんなぎ公式LINEで受け付けます。</p>
            {process.env.NEXT_PUBLIC_KANNAGI_OFFICIAL_LINE_URL ? (
              <a
                href={process.env.NEXT_PUBLIC_KANNAGI_OFFICIAL_LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-700"
              >
                公式LINEで問い合わせる
              </a>
            ) : (
              <p className="mt-4 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-500">公式LINEリンク設定待ち</p>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h3 className="text-lg font-black text-slate-950">請求書</h3>
              <p className="mt-1 text-sm text-slate-500">発行済みの月額利用料の請求書をPDFで保存できます。</p>
            </div>
            {invoiceLoadState === 'loading' ? (
              <p className="px-6 py-8 text-center text-sm font-semibold text-slate-500">請求書を読み込んでいます...</p>
            ) : invoices.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                    <tr>
                      <th className="px-6 py-3">発行日</th>
                      <th className="px-6 py-3">対象期間</th>
                      <th className="px-6 py-3">請求番号</th>
                      <th className="px-6 py-3 text-right">金額</th>
                      <th className="px-6 py-3">支払状況</th>
                      <th className="px-6 py-3 text-right">ダウンロード</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="px-6 py-4 font-medium text-slate-700">{formatInvoiceDate(invoice.issuedAt)}</td>
                        <td className="px-6 py-4 text-slate-600">{formatInvoicePeriod(invoice.periodStart, invoice.periodEnd)}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{invoice.number}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-950">{formatInvoiceAmount(invoice.amount, invoice.currency)}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${invoice.status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                            {invoiceStatusLabels[invoice.status]}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl border border-blue-300 bg-white px-4 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50">
                            請求書 PDF
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-6 py-8 text-center text-sm font-semibold text-slate-500">
                {invoiceLoadState === 'error' ? '請求書を取得できませんでした。時間をおいて再度お試しください。' : '発行済みの請求書はありません。'}
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">プランを選ぶ</h3>
              <p className="mt-1 text-sm text-slate-500">
                有料プランは下のボタンから決済ページへ進みます。表示額は10%相当額を含む請求総額です。
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>
                <Link href="/legal/terms" target="_blank" className="font-bold text-blue-700 underline">
                  利用規約
                </Link>
                を確認し、内容に同意します。
              </span>
            </label>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {GARAGE_PLAN_ORDER.map((code) => {
                const plan = GARAGE_PLANS[code];
                const isCurrent = !isCancelledRetention && code === currentPlanCode;
                const isPaid = code !== 'free';

                return (
                  <article
                    key={code}
                    className={`flex flex-col rounded-2xl border p-5 shadow-sm ${
                      isCurrent ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-200' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-black text-slate-950">{plan.name}</p>
                        <p className="mt-1 text-2xl font-black text-slate-950">
                          {formatGarageYen(plan.monthlyPrice)}
                          <span className="text-sm font-bold text-slate-500"> / 月</span>
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">利用中</span>
                      )}
                    </div>
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                      {planCardSummary(code).map((item) => (
                        <li key={item}>・{item}</li>
                      ))}
                    </ul>
                    <div className="mt-5">
                      {isCurrent ? (
                        <p className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-500">現在のプラン</p>
                      ) : isPaid ? (
                        <button
                          type="button"
                          onClick={() => void handleStripeCheckout(code)}
                          disabled={isStripeLoading || !stripeConfigured || !termsAccepted}
                          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isStripeLoading ? '決済ページを開いています...' : isCancelledRetention ? '再契約する' : 'このプランで申し込む'}
                        </button>
                      ) : (
                        <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-500">
                          {isCancelledRetention ? 'Free への復帰不可' : '無料プラン'}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {!stripeConfigured && (
              <p className="text-xs font-semibold text-slate-500">
                いまは決済の準備中です。お急ぎの場合は下の手動申込をご利用ください。
              </p>
            )}
          </section>

          <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer p-5 text-sm font-bold text-slate-700">詳細比較・手動申込（オプション追加など）</summary>
            <div className="space-y-6 border-t border-slate-100 p-5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-4">項目</th>
                      {GARAGE_PLAN_ORDER.map((code) => (
                        <th key={code} className="px-5 py-4 text-right">
                          {GARAGE_PLANS[code].name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ['月額', (code: GaragePlanCode) => formatGarageYen(GARAGE_PLANS[code].monthlyPrice)],
                      ['現在庫', (code: GaragePlanCode) => `${GARAGE_PLANS[code].inventoryLimit}台`],
                      ['標準スタッフ', (code: GaragePlanCode) => `${GARAGE_PLANS[code].includedStaffCount}名`],
                      ['標準店舗', (code: GaragePlanCode) => `${GARAGE_PLANS[code].includedStoreCount}店舗`],
                      ['保存容量', (code: GaragePlanCode) => formatStorage(GARAGE_PLANS[code].storageLimitMb)],
                      ['見積・請求', (code: GaragePlanCode) => (GARAGE_PLANS[code].quoteInvoiceLimit === null ? '無制限' : `月${GARAGE_PLANS[code].quoteInvoiceLimit}件`)],
                      ['L-LINK連携', (code: GaragePlanCode) => (GARAGE_PLANS[code].lLinkIntegrationEnabled ? '利用可' : '対象外')],
                    ].map(([label, formatter]) => (
                      <tr key={label as string} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-bold text-slate-700">{label as string}</td>
                        {GARAGE_PLAN_ORDER.map((code) => (
                          <td key={code} className="px-5 py-4 text-right">
                            {(formatter as (code: GaragePlanCode) => string)(code)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">申込種別</span>
                  <select className={inputClass} value={form.request_type} onChange={(event) => setForm((current) => ({ ...current, request_type: event.target.value as RequestType }))}>
                    {Object.entries(requestTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">希望プラン</span>
                  <select
                    className={inputClass}
                    value={form.requested_plan}
                    onChange={(event) => setForm((current) => ({ ...current, requested_plan: event.target.value as GaragePlanCode }))}
                    disabled={form.request_type !== 'plan_change'}
                  >
                    {GARAGE_PLAN_ORDER.map((code) => (
                      <option key={code} value={code}>
                        {GARAGE_PLANS[code].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">追加するスタッフ数</span>
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={form.requested_extra_staff_count}
                    onChange={(event) => setForm((current) => ({ ...current, requested_extra_staff_count: event.target.value }))}
                    disabled={form.request_type !== 'add_staff'}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">追加する店舗数</span>
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={form.requested_extra_store_count}
                    onChange={(event) => setForm((current) => ({ ...current, requested_extra_store_count: event.target.value }))}
                    disabled={form.request_type !== 'add_store'}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">追加ストレージ（10GB単位）</span>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    className={inputClass}
                    value={form.requested_extra_storage_gb}
                    onChange={(event) => setForm((current) => ({ ...current, requested_extra_storage_gb: event.target.value }))}
                    disabled={form.request_type !== 'add_storage'}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">個別サポート時間</span>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    className={inputClass}
                    value={form.support_hours}
                    onChange={(event) => setForm((current) => ({ ...current, support_hours: event.target.value }))}
                    disabled={form.request_type !== 'support'}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">備考</span>
                  <textarea className={`${inputClass} min-h-24`} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
                </label>
                {validationMessage && (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 md:col-span-2">{validationMessage}</p>
                )}
                {form.request_type !== 'support' && (
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(event) => setTermsAccepted(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      <Link href="/legal/terms" target="_blank" className="font-bold text-blue-700 underline">
                        利用規約
                      </Link>
                      を確認し、内容に同意します。
                    </span>
                  </label>
                )}
                <div className="flex justify-end md:col-span-2">
                  <button type="submit" disabled={isSubmitting || Boolean(validationMessage) || (form.request_type !== 'support' && !termsAccepted)} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {isSubmitting ? '送信中...' : form.request_type === 'support' ? '個別サポートを相談する' : '申し込む'}
                  </button>
                </div>
              </form>
            </div>
          </details>
        </div>
      )}
    </AppShell>
  );
}
