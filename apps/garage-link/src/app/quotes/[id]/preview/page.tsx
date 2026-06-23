'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
  quote_note: string | null;
  logo_image_path: string | null;
  seal_image_path: string | null;
  document_primary_color: string | null;
  document_footer_text: string | null;
};

type QuoteRow = {
  id: string;
  quote_no: string | null;
  title: string | null;
  issue_status: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_honorific: string | null;
  vehicle_label: string | null;
  vehicle_maker: string | null;
  vehicle_model_name: string | null;
  vehicle_year: number | null;
  vehicle_mileage_km: number | null;
  vehicle_vin: string | null;
  vehicle_inspection_expiry_date: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  trade_in_amount: number | null;
  total_amount: number | null;
  customer_note: string | null;
  internal_memo: string | null;
};

type QuoteItemRow = {
  id: string;
  name: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  tax_amount: number | null;
  amount: number | null;
};

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatPrice(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${value.toLocaleString('ja-JP')}円`;
}

function formatMileage(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${value.toLocaleString('ja-JP')}km`;
}

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function issueStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'issued': return '発行済み';
    case 'cancelled': return '取消済み';
    case 'draft': return '下書き';
    default: return displayValue(status);
  }
}

type PaymentMemoItem = {
  method?: string;
  amount?: string;
  scheduledDate?: string;
  note?: string;
};

function parseMemoJson<T>(memo: string | null | undefined, label: string, fallback: T): T {
  if (!memo) return fallback;
  const line = memo.split('\n').find((item) => item.startsWith(`${label}: `));
  if (!line) return fallback;
  try {
    return JSON.parse(line.replace(`${label}: `, '')) as T;
  } catch {
    return fallback;
  }
}

function hasPaymentItem(item: PaymentMemoItem) {
  return Boolean(item.method || item.amount || item.scheduledDate || item.note);
}

