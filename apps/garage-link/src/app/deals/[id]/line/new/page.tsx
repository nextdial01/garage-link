'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type DealRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  deal_no: string | null;
  title: string | null;
  status: string | null;
  next_action_at: string | null;
  assigned_user_name: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  line_friend_status: string | null;
  delivery_permission: string | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  total_price: number | null;
  inspection_expiry_date: string | null;
};

type QuoteRow = {
  id: string;
  quote_no: string | null;
  total_amount: number | null;
  issue_date: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_no: string | null;
  total_amount: number | null;
  payment_due_date: string | null;
};

type StoreRow = {
  id: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
};

type LineTemplateRow = {
  id: string;
  name: string | null;
  template_type: string | null;
  body: string | null;
  is_active: boolean | null;
};

type LineFriendRow = {
  id: string;
  line_user_id: string | null;
  line_display_name: string | null;
  friend_status: string | null;
  delivery_permission: boolean | null;
};

type LineMessageDraftInsert = {
  store_id: string;
  deal_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  message_type: string;
  title: string | null;
  body: string;
  status: string;
  line_user_id: string | null;
  line_display_name: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_by: string | null;
};

type LineMessageDraftIdRow = {
  id: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const messageTypeOptions = [
  { value: 'vehicle_proposal', label: '車両提案' },
  { value: 'quote_notice', label: '見積書案内' },
  { value: 'invoice_notice', label: '請求書案内' },
  { value: 'visit_reservation', label: '来店予約案内' },
  { value: 'delivery_notice', label: '納車案内' },
  { value: 'follow_up', label: 'フォローアップ' },
  { value: 'inspection_notice', label: '車検・整備案内' },
  { value: 'custom', label: '自由入力' },
];

const fallbackTemplateOptions = [
  { value: 'default:vehicle_proposal', label: '車両提案テンプレート', messageType: 'vehicle_proposal' },
  { value: 'default:quote_notice', label: '見積書案内テンプレート', messageType: 'quote_notice' },
  { value: 'default:invoice_notice', label: '請求書案内テンプレート', messageType: 'invoice_notice' },
  { value: 'default:visit_reservation', label: '来店予約テンプレート', messageType: 'visit_reservation' },
  { value: 'default:delivery_notice', label: '納車案内テンプレート', messageType: 'delivery_notice' },
  { value: 'default:inspection_notice', label: '車検・整備案内テンプレート', messageType: 'inspection_notice' },
  { value: 'default:follow_up', label: 'フォローアップテンプレート', messageType: 'follow_up' },
  { value: 'default:custom', label: '自由入力', messageType: 'custom' },
];

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}円`;
}

function formatMileage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}km`;
}

