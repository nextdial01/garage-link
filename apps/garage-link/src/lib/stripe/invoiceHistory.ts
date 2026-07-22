import type Stripe from 'stripe';

export type BillingInvoice = {
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

export function toBillingInvoice(invoice: Stripe.Invoice): BillingInvoice | null {
  if (!invoice.number || !invoice.invoice_pdf || !invoice.status || invoice.status === 'draft') return null;

  return {
    id: invoice.id,
    number: invoice.number,
    issuedAt: new Date((invoice.status_transitions.finalized_at ?? invoice.created) * 1000).toISOString(),
    periodStart: new Date(invoice.period_start * 1000).toISOString(),
    periodEnd: new Date(invoice.period_end * 1000).toISOString(),
    amount: invoice.total,
    currency: invoice.currency,
    status: invoice.status,
    pdfUrl: `/api/billing/invoices/${encodeURIComponent(invoice.id)}/download`,
  };
}