export default function StandaloneQuotePreviewPage() {
  const params = useParams<{ id: string }>();
  const quoteId = params.id;
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItemRow[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [sealUrl, setSealUrl] = useState('');

  useEffect(() => {
    async function imageUrl(path: string | null | undefined) {
      if (!path) return '';
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
              'name, company_name, company_kana, representative_name, invoice_registration_number, postal_code, address, building, phone, fax, email, website_url, bank_name, bank_branch_name, bank_account_type, bank_account_number, bank_account_holder, quote_note, logo_image_path, seal_image_path, document_primary_color, document_footer_text'
            )
            .eq('id', member.store_id)
            .single();

          setCompany(store);
          setLogoUrl(await imageUrl(store?.logo_image_path));
          setSealUrl(await imageUrl(store?.seal_image_path));

          const quoteSelect =
            'id, quote_no, title, issue_status, issue_date, expiry_date, customer_name, customer_phone, customer_email, customer_address, customer_honorific, vehicle_label, vehicle_maker, vehicle_model_name, vehicle_year, vehicle_mileage_km, vehicle_vin, vehicle_inspection_expiry_date, subtotal_amount, tax_amount, discount_amount, trade_in_amount, total_amount, customer_note, internal_memo';

          const { data: quoteData } = await supabase
            .from<QuoteRow>('quotes')
            .select(quoteSelect)
            .eq('id', quoteId)
            .eq('store_id', member.store_id)
            .single();

          setQuote(quoteData);

          if (quoteData?.id) {
            const { data: items } = await supabase
              .from<QuoteItemRow>('quote_items')
              .select('id, name, description, quantity, unit_price, tax_amount, amount')
              .eq('quote_id', quoteData.id)
              .eq('store_id', member.store_id)
              .order('item_order', { ascending: true });
            setQuoteItems(items ?? []);
          }
        }
      }
    }

    void loadPreview();
  }, [quoteId]);

  const documentColor = company?.document_primary_color || '#2563eb';
  const logoSrc = logoUrl || '/branding/garage-link-logo.png';
  const customerName = quote?.customer_name;
  const honorific = quote?.customer_honorific ?? '様';
  const subtotal = quote?.subtotal_amount ?? 0;
  const tax = quote?.tax_amount ?? 0;
  const discount = quote?.discount_amount ?? 0;
  const tradeIn = quote?.trade_in_amount ?? 0;
  const total = quote?.total_amount ?? subtotal + tax - discount - tradeIn;
  const paymentBreakdown = parseMemoJson<PaymentMemoItem[]>(quote?.internal_memo, '支払方法内訳', []).filter(hasPaymentItem);

  const items = useMemo(() => {
    if (quoteItems.length > 0) return quoteItems;
    return [{ id: 'vehicle', name: '車両本体価格', description: null, quantity: 1, unit_price: total, tax_amount: 0, amount: total }];
  }, [quoteItems, total]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .document-paper { box-shadow: none !important; border: 0 !important; width: 210mm !important; min-height: auto !important; }
          @page { size: A4 portrait; margin: 9mm; }
        }
      `}</style>

      <div className="no-print mx-auto mb-5 flex max-w-[960px] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">見積書プレビュー</p>
          <p className="mt-1 text-xs text-slate-500">A4縦で印刷・PDF保存できます。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
            {issueStatusLabel(quote?.issue_status)}
          </span>
          <Link href={`/quotes/${quoteId}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            詳細に戻る
          </Link>
          <Link href="/quotes" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
            一覧に戻る
          </Link>
          <button type="button" onClick={() => window.print()} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
            PDFを発行
          </button>
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            印刷
          </button>
        </div>
      </div>

      <section className="document-paper relative mx-auto min-h-[1120px] w-[210mm] max-w-full overflow-hidden border border-slate-200 bg-white p-10 shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        {quote?.issue_status === 'cancelled' && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] text-7xl font-black text-red-100">
            取消済み
          </div>
        )}
        <header className="flex items-start justify-between gap-8 border-b-4 pb-5" style={{ borderColor: documentColor }}>
          <div className="min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="会社ロゴ" className="mb-5 h-16 max-w-[260px] object-contain object-left" />
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-black tracking-wide text-slate-950">見積書</h1>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {issueStatusLabel(quote?.issue_status)}
              </span>
            </div>
            {quote?.title && <p className="mt-3 text-sm text-slate-600">{quote.title}</p>}
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
            <p className="font-bold text-slate-500">見積番号</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{displayValue(quote?.quote_no)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-bold text-slate-500">発行日</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{displayValue(quote?.issue_date ?? todayText())}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-bold text-slate-500">有効期限</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{displayValue(quote?.expiry_date)}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="border-b border-slate-200 pb-2 text-sm font-bold text-slate-950">御見積先</h2>
            <p className="mt-4 text-xl font-bold">{displayValue(customerName)} {honorific}</p>
            <p className="mt-3 text-sm">住所: {displayValue(quote?.customer_address)}</p>
            <p className="text-sm">電話番号: {displayValue(quote?.customer_phone)}</p>
            <p className="text-sm">メール: {displayValue(quote?.customer_email)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="border-b border-slate-200 pb-2 text-sm font-bold text-slate-950">対象車両</h2>
            <dl className="mt-3 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold text-slate-500">メーカー</dt><dd>{displayValue(quote?.vehicle_maker)}</dd>
              <dt className="font-semibold text-slate-500">車種名</dt><dd>{displayValue(quote?.vehicle_model_name ?? quote?.vehicle_label)}</dd>
              <dt className="font-semibold text-slate-500">年式</dt><dd>{displayValue(quote?.vehicle_year)}</dd>
              <dt className="font-semibold text-slate-500">走行距離</dt><dd>{formatMileage(quote?.vehicle_mileage_km)}</dd>
              <dt className="font-semibold text-slate-500">車台番号</dt><dd>{displayValue(quote?.vehicle_vin)}</dd>
              <dt className="font-semibold text-slate-500">車検満了日</dt><dd>{displayValue(quote?.vehicle_inspection_expiry_date)}</dd>
            </dl>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-base font-bold text-slate-950">見積明細</h2>
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
                  <td className="border border-slate-300 px-3 py-2">{displayValue(item.description)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{displayValue(item.quantity)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatPrice(item.unit_price)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">{formatPrice(item.amount)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-center">{item.tax_amount ? '課税' : '対象外'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 ml-auto max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          {([
            ['小計', subtotal],
            ['消費税', tax],
            ['値引き', discount * -1],
            ['下取り充当', tradeIn * -1],
          ] as [string, number][]).map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-slate-200 py-2">
              <span>{label}</span>
              <span className="font-bold">{formatPrice(value)}</span>
            </div>
          ))}
          <div className="flex justify-between py-4 text-xl font-bold" style={{ color: documentColor }}>
            <span>見積合計</span>
            <span>{formatPrice(total)}</span>
          </div>
          <div className="rounded-lg px-3 py-2 text-right text-2xl font-black text-white" style={{ backgroundColor: documentColor }}>
            支払総額 {formatPrice(total)}
          </div>
        </section>

        {(paymentBreakdown.length > 0 || company?.quote_note || quote?.customer_note) && (
          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-300 p-4 text-sm">
              <h2 className="font-bold">支払方法内訳</h2>
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
                <p className="mt-2 text-slate-600">-</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-300 p-4 text-sm">
              <h2 className="font-bold">備考</h2>
              {company?.quote_note && <p className="mt-2 whitespace-pre-wrap text-slate-600">{company.quote_note}</p>}
              {quote?.customer_note && <p className="mt-2 whitespace-pre-wrap text-slate-600">{quote.customer_note}</p>}
            </div>
          </section>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          {displayValue(company?.document_footer_text ?? 'GARAGE LINK')}
        </footer>
      </section>
    </main>
  );
}
