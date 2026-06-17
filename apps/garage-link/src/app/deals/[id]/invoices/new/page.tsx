'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import {
  createPaymentItem,
  PaymentItem,
  PaymentPlanSection,
  VehicleCandidate,
  VehicleReplacementSection,
} from '@/components/deals/DealFlowParts';
import { logAudit } from '@/lib/audit/logAudit';
import { DOCUMENT_LIMIT_MESSAGE, assertDocumentLimitAvailable } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';

type DealRow = {
  id: string;
  store_id: string;
  deal_no: string | null;
  title: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  assigned_user_name: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  customer_type: string | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  registration_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  vin: string | null;
  total_price: number | null;
  status: string | null;
};

type InvoiceIdRow = {
  id: string;
};

type StoreMemberRow = {
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type InvoiceInsert = {
  store_id: string;
  quote_id: string | null;
  deal_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  invoice_no: string;
  title: string | null;
  status: string;
  issue_status: string;
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
  subtotal_amount: number;
  tax_amount: number;
  discount_amount: number;
  trade_in_amount: number;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  payment_method: string | null;
  customer_note: string | null;
  internal_memo: string | null;
  issued_at: string | null;
  issued_by: string | null;
  pdf_generated_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

type InvoiceItemInsert = {
  store_id: string;
  invoice_id: string;
  item_order: number;
  item_type: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  amount: number;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}円`;
}

function vehicleLabel(vehicle: VehicleRow | null) {
  if (!vehicle) {
    return '';
  }

  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '';
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function createDocumentNo(prefix: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const time = now
    .toTimeString()
    .slice(0, 8)
    .replaceAll(':', '');
  return `${prefix}-${date}-${time}`;
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">
      {children}
    </label>
  );
}

export default function DealInvoiceNewPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const router = useRouter();
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [vehicles, setVehicles] = useState<VehicleCandidate[]>([]);
  const [vehicleSearchText, setVehicleSearchText] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [internalMemo, setInternalMemo] = useState('');
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([
    createPaymentItem(),
  ]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadDeal() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const { data: dealData, error: dealError } = await supabase
          .from<DealRow>('deals')
          .select('id, store_id, deal_no, title, customer_id, vehicle_id, assigned_user_name')
          .eq('id', dealId)
          .single();

        if (dealError || !dealData) {
          throw new Error(dealError?.message ?? '商談が見つかりません。');
        }

        setDeal(dealData);

        const [customerResult, vehicleResult, vehiclesResult] = await Promise.all([
          dealData.customer_id
            ? supabase
                .from<CustomerRow>('customers')
                .select('id, name, phone, email, postal_code, address, customer_type')
                .eq('id', dealData.customer_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          dealData.vehicle_id
            ? supabase
                .from<VehicleRow>('vehicles')
                .select('id, management_no, registration_no, maker, model_name, model_year, mileage_km, vin, total_price, status')
                .eq('id', dealData.vehicle_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from<VehicleCandidate>('vehicles')
            .select(
              'id, management_no, registration_no, maker, model_name, model_year, mileage_km, total_price, status'
            )
            .eq('store_id', dealData.store_id)
            .order('created_at', { ascending: false }),
        ]);

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        if (vehicleResult.error) {
          throw new Error(vehicleResult.error.message);
        }

        if (vehiclesResult.error) {
          throw new Error(vehiclesResult.error.message);
        }

        setCustomer(customerResult.data);
        setVehicle(vehicleResult.data);
        setVehicles(vehiclesResult.data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '商談情報の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDeal();
  }, [dealId]);

  const honorific = useMemo(() => {
    return customer?.customer_type === '法人' || customer?.customer_type === 'corporate'
      ? '御中'
      : '様';
  }, [customer?.customer_type]);

  const invoiceTotal = vehicle?.total_price ?? 0;

  function selectReplacementVehicle(nextVehicle: VehicleCandidate) {
    setVehicle({
      id: nextVehicle.id,
      management_no: nextVehicle.management_no,
      registration_no: nextVehicle.registration_no,
      maker: nextVehicle.maker,
      model_name: nextVehicle.model_name,
      model_year: nextVehicle.model_year,
      mileage_km: nextVehicle.mileage_km,
      vin: null,
      total_price: nextVehicle.total_price,
      status: nextVehicle.status,
    });
  }

  async function saveInvoice(issueStatus: 'draft' | 'issued') {
    setErrorMessage('');
    setIsSaving(true);

    try {
      if (!deal) {
        throw new Error('商談情報が見つかりません。');
      }

      const supabase = createClient();
      await assertDocumentLimitAvailable(supabase, deal.store_id);
      const { data: userData } = await supabase.auth.getUser();
      const { data: member } = userData.user?.id
        ? await supabase
            .from<StoreMemberRow>('store_members')
            .select('role, display_name, email')
            .eq('user_id', userData.user.id)
            .eq('store_id', deal.store_id)
            .single()
        : { data: null };
      const now = new Date().toISOString();
      const finalInvoiceNo = invoiceNo.trim() || createDocumentNo('INV');
      const finalIssueDate = toNullableText(issueDate) ?? now.slice(0, 10);
      const issuedBy = userData.user?.email ?? deal.assigned_user_name;
      const totalAmount = invoiceTotal;

      const invoicePayload: InvoiceInsert = {
        store_id: deal.store_id,
        quote_id: null,
        deal_id: deal.id,
        customer_id: deal.customer_id,
        vehicle_id: vehicle?.id ?? deal.vehicle_id,
        invoice_no: finalInvoiceNo,
        title: deal.title,
        status: issueStatus,
        issue_status: issueStatus,
        issue_date: finalIssueDate,
        payment_due_date: toNullableText(paymentDueDate),
        assigned_user_name: deal.assigned_user_name,
        customer_name: customer?.name ?? null,
        customer_phone: customer?.phone ?? null,
        customer_email: customer?.email ?? null,
        customer_postal_code: customer?.postal_code ?? null,
        customer_address: customer?.address ?? null,
        customer_honorific: honorific,
        vehicle_label: vehicleLabel(vehicle),
        vehicle_maker: vehicle?.maker ?? null,
        vehicle_model_name: vehicle?.model_name ?? null,
        vehicle_year: vehicle?.model_year ?? null,
        vehicle_mileage_km: vehicle?.mileage_km ?? null,
        vehicle_vin: vehicle?.vin ?? null,
        vehicle_registration_no: vehicle?.registration_no ?? null,
        subtotal_amount: totalAmount,
        tax_amount: 0,
        discount_amount: 0,
        trade_in_amount: 0,
        total_amount: totalAmount,
        paid_amount: 0,
        unpaid_amount: totalAmount,
        payment_method: null,
        customer_note: toNullableText(customerNote),
        internal_memo: toNullableText(
          [
            internalMemo,
            `支払方法内訳: ${JSON.stringify(paymentItems)}`,
          ]
            .filter((value) => value.trim() !== '')
            .join('\n')
        ),
        issued_at: issueStatus === 'issued' ? now : null,
        issued_by: issueStatus === 'issued' ? issuedBy : null,
        pdf_generated_at: issueStatus === 'issued' ? now : null,
        cancelled_at: null,
        cancel_reason: null,
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from<InvoiceIdRow>('invoices')
        .insert(invoicePayload)
        .select('id')
        .single();

      if (invoiceError || !invoice?.id) {
        throw new Error(invoiceError?.message ?? '請求書の保存に失敗しました。');
      }

      if (totalAmount !== 0) {
        const itemPayload: InvoiceItemInsert = {
          store_id: deal.store_id,
          invoice_id: invoice.id,
          item_order: 1,
          item_type: 'vehicle',
          name: '車両本体・諸費用',
          quantity: 1,
          unit_price: totalAmount,
          tax_rate: 0.1,
          tax_amount: 0,
          amount: totalAmount,
        };
        const { error: itemError } = await supabase
          .from<InvoiceItemInsert>('invoice_items')
          .insert(itemPayload);

        if (itemError) {
          throw new Error(itemError.message);
        }
      }

      if (issueStatus === 'issued') {
        await logAudit({
          supabase,
          storeId: deal.store_id,
          userId: userData.user?.id ?? null,
          userEmail: userData.user?.email ?? member?.email ?? null,
          userRole: member?.role ?? null,
          userDisplayName: member?.display_name ?? null,
          action: 'issue_invoice',
          targetType: 'invoice',
          targetId: invoice.id,
          targetLabel: finalInvoiceNo,
          metadata: {
            deal_id: deal.id,
            total_amount: totalAmount,
            issue_date: finalIssueDate,
          },
        });
        router.push(`/deals/${deal.id}/invoices/preview?invoiceId=${invoice.id}`);
        return;
      }

      router.push(`/deals/${deal.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '請求書の保存に失敗しました。');
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveInvoice('draft');
  }

  return (
    <AppShell
      activeLabel="商談管理"
      title="請求書作成"
      description="この商談に紐づく請求書を作成します"
      actionButton={
        <Link
          href={`/deals/${dealId}`}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          商談詳細に戻る
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-7xl space-y-8">
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
          PDFプレビューでは会社情報・ロゴ・角印が反映されます。
        </p>

        {errorMessage && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <p>{errorMessage}</p>
            {errorMessage === DOCUMENT_LIMIT_MESSAGE && (
              <Link href="/settings/billing" className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100">
                プラン変更を申し込む
              </Link>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">請求基本情報</h3>
                <p className="mt-1 text-sm text-slate-500">
                  商談に紐づく請求書情報を入力します。
                </p>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="invoice_no">請求番号</FieldLabel>
                  <input
                    id="invoice_no"
                    type="text"
                    value={invoiceNo}
                    onChange={(event) => setInvoiceNo(event.target.value)}
                    placeholder="未入力なら自動採番します"
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="issue_date">発行日</FieldLabel>
                  <input
                    id="issue_date"
                    type="date"
                    value={issueDate}
                    onChange={(event) => setIssueDate(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="payment_due_date">支払期限</FieldLabel>
                  <input
                    id="payment_due_date"
                    type="date"
                    value={paymentDueDate}
                    onChange={(event) => setPaymentDueDate(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="assigned_user_name">担当者</FieldLabel>
                  <input
                    id="assigned_user_name"
                    type="text"
                    defaultValue={deal?.assigned_user_name ?? ''}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <VehicleReplacementSection
              currentVehicle={
                vehicle
                  ? {
                      id: vehicle.id,
                      management_no: vehicle.management_no,
                      registration_no: vehicle.registration_no,
                      maker: vehicle.maker,
                      model_name: vehicle.model_name,
                      model_year: vehicle.model_year,
                      mileage_km: vehicle.mileage_km,
                      total_price: vehicle.total_price,
                      status: vehicle.status,
                    }
                  : null
              }
              vehicles={vehicles}
              searchText={vehicleSearchText}
              setSearchText={setVehicleSearchText}
              onSelectVehicle={selectReplacementVehicle}
            />

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">顧客・商談・車両情報</h3>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="deal_title">商談</FieldLabel>
                  <input id="deal_title" type="text" defaultValue={deal?.title ?? ''} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="customer_name">顧客名</FieldLabel>
                  <input id="customer_name" type="text" defaultValue={customer?.name ?? ''} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="honorific">敬称</FieldLabel>
                  <input id="honorific" type="text" defaultValue={honorific} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="phone">電話番号</FieldLabel>
                  <input id="phone" type="tel" defaultValue={customer?.phone ?? ''} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="email">メールアドレス</FieldLabel>
                  <input id="email" type="email" defaultValue={customer?.email ?? ''} className={inputClass} />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <FieldLabel htmlFor="address">住所</FieldLabel>
                  <input id="address" type="text" defaultValue={customer?.address ?? ''} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="vehicle_label">対象車両</FieldLabel>
                  <input id="vehicle_label" type="text" defaultValue={vehicleLabel(vehicle)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="registration_no">登録番号</FieldLabel>
                  <input id="registration_no" type="text" defaultValue={vehicle?.registration_no ?? ''} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="total_price">支払総額</FieldLabel>
                  <input id="total_price" type="text" defaultValue={formatPrice(vehicle?.total_price)} className={`${inputClass} text-right`} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">請求明細・メモ</h3>
                <p className="mt-1 text-sm text-slate-500">
                  invoices テーブル作成後に保存処理を接続します。
                </p>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
                {['車両本体価格', '登録代行費用', '納車整備費用', '値引き', '下取り金額', '請求合計'].map((label) => (
                  <div key={label}>
                    <FieldLabel htmlFor={label}>{label}</FieldLabel>
                    <input id={label} type="number" className={`${inputClass} text-right`} />
                  </div>
                ))}
                <div className="md:col-span-2 xl:col-span-3">
                  <FieldLabel htmlFor="memo">備考</FieldLabel>
                  <textarea
                    id="memo"
                    rows={5}
                    value={customerNote}
                    onChange={(event) => setCustomerNote(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2 xl:col-span-3">
                  <FieldLabel htmlFor="internal_memo">社内メモ</FieldLabel>
                  <textarea
                    id="internal_memo"
                    rows={5}
                    value={internalMemo}
                    onChange={(event) => setInternalMemo(event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            <PaymentPlanSection
              title="請求合計"
              totalAmount={invoiceTotal}
              items={paymentItems}
              setItems={setPaymentItems}
            />

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
              <Link
                href={`/deals/${dealId}`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                キャンセル
              </Link>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveInvoice('draft')}
                className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
              >
                下書き保存
              </button>
              <Link
                href={`/deals/${dealId}/invoices/preview`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                PDFプレビュー
              </Link>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveInvoice('issued')}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? '保存中...' : '請求書を発行する'}
              </button>
            </div>
          </>
        )}
      </form>
    </AppShell>
  );
}
