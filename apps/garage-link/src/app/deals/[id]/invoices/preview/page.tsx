'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type CompanyProfile = {
  name: string | null;
  company_name: string | null;
  company_kana: string | null;
  representative_name: string | null;
  invoice_registration_number: string | null;
  postal_code: string | null;
  address: string | null;
  building: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website_url: string | null;
  bank_name: string | null;
  bank_branch_name: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  invoice_note: string | null;
  logo_image_path: string | null;
  seal_image_path: string | null;
  document_primary_color: string | null;
  document_footer_text: string | null;
};

type DealRow = {
  id: string;
  title: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
};

type CustomerRow = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_type: string | null;
};

type VehicleRow = {
  management_no: string | null;
  registration_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  vin: string | null;
  total_price: number | null;
};

type InvoiceRow = {
  id: string;
  invoice_no: string | null;
  issue_status: string | null;
  issue_date: string | null;
  payment_due_date: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_honorific: string | null;
  vehicle_label: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  trade_in_amount: number | null;
  total_amount: number | null;
  paid_amount: number | null;
  unpaid_amount: number | null;
  customer_note: string | null;
  internal_memo: string | null;
};

type InvoiceItemRow = {
  id: string;
  name: string | null;
  amount: number | null;
};

type PaymentMemoItem = {
  method?: string;
  amount?: string;
  scheduledDate?: string;
  note?: string;
};

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatPrice(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${value.toLocaleString('ja-JP')}円`;
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function issueStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'issued':
      return '発行済み';
    case 'cancelled':
      return '取消済み';
    case 'draft':
      return '下書き';
    default:
      return displayValue(status);
  }
}

function parseMemoJson<T>(memo: string | null | undefined, label: string, fallback: T): T {
  if (!memo) {
    return fallback;
  }

  const line = memo.split('\n').find((item) => item.startsWith(`${label}: `));
  if (!line) {
    return fallback;
  }

  try {
    return JSON.parse(line.replace(`${label}: `, '')) as T;
  } catch {
    return fallback;
  }
}

function hasPaymentItem(item: PaymentMemoItem) {
  return Boolean(item.method || item.amount || item.scheduledDate || item.note);
}

export default function InvoicePreviewPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [sealUrl, setSealUrl] = useState('');

  useEffect(() => {
    async function imageUrl(path: string | null | undefined) {
      if (!path) {
        return '';
      }

      const response = await fetch('/api/storage/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; signedUrl?: string } | null;
      return response.ok && payload?.ok ? payload.signedUrl ?? '' : '';
    }

    async function loadPreview() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();

      if (userData.user?.id) {
        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();

        if (member?.store_id) {
          const { data: store } = await supabase
            .from<CompanyProfile>('stores')
            .select(
              'name, company_name, company_kana, representative_name, invoice_registration_number, postal_code, address, building, phone, fax, email, website_url, bank_name, bank_branch_name, bank_account_type, bank_account_number, bank_account_holder, invoice_note, logo_image_path, seal_image_path, document_primary_color, document_footer_text'
            )
            .eq('id', member.store_id)
            .single();

          setCompany(store);
          setLogoUrl(await imageUrl(store?.logo_image_path));
          setSealUrl(await imageUrl(store?.seal_image_path));
        }
      }

      const { data: dealData } = await supabase
        .from<DealRow>('deals')
        .select('id, title, customer_id, vehicle_id')
        .eq('id', dealId)
        .single();

      setDeal(dealData);

      const invoiceId = new URLSearchParams(window.location.search).get('invoiceId');
      const invoiceSelect =
        'id, invoice_no, issue_status, issue_date, payment_due_date, customer_name, customer_phone, customer_address, customer_honorific, vehicle_label, subtotal_amount, tax_amount, discount_amount, trade_in_amount, total_amount, paid_amount, unpaid_amount, customer_note, internal_memo';
      let selectedInvoice: InvoiceRow | null = null;

      if (invoiceId) {
        const { data: invoiceData } = await supabase
          .from<InvoiceRow>('invoices')
          .select(invoiceSelect)
          .eq('id', invoiceId)
          .single();
        selectedInvoice = invoiceData;
      } else {
        const { data: invoiceRows } = await supabase
          .from<InvoiceRow>('invoices')
          .select(invoiceSelect)
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false });
        selectedInvoice = invoiceRows?.[0] ?? null;
      }

      setInvoice(selectedInvoice);

      if (selectedInvoice?.id) {
        const { data: items } = await supabase
          .from<InvoiceItemRow>('invoice_items')
          .select('id, name, amount')
          .eq('invoice_id', selectedInvoice.id)
          .order('item_order', { ascending: true });
        setInvoiceItems(items ?? []);
      }

      if (dealData?.customer_id) {
        const { data } = await supabase
          .from<CustomerRow>('customers')
          .select('name, phone, email, address, customer_type')
          .eq('id', dealData.customer_id)
          .single();
        setCustomer(data);
      }

      if (dealData?.vehicle_id) {
        const { data } = await supabase
          .from<VehicleRow>('vehicles')
          .select('management_no, registration_no, maker, model_name, model_year, mileage_km, vin, total_price')
          .eq('id', dealData.vehicle_id)
          .single();
        setVehicle(data);
      }
    }

    void loadPreview();
  }, [dealId]);

  const documentColor = company?.document_primary_color || '#2563eb';
  const logoSrc = logoUrl || '/branding/garage-link-logo.png';
  const honorific =
    invoice?.customer_honorific ??
    (customer?.customer_type === '法人' || customer?.customer_type === 'corporate'
      ? '御中'
      : '様');
  const total = invoice?.total_amount ?? vehicle?.total_price ?? 0;
  const paidAmount = invoice?.paid_amount ?? 0;
  const unpaidAmount = invoice?.unpaid_amount ?? total - paidAmount;
  const subtotal = invoice?.subtotal_amount ?? total;
  const tax = invoice?.tax_amount ?? 0;
  const discount = invoice?.discount_amount ?? 0;
  const tradeIn = invoice?.trade_in_amount ?? 0;
  const paymentBreakdown = parseMemoJson<PaymentMemoItem[]>(invoice?.internal_memo, '支払方法内訳', []).filter(hasPaymentItem);
  const items =
    invoiceItems.length > 0
      ? invoiceItems
      : [
          { id: 'vehicle', name: '車両本体価格', amount: total },
          { id: 'registration', name: '登録代行費用', amount: 0 },
          { id: 'maintenance', name: '納車整備費用', amount: 0 },
          { id: 'discount', name: '値引き', amount: 0 },
          { id: 'trade-in', name: '下取り充当', amount: 0 },
        ];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .document-paper {
            box-shadow: none !important;
            border: 0 !important;
            width: 210mm !important;
            min-height: auto !important;
          }
          @page {
            size: A4 portrait;
            margin: 9mm;
          }
        }
      `}</style>

      <div className="no-print mx-auto mb-5 flex max-w-[960px] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">請求書プレビュー</p>
          <p className="mt-1 text-xs text-slate-500">A4縦で印刷・PDF保存できます。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
            {issueStatusLabel(invoice?.issue_status)}
          </span>
          <Link href="/invoices" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            一覧に戻る
          </Link>
          <Link href={`/deals/${dealId}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            商談詳細
          </Link>
          <button type="button" onClick={() => window.print()} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
            PDFを発行
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
            PDFをダウンロード
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            印刷
          </button>
          <Link href={`/deals/${dealId}/line/new`} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700">
            LINEで案内
          </Link>
        </div>
      </div>

      <section className="document-paper relative mx-auto min-h-[1120px] w-[210mm] max-w-full overflow-hidden border border-slate-200 bg-white p-10 shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        {invoice?.issue_status === 'cancelled' && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] text-7xl font-black text-red-100">
            取消済み
          </div>
        )}
        <header className="flex items-start justify-between gap-8 border-b-4 pb-5" style={{ borderColor: documentColor }}>
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="会社ロゴ" className="mb-5 h-16 max-w-[260px] object-contain object-left" />
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-black tracking-wide text-slate-950">請求書</h1>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {issueStatusLabel(invoice?.issue_status)}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">商談: {displayValue(deal?.title)}</p>
          </div>
          <div className="text-right text-xs leading-5 text-slate-700">
            <p className="text-base font-bold text-slate-950">{displayValue(company?.company_name ?? company?.name)}</p>
            <p>〒{displayValue(company?.postal_code)} {displayValue(company?.address)} {displayValue(company?.building)}</p>
            <p>TEL: {displayValue(company?.phone)} / FAX: {displayValue(company?.fax)}</p>
            <p>{displayValue(company?.email)}</p>
            {company?.invoice_registration_number && <p>登録番号: {company.invoice_registration_number}</p>}
            {sealUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sealUrl} alt="角印" className="ml-auto mt-2 h-20 w-20 object-contain" />
            )}
          </div>
        </header>

        <section className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-bold text-slate-500">請求番号</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{displayValue(invoice?.invoice_no)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-bold text-slate-500">発行日</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{displayValue(invoice?.issue_date ?? todayText())}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-bold text-slate-500">支払期限</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{displayValue(invoice?.payment_due_date)}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="border-b border-slate-200 pb-2 text-sm font-bold">請求先</h2>
            <p className="mt-4 text-xl font-bold">{displayValue(invoice?.customer_name ?? customer?.name)} {honorific}</p>
            <p className="mt-2 text-sm">住所: {displayValue(invoice?.customer_address ?? customer?.address)}</p>
            <p className="text-sm">電話番号: {displayValue(invoice?.customer_phone ?? customer?.phone)}</p>
            <p className="text-sm">メール: {displayValue(customer?.email)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="border-b border-slate-200 pb-2 text-sm font-bold">対象車両</h2>
            <dl className="mt-3 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-slate-500">管理番号</dt><dd>{displayValue(vehicle?.management_no)}</dd>
              <dt className="font-semibold text-slate-500">メーカー</dt><dd>{displayValue(vehicle?.maker)}</dd>
              <dt className="font-semibold text-slate-500">車種名</dt><dd>{displayValue(vehicle?.model_name ?? invoice?.vehicle_label)}</dd>
              <dt className="font-semibold text-slate-500">年式</dt><dd>{displayValue(vehicle?.model_year)}</dd>
              <dt className="font-semibold text-slate-500">走行距離</dt><dd>{vehicle?.mileage_km ? `${vehicle.mileage_km.toLocaleString('ja-JP')}km` : '-'}</dd>
              <dt className="font-semibold text-slate-500">車台番号</dt><dd>{displayValue(vehicle?.vin)}</dd>
              <dt className="font-semibold text-slate-500">登録番号</dt><dd>{displayValue(vehicle?.registration_no)}</dd>
            </dl>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold text-slate-950">請求明細</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="border border-slate-300 px-3 py-2 text-left">項目名</th>
                <th className="border border-slate-300 px-3 py-2 text-left">内容</th>
                <th className="border border-slate-300 px-3 py-2 text-right">数量</th>
                <th className="border border-slate-300 px-3 py-2 text-right">単価</th>
                <th className="border border-slate-300 px-3 py-2 text-right">金額</th>
                <th className="border border-slate-300 px-3 py-2 text-center">税区分</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="border border-slate-300 px-3 py-2">{displayValue(item.name)}</td>
                  <td className="border border-slate-300 px-3 py-2">-</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">1</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatPrice(item.amount)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatPrice(item.amount)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-center">対象外</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 ml-auto max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between border-b border-slate-200 py-2">
            <span>小計</span>
            <span className="font-bold">{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-2">
            <span>値引き</span>
            <span className="font-bold">{formatPrice(discount * -1)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-2">
            <span>消費税</span>
            <span className="font-bold">{formatPrice(tax)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-2">
            <span>下取り充当</span>
            <span className="font-bold">{formatPrice(tradeIn * -1)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-2">
            <span>請求合計</span>
            <span className="font-bold">{formatPrice(total)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-2">
            <span>入金済</span>
            <span className="font-bold">{formatPrice(paidAmount)}</span>
          </div>
          <div className="flex justify-between py-4 text-xl font-bold" style={{ color: documentColor }}>
            <span>未入金</span>
            <span>{formatPrice(unpaidAmount)}</span>
          </div>
          <div className="rounded-lg px-3 py-2 text-right text-2xl font-black text-white" style={{ backgroundColor: documentColor }}>
            請求合計 {formatPrice(total)}
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-300 p-4 text-sm">
            <h2 className="font-bold">振込先情報</h2>
            <div className="mt-2 space-y-1 text-slate-600">
              <p>{displayValue(company?.bank_name)} {displayValue(company?.bank_branch_name)}</p>
              <p>{displayValue(company?.bank_account_type)} {displayValue(company?.bank_account_number)}</p>
              <p>口座名義: {displayValue(company?.bank_account_holder)}</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-300 p-4 text-sm">
            <h2 className="font-bold">支払方法内訳・備考</h2>
            {paymentBreakdown.length > 0 ? (
              <div className="mt-3 space-y-2">
                {paymentBreakdown.map((item, index) => (
                  <div key={`${item.method}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 pb-2">
                    <div>
                      <p className="font-bold">{displayValue(item.method)}</p>
                      <p className="text-xs text-slate-500">{displayValue(item.scheduledDate)} {displayValue(item.note)}</p>
                    </div>
                    <p className="font-bold">{formatPrice(Number(item.amount || 0))}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-slate-600">支払方法内訳は請求書作成画面で設定します。</p>
            )}
            <p className="mt-2 whitespace-pre-wrap text-slate-600">{displayValue(company?.invoice_note)}</p>
            <p className="mt-2 whitespace-pre-wrap text-slate-600">{displayValue(invoice?.customer_note)}</p>
          </div>
        </section>

        {tradeIn > 0 && (
          <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
            <h2 className="font-bold text-slate-950">下取り充当</h2>
            <p className="mt-2 text-slate-600">下取り充当額: <span className="font-bold">{formatPrice(tradeIn)}</span></p>
          </section>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          {displayValue(company?.document_footer_text ?? 'GARAGE LINK')}
        </footer>
      </section>
    </main>
  );
}
