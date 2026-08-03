'use client';


import { toUserErrorMessage } from '@/lib/errors/user-error';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { confirmAction, promptAction } from '@/components/ui/actionDialog';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = { store_id: string; role: string | null };

type InvoiceRow = {
  id: string;
  store_id: string;
  deal_id: string | null;
  quote_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  invoice_no: string | null;
  title: string | null;
  status: string | null;
  issue_status: string | null;
  issue_date: string | null;
  payment_due_date: string | null;
  assigned_user_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_postal_code: string | null;
  customer_address: string | null;
  customer_honorific: string | null;
  vehicle_label: string | null;
  vehicle_maker: string | null;
  vehicle_model_name: string | null;
  vehicle_year: number | null;
  vehicle_mileage_km: number | null;
  vehicle_vin: string | null;
  vehicle_registration_no: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  trade_in_amount: number | null;
  total_amount: number | null;
  paid_amount: number | null;
  unpaid_amount: number | null;
  memo: string | null;
  internal_memo: string | null;
  created_at: string | null;
  maintenance_job_id: string | null;
  parts_stock_adjusted: boolean | null;
  parts_stock_committed: Record<string, number> | null;
  parts_stock_adjusted_at: string | null;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString('ja-JP')}円`;
}

function displayValue(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-';
}

function getIssueStatusLabel(status: string | null) {
  switch (status) {
    case 'issued': return '発行済み';
    case 'cancelled': return '取消済み';
    case 'draft': return '下書き';
    default: return displayValue(status);
  }
}

function getIssueStatusClass(status: string | null) {
  switch (status) {
    case 'issued': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'cancelled': return 'bg-red-50 text-red-700 ring-red-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function getPaymentStatusClass(status: string | null) {
  switch (status) {
    case 'paid': case '入金済み': return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'overdue': case '期限超過': return 'bg-red-50 text-red-700 ring-red-600/20';
    case 'issued': case '送付済み': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    default: return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef<HTMLDivElement>(null);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [editPaymentDueDate, setEditPaymentDueDate] = useState('');
  const [editAssignedUser, setEditAssignedUser] = useState('');
  const [editInternalMemo, setEditInternalMemo] = useState('');
  const [stockBusy, setStockBusy] = useState<'idle' | 'confirming' | 'cancelling'>('idle');
  const [stockMessage, setStockMessage] = useState('');
  const [stockError, setStockError] = useState('');
  const [itemPartQty, setItemPartQty] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadInvoice() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('current_user_active_store_membership')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();
        if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
        setStoreId(member.store_id);
        setRole(member.role ?? '');

        const { data, error } = await supabase
          .from<InvoiceRow>('invoices')
          .select('*')
          .eq('id', id)
          .eq('store_id', member.store_id)
          .single();
        if (error || !data) throw new Error(error?.message ?? '請求書が見つかりません。');

        setInvoice(data);
        setEditPaymentDueDate(data.payment_due_date ?? '');
        setEditAssignedUser(data.assigned_user_name ?? '');
        setEditInternalMemo(data.internal_memo ?? '');

        // 部品明細を取得して part_id ごとに集計（在庫確定UIの差分判定用）
        const { data: items } = await supabase
          .from<{ part_id: string | null; quantity: number | null }>('invoice_items')
          .select('part_id, quantity')
          .eq('invoice_id', id)
          .eq('store_id', member.store_id);
        const agg: Record<string, number> = {};
        for (const it of items ?? []) {
          if (it.part_id) agg[it.part_id] = (agg[it.part_id] ?? 0) + Math.max(0, Math.floor(Number(it.quantity ?? 0)));
        }
        setItemPartQty(agg);
      } catch (error) {
        setErrorMessage(toUserErrorMessage(error, '請求書の取得に失敗しました。'));
      } finally {
        setIsLoading(false);
      }
    }
    void loadInvoice();
  }, [id]);

  useEffect(() => {
    if (saveError && saveErrorRef.current) {
      saveErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [saveError]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaveError('');
      setIsSaving(true);

      const supabase = createClient();
      const { error } = await supabase
        .from('invoices')
        .update({
          payment_due_date: editPaymentDueDate || null,
          assigned_user_name: editAssignedUser.trim() || null,
          internal_memo: editInternalMemo.trim() || null,
        })
        .eq('id', id)
        .eq('store_id', storeId);
      if (error) throw new Error(error.message);

      setInvoice((prev) =>
        prev
          ? {
              ...prev,
              payment_due_date: editPaymentDueDate || null,
              assigned_user_name: editAssignedUser.trim() || null,
              internal_memo: editInternalMemo.trim() || null,
            }
          : prev,
      );
      sessionStorage.setItem('flash_invoices', '請求書を更新しました。');
      router.push('/invoices');
    } catch (error) {
      setSaveError(toUserErrorMessage(error, '保存に失敗しました。'));
    } finally {
      setIsSaving(false);
    }
  }

  const canEdit = role === 'owner' || role === 'admin' || role === 'implementer' || role === 'staff';
  const canIssue = role === 'owner' || role === 'admin' || role === 'staff';
  const canVoid = role === 'owner' || role === 'admin';
  const canManageStock = role === 'owner' || role === 'admin';

  async function reloadInvoice() {
    const supabase = createClient();
    const { data } = await supabase.from<InvoiceRow>('invoices').select('*').eq('id', id).eq('store_id', storeId).single();
    if (data) setInvoice(data);
  }

  async function runAccountingAction(path: string, body: Record<string, unknown>) {
    setSaveError('');
    setIsSaving(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? '処理を完了できませんでした。');
      await reloadInvoice();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleIssueInvoice() {
    if (!await confirmAction({
      title: '請求書を発行する',
      description: '発行後は請求金額を直接変更できません。内容を確認して発行してください。',
      confirmLabel: '内容を確認して発行する',
    })) return;
    try {
      await runAccountingAction(`/api/invoices/${id}/issue`, {});
    } catch (error) {
      setSaveError(toUserErrorMessage(error, '請求書を発行できませんでした。'));
    }
  }

  async function handleVoidInvoice() {
    const reason = await promptAction({
      title: '請求書を取り消す',
      description: '取消後は請求書の状態が変わります。理由を入力して確認してください。',
      confirmLabel: '請求書を取り消す',
      tone: 'danger',
      input: { label: '取消理由', minLength: 3, placeholder: '3文字以上で入力' },
    });
    if (reason === null) return;
    try {
      await runAccountingAction(`/api/invoices/${id}/void`, { reason });
    } catch (error) {
      setSaveError(toUserErrorMessage(error, '請求書を取消できませんでした。'));
    }
  }

  async function handleRecordPayment() {
    const amount = Number(paymentAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setSaveError('入金額は1円以上の整数で入力してください。');
      return;
    }
    if (!await confirmAction({
      title: '入金を登録する',
      description: `${amount.toLocaleString('ja-JP')}円の入金を履歴へ追加します。金額と入金方法を確認してください。`,
      confirmLabel: '入金を登録する',
    })) return;
    try {
      await runAccountingAction(`/api/invoices/${id}/payments`, { amount, paymentMethod });
      setPaymentAmount('');
      setPaymentMethod('');
    } catch (error) {
      setSaveError(toUserErrorMessage(error, '入金を登録できませんでした。'));
    }
  }

  async function handleConfirmStock() {
    if (stockBusy !== 'idle' || !invoice) return;
    if (!await confirmAction({
      title: '請求書を確定する',
      description: '請求書を確定し、対象部品の在庫を減算します。',
      confirmLabel: '確定して在庫を減算',
    })) return;
    setStockBusy('confirming');
    setStockError(''); setStockMessage('');
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('confirm_invoice_part_stock', { p_invoice_id: id, p_store_id: storeId });
      if (error) throw new Error(error.message);
      const res = data as { ok: boolean; error?: string; part_name?: string; required?: number; current_stock?: number; skipped?: boolean; reason?: string };
      if (!res.ok) {
        if (res.error === '在庫不足です' && res.part_name) {
          throw new Error(`在庫不足です: 「${res.part_name}」必要数${res.required}・現在在庫${res.current_stock}`);
        }
        throw new Error(res.error ?? '請求確定に失敗しました。');
      }
      setStockMessage(res.skipped ? '整備案件に紐付くため、在庫は整備案件側で管理されます。' : '請求を確定し、在庫を減算しました。');
      await reloadInvoice();
    } catch (e) {
      setStockError(toUserErrorMessage(e, '請求確定に失敗しました。'));
    } finally {
      setStockBusy('idle');
    }
  }

  async function handleCancelStock() {
    if (stockBusy !== 'idle' || !invoice) return;
    if (!await confirmAction({
      title: '請求確定を解除する',
      description: '請求の確定を解除し、減算済み在庫を復元します。',
      confirmLabel: '確定を解除して在庫を復元',
      tone: 'danger',
    })) return;
    setStockBusy('cancelling');
    setStockError(''); setStockMessage('');
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('cancel_invoice_part_stock', { p_invoice_id: id, p_store_id: storeId });
      if (error) throw new Error(error.message);
      const res = data as { ok: boolean; error?: string; skipped?: boolean };
      if (!res.ok) throw new Error(res.error ?? '取消に失敗しました。');
      setStockMessage(res.skipped ? '在庫は調整されていません（変更なし）。' : '請求確定を解除し、在庫を復元しました。');
      await reloadInvoice();
    } catch (e) {
      setStockError(toUserErrorMessage(e, '取消に失敗しました。'));
    } finally {
      setStockBusy('idle');
    }
  }

  function stockState() {
    if (!invoice) return null;
    if (invoice.maintenance_job_id) return 'maintenance_linked' as const;
    const committed = invoice.parts_stock_committed ?? {};
    const committedKeys = Object.keys(committed).sort();
    const currentKeys = Object.keys(itemPartQty).sort();
    const isSame = committedKeys.length === currentKeys.length
      && committedKeys.every((k, i) => k === currentKeys[i] && committed[k] === itemPartQty[k]);
    if (invoice.parts_stock_adjusted) return isSame ? ('confirmed_synced' as const) : ('confirmed_drifted' as const);
    return 'unconfirmed' as const;
  }

  return (
    <AppShell
      activeLabel="請求書"
      title={isLoading ? '請求書詳細' : (invoice?.invoice_no ? `請求書 ${invoice.invoice_no}` : '請求書詳細')}
      description="請求書の確認・入金状態・ステータスを管理します"
      actionButton={
        <div className="flex gap-2">
          {invoice && (
            <Link
              href={invoice.deal_id ? `/deals/${invoice.deal_id}/invoices/preview?invoiceId=${invoice.id}` : `/invoices/${invoice.id}/preview`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100"
            >
              PDF発行
            </Link>
          )}
          {invoice?.deal_id && (
            <Link
              href={`/deals/${invoice.deal_id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              商談へ
            </Link>
          )}
          <Link
            href="/invoices"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            一覧へ戻る
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">読み込み中...</p>
      ) : !invoice ? (
        <p className="rounded-xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {errorMessage || '請求書が見つかりません。'}
        </p>
      ) : (
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-inset ${getIssueStatusClass(invoice.issue_status)}`}>
              {getIssueStatusLabel(invoice.issue_status)}
            </span>
            <span className={`inline-flex rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-inset ${getPaymentStatusClass(invoice.status)}`}>
              {displayValue(invoice.status)}
            </span>
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-slate-950">部品在庫の確定状態</h2>
              {(() => {
                const s = stockState();
                if (s === 'maintenance_linked') return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">整備案件に紐付き</span>;
                if (s === 'confirmed_synced') return <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">確定済み（明細と一致）</span>;
                if (s === 'confirmed_drifted') return <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">確定済み（明細変更あり・要再確定）</span>;
                return <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">未確定（下書き）</span>;
              })()}
            </div>

            {stockMessage && <p className="mb-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{stockMessage}</p>}
            {stockError && <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{stockError}</p>}

            {invoice.maintenance_job_id ? (
              <div className="space-y-2 text-sm text-slate-700">
                <p>この請求書は <span className="font-semibold">整備案件に紐付いています</span>。部品在庫は整備案件側（部品使用の確定）で管理されます。</p>
                <p className="text-xs text-slate-500">請求書からの単品販売としての在庫減算は行いません。整備案件詳細から部品使用を確定してください。</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">
                  単品販売部品（{Object.keys(itemPartQty).length}件）の在庫は、下記の「請求を確定」を押したときに減算されます。
                  下書き保存・編集中は在庫を動かしません。
                </p>
                {stockState() === 'confirmed_drifted' && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    明細が確定時点から変更されています。再確定で差分のみを反映します（在庫不足はブロックします）。
                  </p>
                )}
                {canManageStock ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmStock}
                      disabled={stockBusy !== 'idle' || Object.keys(itemPartQty).length === 0}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
                    >
                      {stockBusy === 'confirming' ? '確定中...' : (invoice.parts_stock_adjusted ? '再確定（差分反映）' : '請求を確定')}
                    </button>
                    {invoice.parts_stock_adjusted && (
                      <button
                        type="button"
                        onClick={handleCancelStock}
                        disabled={stockBusy !== 'idle'}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {stockBusy === 'cancelling' ? '取消中...' : '確定を解除（在庫復元）'}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">在庫確定は管理者・オーナーのみ操作可能です。</p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">請求先・対象車両</h2>
            <dl className="grid gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="font-bold text-slate-500">顧客名</dt>
                <dd className="mt-1 font-semibold text-slate-950">{displayValue(invoice.customer_name)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">電話番号</dt>
                <dd className="mt-1">{displayValue(invoice.customer_phone)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">メールアドレス</dt>
                <dd className="mt-1">{displayValue(invoice.customer_email)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">住所</dt>
                <dd className="mt-1">{displayValue(invoice.customer_address)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">対象車両</dt>
                <dd className="mt-1 font-semibold">{displayValue(invoice.vehicle_label)}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">登録番号</dt>
                <dd className="mt-1">{displayValue(invoice.vehicle_registration_no)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-950">金額</h2>
            <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
              {[
                ['小計', invoice.subtotal_amount],
                ['消費税', invoice.tax_amount],
                ['値引き', invoice.discount_amount],
                ['下取り額', invoice.trade_in_amount],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-slate-50 p-4">
                  <p className="font-bold text-slate-500">{label as string}</p>
                  <p className="mt-1 font-semibold text-slate-950">{formatPrice(value as number | null)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-700">請求合計</p>
              <p className="mt-1 text-2xl font-black text-blue-700">{formatPrice(invoice.total_amount)}</p>
            </div>
          </section>

          <form onSubmit={handleSave} className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-950">入金・発行管理</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">支払期限</span>
                  <input type="date" className={inputClass} value={editPaymentDueDate} onChange={(e) => setEditPaymentDueDate(e.target.value)} disabled={!canEdit || invoice.issue_status !== 'draft'} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">入金額（円）</span>
                  <input type="number" min="1" step="1" className={inputClass} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={String(invoice.unpaid_amount ?? 0)} disabled={!canIssue || invoice.issue_status !== 'issued' || invoice.unpaid_amount === 0} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">入金方法</span>
                  <input type="text" className={inputClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="現金・振込など" disabled={!canIssue || invoice.issue_status !== 'issued' || invoice.unpaid_amount === 0} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">担当者</span>
                  <input type="text" className={inputClass} value={editAssignedUser} onChange={(e) => setEditAssignedUser(e.target.value)} disabled={!canEdit} />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {canIssue && invoice.issue_status === 'draft' && (
                  <button type="button" onClick={() => void handleIssueInvoice()} disabled={isSaving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">請求書を発行する</button>
                )}
                {canIssue && invoice.issue_status === 'issued' && (invoice.unpaid_amount ?? 0) > 0 && (
                  <button type="button" onClick={() => void handleRecordPayment()} disabled={isSaving} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">入金を登録する</button>
                )}
                {canVoid && invoice.issue_status === 'issued' && (
                  <button type="button" onClick={() => void handleVoidInvoice()} disabled={isSaving} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">請求書を取消する</button>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">発行後の金額・状態は直接変更できません。入金は履歴として追加され、取消・返金は管理者の専用操作で記録します。</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-950">内部メモ</h2>
              <textarea
                className={`${inputClass} min-h-24`}
                value={editInternalMemo}
                onChange={(e) => setEditInternalMemo(e.target.value)}
                placeholder="対外非公開のメモ"
                disabled={!canEdit}
              />
            </section>

            {canEdit && (
              <div ref={saveErrorRef} className="space-y-3">
                {saveError && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
                    {saveError}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSaving ? '保存中...' : '保存する'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </AppShell>
  );
}