function vehicleName(vehicle: VehicleRow | null) {
  if (!vehicle) {
    return '-';
  }

  return `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim() || '-';
}

function compactVehicleName(vehicle: VehicleRow | null) {
  return vehicleName(vehicle) === '-' ? '対象車両' : vehicleName(vehicle);
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return value.slice(0, 10);
}

function replaceVariables(source: string, values: Record<string, string>) {
  return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => values[key] ?? '');
}

function buildVariableValues({
  deal,
  customer,
  vehicle,
  quote,
  invoice,
  store,
  origin,
  dealId,
}: {
  deal: DealRow | null;
  customer: CustomerRow | null;
  vehicle: VehicleRow | null;
  quote: QuoteRow | null;
  invoice: InvoiceRow | null;
  store: StoreRow | null;
  origin: string;
  dealId: string;
}) {
  const companyName = store?.company_name ?? store?.name ?? 'GARAGE LINK';
  const quoteUrl = `${origin}/deals/${dealId}/quotes/preview${quote?.id ? `?quoteId=${quote.id}` : ''}`;
  const invoiceUrl = `${origin}/deals/${dealId}/invoices/preview${invoice?.id ? `?invoiceId=${invoice.id}` : ''}`;

  return {
    customer_name: customer?.name ?? 'お客様',
    customer_phone: customer?.phone ?? '',
    customer_email: customer?.email ?? '',
    line_display_name: customer?.line_display_name ?? '',
    vehicle_name: compactVehicleName(vehicle),
    vehicle_maker: vehicle?.maker ?? '',
    vehicle_model: vehicle?.model_name ?? '',
    vehicle_management_no: vehicle?.management_no ?? '',
    vehicle_year: vehicle?.model_year ? String(vehicle.model_year) : '',
    vehicle_mileage: formatMileage(vehicle?.mileage_km),
    vehicle_total_price: formatPrice(vehicle?.total_price),
    vehicle_inspection_expiry_date: formatDate(vehicle?.inspection_expiry_date),
    deal_no: deal?.deal_no ?? '',
    deal_title: deal?.title ?? '商談',
    deal_status: deal?.status ?? '',
    next_follow_up_date: formatDate(deal?.next_action_at),
    quote_no: quote?.quote_no ?? '',
    quote_total: formatPrice(quote?.total_amount),
    quote_issue_date: formatDate(quote?.issue_date),
    quote_url: quoteUrl,
    invoice_no: invoice?.invoice_no ?? '',
    invoice_total: formatPrice(invoice?.total_amount),
    invoice_due_date: formatDate(invoice?.payment_due_date),
    invoice_url: invoiceUrl,
    company_name: companyName,
    company_phone: store?.phone ?? '',
    deal_url: `${origin}/deals/${dealId}`,
  };
}

function templateForType({
  messageType,
  deal,
  customer,
  vehicle,
  quote,
  invoice,
  store,
  origin,
  dealId,
}: {
  messageType: string;
  deal: DealRow | null;
  customer: CustomerRow | null;
  vehicle: VehicleRow | null;
  quote: QuoteRow | null;
  invoice: InvoiceRow | null;
  store: StoreRow | null;
  origin: string;
  dealId: string;
}) {
  const values = buildVariableValues({ deal, customer, vehicle, quote, invoice, store, origin, dealId });
  const templates: Record<string, string> = {
    vehicle_proposal: `{customer_name} 様

お問い合わせありがとうございます。
ご希望に近い車両をご案内いたします。

車両: {vehicle_name}
年式: {vehicle_year}
走行距離: {vehicle_mileage}
支払総額: {vehicle_total_price}

詳細をご確認いただき、現車確認や試乗をご希望の場合はこのLINEにてご返信ください。

{company_name}`,

    quote_notice: `{customer_name} 様

お見積書を作成しました。

車両: {vehicle_name}
見積番号: {quote_no}
見積金額: {quote_total}

以下より内容をご確認ください。
{quote_url}

ご不明点があれば、このLINEにてお気軽にご返信ください。

{company_name}`,

    invoice_notice: `{customer_name} 様

請求書を作成しました。

車両: {vehicle_name}
請求番号: {invoice_no}
請求金額: {invoice_total}
支払期限: {invoice_due_date}

以下より内容をご確認ください。
{invoice_url}

お支払い方法などご不明点があれば、このLINEにてご連絡ください。

{company_name}`,

    visit_reservation: `{customer_name} 様

お問い合わせありがとうございます。
{vehicle_name} の現車確認・ご来店予約についてご案内いたします。

ご希望の日時を2〜3候補ほど、このLINEにてご返信ください。
担当より日程を確認してご連絡いたします。

{company_name}`,

    delivery_notice: `{customer_name} 様

ご契約ありがとうございます。
{vehicle_name} の納車準備を進めております。

納車日程や必要書類について、確認事項があればこのLINEでご案内します。
ご不明点があればお気軽にご返信ください。

{company_name}`,

    inspection_notice: `{customer_name} 様

いつもありがとうございます。
車検・整備のご案内です。

対象車両: {vehicle_name}
車検満了日: {vehicle_inspection_expiry_date}

点検・車検予約をご希望の場合は、このLINEにて候補日時をご返信ください。

{company_name}`,

    follow_up: `{customer_name} 様

先日はお問い合わせありがとうございました。
{vehicle_name} のご検討状況はいかがでしょうか。

追加写真、見積内容、ローンのご相談などもLINEで承ります。
お気軽にご返信ください。

{company_name}`,

    custom: `{customer_name} 様



{company_name}`,
  };

  return replaceVariables(templates[messageType] ?? templates.custom, values);
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">
      {children}
    </label>
  );
}

function InfoItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{displayValue(value)}</dd>
    </div>
  );
}

export default function DealLineMessageNewPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const router = useRouter();
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [quoteId, setQuoteId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [store, setStore] = useState<StoreRow | null>(null);
  const [lineFriend, setLineFriend] = useState<LineFriendRow | null>(null);
  const [templates, setTemplates] = useState<LineTemplateRow[]>([]);
  const [messageType, setMessageType] = useState('quote_notice');
  const [templateName, setTemplateName] = useState('default:quote_notice');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendTiming, setSendTiming] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);

  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const origin = configuredAppUrl || (typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin);
  const quote = useMemo(
    () => quotes.find((item) => item.id === quoteId) ?? quotes[0] ?? null,
    [quoteId, quotes]
  );
  const invoice = useMemo(
    () => invoices.find((item) => item.id === invoiceId) ?? invoices[0] ?? null,
    [invoiceId, invoices]
  );
  const lineUserId = lineFriend?.line_user_id ?? customer?.line_user_id ?? null;
  const lineDisplayName = lineFriend?.line_display_name ?? customer?.line_display_name ?? null;
  const lineFriendStatus = lineFriend?.friend_status ?? customer?.line_friend_status ?? null;
  const deliveryPermission =
    typeof lineFriend?.delivery_permission === 'boolean'
      ? lineFriend.delivery_permission
        ? '許可'
        : '不許可'
      : customer?.delivery_permission ?? null;
  const templateChoices = useMemo(() => {
    const defaults = fallbackTemplateOptions.filter((option) => option.messageType === messageType || option.messageType === 'custom');
    const dbTemplates = templates
      .filter((template) => template.template_type === messageType || template.template_type === 'text' || template.template_type === 'custom')
      .map((template) => ({
        value: `template:${template.id}`,
        label: template.name ?? '名称未設定テンプレート',
        messageType: template.template_type ?? 'custom',
      }));

    return [...defaults, ...dbTemplates];
  }, [messageType, templates]);
  const variableValues = useMemo(
    () => buildVariableValues({ deal, customer, vehicle, quote, invoice, store, origin, dealId }),
    [customer, deal, dealId, invoice, origin, quote, store, vehicle]
  );
  const previewBody = useMemo(() => replaceVariables(body, variableValues), [body, variableValues]);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const { data: dealData, error: dealError } = await supabase
          .from<DealRow>('deals')
          .select('id, store_id, customer_id, vehicle_id, deal_no, title, status, next_action_at, assigned_user_name')
          .eq('id', dealId)
          .single();

        if (dealError || !dealData) {
          throw new Error(dealError?.message ?? '商談が見つかりません。');
        }

        const [customerResult, vehicleResult, quoteResult, invoiceResult, storeResult, templateResult] = await Promise.all([
          dealData.customer_id
            ? supabase
                .from<CustomerRow>('customers')
                .select('id, name, phone, email, line_user_id, line_display_name, line_friend_status, delivery_permission')
                .eq('id', dealData.customer_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          dealData.vehicle_id
            ? supabase
                .from<VehicleRow>('vehicles')
                .select('id, management_no, maker, model_name, model_year, mileage_km, total_price, inspection_expiry_date')
                .eq('id', dealData.vehicle_id)
                .single()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from<QuoteRow>('quotes')
            .select('id, quote_no, total_amount, issue_date')
            .eq('deal_id', dealData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from<InvoiceRow>('invoices')
            .select('id, invoice_no, total_amount, payment_due_date')
            .eq('deal_id', dealData.id)
            .order('created_at', { ascending: false }),
          supabase
            .from<StoreRow>('stores')
            .select('id, name, company_name, phone')
            .eq('id', dealData.store_id)
            .single(),
          supabase
            .from<LineTemplateRow>('line_templates')
            .select('id, name, template_type, body, is_active')
            .eq('store_id', dealData.store_id)
            .eq('is_active', true)
            .order('updated_at', { ascending: false }),
        ]);

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        if (vehicleResult.error) {
          throw new Error(vehicleResult.error.message);
        }

        if (quoteResult.error) {
          throw new Error(quoteResult.error.message);
        }

        if (invoiceResult.error) {
          throw new Error(invoiceResult.error.message);
        }

        if (storeResult.error) {
          throw new Error(storeResult.error.message);
        }

        if (templateResult.error) {
          throw new Error(templateResult.error.message);
        }

        let friendData: LineFriendRow | null = null;
        const selectedCustomer = customerResult.data;

        if (selectedCustomer?.line_user_id) {
          const { data: friends, error: friendError } = await supabase
            .from<LineFriendRow>('line_friends')
            .select('id, line_user_id, line_display_name, friend_status, delivery_permission')
            .eq('store_id', dealData.store_id)
            .eq('line_user_id', selectedCustomer.line_user_id);

          if (friendError) {
            throw new Error(friendError.message);
          }

          friendData = friends?.[0] ?? null;
        } else if (selectedCustomer?.id) {
          const { data: friends, error: friendError } = await supabase
            .from<LineFriendRow>('line_friends')
            .select('id, line_user_id, line_display_name, friend_status, delivery_permission')
            .eq('store_id', dealData.store_id)
            .eq('customer_id', selectedCustomer.id);

          if (friendError) {
            throw new Error(friendError.message);
          }

          friendData = friends?.[0] ?? null;
        }

        const loadedQuotes = quoteResult.data ?? [];
        const loadedInvoices = invoiceResult.data ?? [];
        const latestQuote = loadedQuotes[0] ?? null;
        const latestInvoice = loadedInvoices[0] ?? null;
        const initialType = latestQuote ? 'quote_notice' : 'vehicle_proposal';

        setDeal(dealData);
        setCustomer(selectedCustomer);
        setVehicle(vehicleResult.data);
        setQuotes(loadedQuotes);
        setInvoices(loadedInvoices);
        setQuoteId(latestQuote?.id ?? '');
        setInvoiceId(latestInvoice?.id ?? '');
        setStore(storeResult.data);
        setLineFriend(friendData);
        setTemplates(templateResult.data ?? []);
        setMessageType(initialType);
        setTemplateName(`default:${initialType}`);
        setTitle(`${dealData.title ?? '商談'} LINE案内`);
        setBody(
          templateForType({
            messageType: initialType,
            deal: dealData,
            customer: selectedCustomer,
            vehicle: vehicleResult.data,
            quote: latestQuote,
            invoice: latestInvoice,
            store: storeResult.data,
            origin,
            dealId,
          })
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE案内情報の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, [dealId, origin]);

  const sendWarning = useMemo(() => {
    if (!lineUserId) {
      return 'LINE未連携のため、実送信時にはLINEユーザーIDの連携が必要です。';
    }

    if (lineFriendStatus === 'blocked' || lineFriendStatus === 'ブロック') {
      return 'LINE友だち状態がブロックのため、送信できない可能性があります。';
    }

    if (deliveryPermission === '不許可') {
      return '配信許可が不許可のため、送信前に許可状態を確認してください。';
    }

    return '';
  }, [deliveryPermission, lineFriendStatus, lineUserId]);

  const links = {
    quoteUrl: `${origin}/deals/${dealId}/quotes/preview${quote?.id ? `?quoteId=${quote.id}` : ''}`,
    invoiceUrl: `${origin}/deals/${dealId}/invoices/preview${invoice?.id ? `?invoiceId=${invoice.id}` : ''}`,
    dealUrl: `${origin}/deals/${dealId}`,
  };

  function applyTemplate(nextType: string) {
    setMessageType(nextType);
    setTemplateName(`default:${nextType}`);
    setBody(
      templateForType({
        messageType: nextType,
        deal,
        customer,
        vehicle,
        quote,
        invoice,
        store,
        origin,
        dealId,
      })
    );
  }

  function applySelectedTemplate(nextTemplateName: string) {
    setTemplateName(nextTemplateName);

    if (nextTemplateName.startsWith('template:')) {
      const selectedTemplate = templates.find((template) => `template:${template.id}` === nextTemplateName);

      if (selectedTemplate?.body) {
        setBody(replaceVariables(selectedTemplate.body, variableValues));
      }

      return;
    }

    const defaultType = nextTemplateName.replace('default:', '');
    setMessageType(defaultType);
    setBody(
      templateForType({
        messageType: defaultType,
        deal,
        customer,
        vehicle,
        quote,
        invoice,
        store,
        origin,
        dealId,
      })
    );
  }

  async function createDraft(status: 'draft' | 'scheduled') {
    setErrorMessage('');
    setSuccessMessage('');

    if (!deal) {
      throw new Error('商談情報が見つかりません。');
    }

    const bodyToSave = replaceVariables(body.trim(), variableValues);

    if (!bodyToSave.trim()) {
      throw new Error('メッセージ本文を入力してください。');
    }

    if (status === 'scheduled' && !scheduledAt) {
      throw new Error('送信予約日時を入力してください。');
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const payload: LineMessageDraftInsert = {
      store_id: deal.store_id,
      deal_id: deal.id,
      customer_id: deal.customer_id,
      vehicle_id: deal.vehicle_id,
      quote_id: quote?.id ?? null,
      invoice_id: invoice?.id ?? null,
      message_type: messageType,
      title: toNullableText(title),
      body: bodyToSave.trim(),
      status,
      line_user_id: lineUserId,
      line_display_name: lineDisplayName,
      scheduled_at: status === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
      sent_at: null,
      created_by: userData.user?.email ?? null,
    };

    const { data: draft, error } = await supabase
      .from<LineMessageDraftIdRow>('line_message_drafts')
      .insert(payload)
      .select('id')
      .single();

    if (error || !draft?.id) {
      throw new Error(error?.message ?? 'LINE案内文の保存に失敗しました。');
    }

    return draft.id;
  }

  async function saveDraft(status: 'draft' | 'scheduled') {
    setIsSaving(true);

    try {
      await createDraft(status);
      if (status === 'scheduled') {
        router.push('/line/drafts');
        return;
      }
      setSuccessMessage('LINE案内文を下書き保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'LINE案内文の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function sendNow() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!lineUserId) {
      setErrorMessage('LINEユーザーIDが未設定のため送信できません。');
      return;
    }

    if (deliveryPermission === '不許可') {
      setErrorMessage('配信許可が不許可のため送信できません。');
      return;
    }

    if (lineFriendStatus === 'blocked' || lineFriendStatus === 'ブロック') {
      setErrorMessage('LINE友だち状態がブロックのため送信できません。');
      return;
    }

    if (!body.trim()) {
      setErrorMessage('メッセージ本文を入力してください。');
      return;
    }

    setIsSendingNow(true);

    try {
      const draftId = await createDraft('draft');
      const response = await fetch('/api/line/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ draftId }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'LINEメッセージの送信に失敗しました。');
      }

      router.push('/line/drafts');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'LINEメッセージの送信に失敗しました。');
    } finally {
      setIsSendingNow(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveDraft('draft');
  }

  return (
    <AppShell
      activeLabel="商談管理"
      title="LINE案内作成"
      description="この商談に紐づくLINE送信メッセージを作成します。"
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
        {errorMessage && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">送信先</h3>
                <p className="mt-1 text-sm text-slate-500">
                  顧客のLINE連携状態を確認します。
                </p>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-5">
                <InfoItem label="顧客名" value={customer?.name} />
                <InfoItem label="LINE表示名" value={lineDisplayName} />
                <InfoItem label="LINEユーザーID" value={lineUserId} />
                <InfoItem label="LINE友だち状態" value={lineFriendStatus} />
                <InfoItem label="配信許可" value={deliveryPermission} />
              </div>
              {sendWarning && (
                <p className="mx-5 mb-5 rounded-xl bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-800 sm:mx-6">
                  {sendWarning}
                </p>
              )}
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                    <h3 className="text-lg font-bold text-slate-950">メッセージ設定</h3>
                  </div>
                  <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="message_type">メッセージ種別</FieldLabel>
                      <select
                        id="message_type"
                        value={messageType}
                        onChange={(event) => applyTemplate(event.target.value)}
                        className={inputClass}
                      >
                        {messageTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel htmlFor="template">テンプレート選択</FieldLabel>
                      <select
                        id="template"
                        value={templateName}
                        onChange={(event) => applySelectedTemplate(event.target.value)}
                        className={inputClass}
                      >
                        {templateChoices.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-slate-500">
                        LINEテンプレートに登録済みの文面も選択できます。
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="title">タイトル</FieldLabel>
                      <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <FieldLabel htmlFor="body">メッセージ本文</FieldLabel>
                      <textarea
                        id="body"
                        rows={14}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        className={inputClass}
                      />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{body.length.toLocaleString('ja-JP')}文字</span>
                        <span>URL・顧客名・車両名が正しく入っているか確認してください。</span>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <p className="mb-2 text-sm font-bold text-slate-700">差し込み項目</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['顧客名', 'customer_name'],
                          ['車両名', 'vehicle_name'],
                          ['見積金額', 'quote_total'],
                          ['請求金額', 'invoice_total'],
                          ['見積URL', 'quote_url'],
                          ['請求URL', 'invoice_url'],
                          ['会社名', 'company_name'],
                        ].map(([label, key]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setBody((current) => `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}{${key}}`)}
                            className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 transition hover:bg-green-100"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                    <h3 className="text-lg font-bold text-slate-950">関連リンク</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      現在はローカルURLでプレビュー確認します。
                    </p>
                  </div>
                  <div className="grid gap-5 px-5 py-6 sm:px-6">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="quote_id">関連見積書</FieldLabel>
                        <select
                          id="quote_id"
                          value={quoteId}
                          onChange={(event) => {
                            setQuoteId(event.target.value);
                            if (messageType === 'quote_notice') {
                              const nextQuote = quotes.find((item) => item.id === event.target.value) ?? null;
                              setBody(
                                templateForType({
                                  messageType,
                                  deal,
                                  customer,
                                  vehicle,
                                  quote: nextQuote,
                                  invoice,
                                  store,
                                  origin,
                                  dealId,
                                })
                              );
                            }
                          }}
                          className={inputClass}
                        >
                          <option value="">未選択</option>
                          {quotes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {displayValue(item.quote_no)} / {formatPrice(item.total_amount)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel htmlFor="invoice_id">関連請求書</FieldLabel>
                        <select
                          id="invoice_id"
                          value={invoiceId}
                          onChange={(event) => {
                            setInvoiceId(event.target.value);
                            if (messageType === 'invoice_notice') {
                              const nextInvoice = invoices.find((item) => item.id === event.target.value) ?? null;
                              setBody(
                                templateForType({
                                  messageType,
                                  deal,
                                  customer,
                                  vehicle,
                                  quote,
                                  invoice: nextInvoice,
                                  store,
                                  origin,
                                  dealId,
                                })
                              );
                            }
                          }}
                          className={inputClass}
                        >
                          <option value="">未選択</option>
                          {invoices.map((item) => (
                            <option key={item.id} value={item.id}>
                              {displayValue(item.invoice_no)} / {formatPrice(item.total_amount)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <FieldLabel htmlFor="quote_url">見積書PDFプレビューURL</FieldLabel>
                      <input id="quote_url" type="text" value={links.quoteUrl} readOnly className={inputClass} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="invoice_url">請求書PDFプレビューURL</FieldLabel>
                      <input id="invoice_url" type="text" value={links.invoiceUrl} readOnly className={inputClass} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="deal_url">商談詳細URL</FieldLabel>
                      <input id="deal_url" type="text" value={links.dealUrl} readOnly className={inputClass} />
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                    <h3 className="text-lg font-bold text-slate-950">送信予定</h3>
                  </div>
                  <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
                      <input
                        type="radio"
                        name="send_timing"
                        checked={sendTiming === 'now'}
                        onChange={() => setSendTiming('now')}
                      />
                      すぐ送信
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
                      <input
                        type="radio"
                        name="send_timing"
                        checked={sendTiming === 'scheduled'}
                        onChange={() => setSendTiming('scheduled')}
                      />
                      日時指定
                    </label>
                    {sendTiming === 'scheduled' && (
                      <div className="md:col-span-2">
                        <FieldLabel htmlFor="scheduled_at">送信予定日時</FieldLabel>
                        <input
                          id="scheduled_at"
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(event) => setScheduledAt(event.target.value)}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="text-lg font-bold text-slate-950">プレビュー</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {displayValue(lineDisplayName ?? customer?.name)} 宛てのLINE表示イメージです。
                  </p>
                  <div className="mt-5 rounded-2xl bg-[#e8f5e9] p-4">
                    <div className="mb-3 text-xs font-bold text-green-800">
                      {displayValue(lineDisplayName ?? customer?.name)}
                    </div>
                    <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-white px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm">
                      <p className="whitespace-pre-wrap">{previewBody || 'メッセージ本文を入力してください。'}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="text-lg font-bold text-slate-950">参照情報</h3>
                  <dl className="mt-4 grid gap-4">
                    <InfoItem label="商談" value={deal?.title} />
                    <InfoItem label="対象車両" value={vehicleName(vehicle)} />
                    <InfoItem label="支払総額" value={formatPrice(vehicle?.total_price)} />
                    <InfoItem label="関連見積" value={quote ? `${displayValue(quote.quote_no)} / ${formatPrice(quote.total_amount)}` : '-'} />
                    <InfoItem label="関連請求" value={invoice ? `${displayValue(invoice.invoice_no)} / ${formatPrice(invoice.total_amount)}` : '-'} />
                    <InfoItem label="次回対応日" value={formatDate(deal?.next_action_at)} />
                  </dl>
                </section>
              </aside>
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
              <Link
                href={`/deals/${dealId}`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                キャンセル
              </Link>
              <button
                type="button"
                onClick={() => setSuccessMessage('テスト送信はまだ実装していません。本文プレビューのみ確認できます。')}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                テスト送信
              </button>
              <button
                type="button"
                disabled={isSendingNow || isSaving || !lineUserId}
                onClick={() => void sendNow()}
                className="inline-flex items-center justify-center rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSendingNow ? '送信中...' : '今すぐ送信'}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveDraft('scheduled')}
                className="inline-flex items-center justify-center rounded-xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-bold text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                送信予約
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? '保存中...' : '下書き保存'}
              </button>
            </div>
          </>
        )}
      </form>
    </AppShell>
  );
}
