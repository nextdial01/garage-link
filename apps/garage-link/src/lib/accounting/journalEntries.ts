/**
 * Turns issued invoices into simple two-sided journal entries for accounting
 * software import (freee / 弥生 / マネーフォワード).
 *
 * GARAGE LINK stores invoice line amounts tax-inclusive without a reliable
 * per-line tax breakdown (`invoice_items.tax_amount` is not actually
 * computed at creation time — it is always written as 0). This module
 * derives the tax split at export time from `tax_rate`, which *is* stored
 * correctly, rather than trusting the unused `tax_amount` column or the
 * invoice header's `subtotal_amount`/`tax_amount` fields (which can drift
 * from the line items and are not used to guarantee the entry balances).
 *
 * Treatment by item_type:
 * - vehicle / fee / option / other / part / discount / trade_in → taxable
 *   revenue (credited to the sales account, split out consumption tax)
 * - insurance / tax → NOT company revenue. 自賠責保険・重量税・印紙代は
 *   amounts the shop collects from the customer to pay a third party
 *   (insurer, government) on their behalf — booked as a pass-through
 *   liability (預り金) rather than sales, matching standard practice for
 *   auto dealers.
 * - リサイクル預託金 is stored with item_type "fee" (not a distinct type),
 *   so it is matched by name instead and treated the same way as
 *   insurance/tax: a pass-through liability, not revenue.
 * This is a simplification; shops with different bookkeeping conventions
 * should adjust the exported entries with their accountant.
 */

export type AccountNames = {
  salesAccountName: string;
  receivableAccountName: string;
  suspenseAccountName: string;
  outputTaxAccountName: string;
};

export type InvoiceItemForExport = {
  item_type: string | null;
  name: string | null;
  amount: number;
  tax_rate: number | null;
};

export type InvoiceForExport = {
  id: string;
  invoice_no: string | null;
  issue_date: string | null;
  customer_name: string | null;
  items: InvoiceItemForExport[];
};

const NON_REVENUE_ITEM_TYPES = new Set(["insurance", "tax"]);
const NON_REVENUE_ITEM_NAMES = new Set(["リサイクル預託金"]);

function isNonRevenueItem(item: InvoiceItemForExport): boolean {
  return NON_REVENUE_ITEM_TYPES.has(item.item_type ?? "") || NON_REVENUE_ITEM_NAMES.has(item.name?.trim() ?? "");
}

export type JournalCreditLine = {
  account: string;
  amount: number;
  taxCategory: "taxable" | "tax" | "exempt";
  taxRate: number | null;
};

export type JournalEntry = {
  invoiceId: string;
  date: string;
  memo: string;
  debitAccount: string;
  debitAmount: number;
  creditLines: JournalCreditLine[];
};

/** Extracts consumption tax from a tax-inclusive amount, floor-rounded. */
function splitTaxInclusive(amountTaxInclusive: number, rate: number): { exTax: number; tax: number } {
  if (rate <= 0) return { exTax: amountTaxInclusive, tax: 0 };
  const exTax = Math.round(amountTaxInclusive / (1 + rate));
  return { exTax, tax: amountTaxInclusive - exTax };
}

export function buildJournalEntries(invoices: InvoiceForExport[], accounts: AccountNames): JournalEntry[] {
  const entries: JournalEntry[] = [];

  for (const invoice of invoices) {
    if (!invoice.issue_date) continue;

    const revenueByRate = new Map<number, number>();
    let suspenseAmount = 0;

    for (const item of invoice.items) {
      if (!item.amount) continue;
      if (isNonRevenueItem(item)) {
        suspenseAmount += item.amount;
        continue;
      }
      const rate = item.tax_rate ?? 0.1;
      revenueByRate.set(rate, (revenueByRate.get(rate) ?? 0) + item.amount);
    }

    const creditLines: JournalCreditLine[] = [];
    let total = suspenseAmount;

    for (const [rate, taxInclusive] of revenueByRate) {
      if (taxInclusive === 0) continue;
      const { exTax, tax } = splitTaxInclusive(taxInclusive, rate);
      total += taxInclusive;
      if (exTax !== 0) {
        creditLines.push({ account: accounts.salesAccountName, amount: exTax, taxCategory: rate > 0 ? "taxable" : "exempt", taxRate: rate });
      }
      if (tax !== 0) {
        creditLines.push({ account: accounts.outputTaxAccountName, amount: tax, taxCategory: "tax", taxRate: rate });
      }
    }

    if (suspenseAmount !== 0) {
      creditLines.push({ account: accounts.suspenseAccountName, amount: suspenseAmount, taxCategory: "exempt", taxRate: null });
    }

    if (total === 0 || creditLines.length === 0) continue;

    const memoParts = [invoice.customer_name?.trim(), invoice.invoice_no ? `請求書${invoice.invoice_no}` : null].filter(Boolean);

    entries.push({
      invoiceId: invoice.id,
      date: invoice.issue_date,
      memo: memoParts.join(" ") || "請求書",
      debitAccount: accounts.receivableAccountName,
      debitAmount: total,
      creditLines,
    });
  }

  return entries;
}
