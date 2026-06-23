'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
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
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [editStatus, setEditStatus] = useState('');
  const [editIssueStatus, setEditIssueStatus] = useState('');
  const [editPaidAmount, setEditPaidAmount] = useState('');
  const [editPaymentDueDate, setEditPaymentDueDate] = useState('');
  const [editAssignedUser, setEditAssignedUser] = useState('');
  const [editInternalMemo, setEditInternalMemo] = useState('');

  useEffect(() => {
    async function loadInvoice() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
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
        setEditStatus(data.status ?? 'draft');
        setEditIssueStatus(data.issue_status ?? 'draft');
        setEditPaidAmount(data.paid_amount !== null ? String(data.paid_amount) : '');
        setEditPaymentDueDate(data.payment_due_date ?? '');
        setEditAssignedUser(data.assigned_user_name ?? '');
        setEditInternalMemo(data.internal_memo ?? '');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '請求書の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }
    void loadInvoice();
  }, [id]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const paidAmount = editPaidAmount.trim() ? parseFloat(editPaidAmount) : 0;
      const totalAmount = invoice?.total_amount ?? 0;
      const unpaidAmount = Math.max(totalAmount - paidAmount, 0);

      const supabase = createClient();
      const { error } = await supabase
        .from('invoices')
        .update({
          status: editStatus,
          issue_status: editIssueStatus,
          paid_amount: paidAmount,
          unpaid_amount: unpaidAmount,
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
              status: editStatus,
              issue_status: editIssueStatus,
              paid_amount: paidAmount,
              unpaid_amount: unpaidAmount,
              payment_due_date: editPaymentDueDate || null,
              assigned_user_name: editAssignedUser.trim() || null,
              internal_memo: editInternalMemo.trim() || null,
            }
          : prev,
      );
      setSuccessMessage('保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  const canEdit = role === 'owner' || role === 'admin' || role === 'implementer' || role === 'staff';

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
          {successMessage && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>
          )}

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
              <h2 className="mb-4 text-base font-bold text-slate-950">入金・ステータス管理</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">支払ステータス</span>
                  <select className={inputClass} value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={!canEdit}>
                    <option value="draft">下書き</option>
                    <option value="issued">送付済み</option>
                    <option value="paid">入金済み</option>
                    <option value="overdue">期限超過</option>
                    <option value="cancelled">取消</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">発行状態</span>
                  <select className={inputClass} value={editIssueStatus} onChange={(e) => setEditIssueStatus(e.target.value)} disabled={!canEdit}>
                    <option value="draft">下書き</option>
                    <option value="issued">発行済み</option>
                    <option value="cancelled">取消済み</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">支払期限</span>
                  <input type="date" className={inputClass} value={editPaymentDueDate} onChange={(e) => setEditPaymentDueDate(e.target.value)} disabled={!canEdit} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">入金済み金額（円）</span>
                  <input type="number" min="0" step="1" className={inputClass} value={editPaidAmount} onChange={(e) => setEditPaidAmount(e.target.value)} placeholder="0" disabled={!canEdit} />
                  {editPaidAmount.trim() && invoice.total_amount !== null && (
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      未入金: {formatPrice(Math.max((invoice.total_amount ?? 0) - (parseFloat(editPaidAmount) || 0), 0))}
                    </p>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-slate-700">担当者</span>
                  <input type="text" className={inputClass} value={editAssignedUser} onChange={(e) => setEditAssignedUser(e.target.value)} disabled={!canEdit} />
                </label>
              </div>
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
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSaving ? '保存中...' : '保存する'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </AppShell>
  );
}
