import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildJournalEntries, type AccountNames, type InvoiceForExport } from '@/lib/accounting/journalEntries';
import { formatYayoiCsv, formatMoneyForwardCsv, encodeShiftJis } from '@/lib/accounting/csvFormat';

export const dynamic = 'force-dynamic';

type StoreMemberRow = { store_id: string };
type SettingsRow = {
  sales_account_name: string;
  receivable_account_name: string;
  suspense_account_name: string;
  output_tax_account_name: string;
};
type InvoiceRow = {
  id: string;
  invoice_no: string | null;
  issue_date: string | null;
  customer_name: string | null;
};
type InvoiceItemRow = {
  invoice_id: string;
  item_type: string | null;
  name: string | null;
  amount: number | null;
  tax_rate: number | null;
};

const DEFAULT_ACCOUNTS: AccountNames = {
  salesAccountName: '売上高',
  receivableAccountName: '売掛金',
  suspenseAccountName: '預り金',
  outputTaxAccountName: '仮受消費税等',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'moneyforward' ? 'moneyforward' : 'yayoi';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: '期間（開始日・終了日）を指定してください。' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id')
    .eq('user_id', userData.user.id)
    .single();
  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗が見つかりません。' }, { status: 403 });
  }
  const storeId = member.store_id;

  const { data: settingsRow } = await supabase
    .from<SettingsRow>('accounting_export_settings')
    .select('sales_account_name, receivable_account_name, suspense_account_name, output_tax_account_name')
    .eq('store_id', storeId)
    .maybeSingle();

  const accounts: AccountNames = settingsRow
    ? {
        salesAccountName: settingsRow.sales_account_name,
        receivableAccountName: settingsRow.receivable_account_name,
        suspenseAccountName: settingsRow.suspense_account_name,
        outputTaxAccountName: settingsRow.output_tax_account_name,
      }
    : DEFAULT_ACCOUNTS;

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from<InvoiceRow>('invoices')
    .select('id, invoice_no, issue_date, customer_name')
    .eq('store_id', storeId)
    .eq('issue_status', 'issued')
    .gte('issue_date', from)
    .lte('issue_date', to)
    .order('issue_date', { ascending: true });
  if (invoiceError) {
    return NextResponse.json({ ok: false, error: '請求書の取得に失敗しました。' }, { status: 500 });
  }
  const invoices = invoiceRows ?? [];
  if (invoices.length === 0) {
    return NextResponse.json({ ok: false, error: '指定した期間に発行済みの請求書がありません。' }, { status: 404 });
  }

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const { data: itemRows, error: itemError } = await supabase
    .from<InvoiceItemRow>('invoice_items')
    .select('invoice_id, item_type, name, amount, tax_rate')
    .eq('store_id', storeId)
    .in('invoice_id', invoiceIds);
  if (itemError) {
    return NextResponse.json({ ok: false, error: '請求書明細の取得に失敗しました。' }, { status: 500 });
  }

  const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
  for (const item of itemRows ?? []) {
    const list = itemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    itemsByInvoice.set(item.invoice_id, list);
  }

  const invoicesForExport: InvoiceForExport[] = invoices.map((invoice) => ({
    id: invoice.id,
    invoice_no: invoice.invoice_no,
    issue_date: invoice.issue_date,
    customer_name: invoice.customer_name,
    items: (itemsByInvoice.get(invoice.id) ?? []).map((item) => ({
      item_type: item.item_type,
      name: item.name,
      amount: item.amount ?? 0,
      tax_rate: item.tax_rate,
    })),
  }));

  const entries = buildJournalEntries(invoicesForExport, accounts);
  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: '仕訳として出力できる請求書がありませんでした。' }, { status: 404 });
  }

  if (format === 'moneyforward') {
    const csv = formatMoneyForwardCsv(entries);
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="garage-link-journal-mf-${from}_${to}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  const csv = formatYayoiCsv(entries);
  const shiftJisBody = new Uint8Array(encodeShiftJis(csv));
  return new NextResponse(shiftJisBody, {
    headers: {
      'content-type': 'text/csv; charset=Shift_JIS',
      'content-disposition': `attachment; filename="garage-link-journal-yayoi-${from}_${to}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
