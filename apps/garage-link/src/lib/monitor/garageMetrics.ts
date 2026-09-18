import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripeClient } from '@/lib/stripe/client';
import { GARAGE_STRIPE_PRICE_ENV } from '@/lib/billing/garageCommercial';

export type MonitorMetrics = {
  freeRegistrations: number | null;
  trials: number | null;
  paidCustomers: number | null;
  currentMonthRevenueJpy: number | null;
  lifetimeRevenueJpy: number | null;
  asOf: string;
  sourceStatus: 'ok' | 'partial' | 'error';
};

type SubscriptionRow = {
  tenant_id: string | null;
  stripe_subscription_id: string | null;
};

type TenantRow = {
  tenant_id: string;
};

type StripeSubscriptionLike = {
  id: string;
  status: string;
  items?: { data?: Array<{ price?: { id?: string | null } }> };
};

type StripeInvoiceLike = {
  id: string;
  amount_paid: number;
  currency: string;
  status: string | null;
  created: number;
  subscription?: string | { id?: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id?: string } | null } } | null;
  lines?: { data?: Array<{ price?: { id?: string | null }; pricing?: { price_details?: { price?: string | null } } }> };
};

type StripeCreditNoteLike = {
  invoice: string | { id?: string } | null;
  amount: number;
  status?: string | null;
};

type StripeMonitorClient = {
  subscriptions: { list: (params: { status: 'all'; limit: number }) => Promise<{ data: StripeSubscriptionLike[]; has_more: boolean }> };
  invoices: { list: (params: { status: 'paid'; limit: number; created?: { gte: number } }) => Promise<{ data: StripeInvoiceLike[]; has_more: boolean }> };
  creditNotes: { list: (params: { limit: number }) => Promise<{ data: StripeCreditNoteLike[]; has_more: boolean }> };
};

function configuredPriceIds() {
  return new Set(
    Object.values(GARAGE_STRIPE_PRICE_ENV)
      .map((envName) => process.env[envName]?.trim())
      .filter((value): value is string => Boolean(value)),
  );
}

function parseExcludedTenantIds() {
  const raw = process.env.GARAGE_LINK_MONITOR_EXCLUDED_TENANT_IDS?.trim();
  if (!raw) return null;
  const ids = raw.split(',').map((value) => value.trim()).filter(Boolean);
  return new Set(ids);
}

function isConfiguredSubscription(subscription: StripeSubscriptionLike, priceIds: Set<string>) {
  return subscription.items?.data?.some((item) => Boolean(item.price?.id && priceIds.has(item.price.id))) ?? false;
}

function isConfiguredInvoice(invoice: StripeInvoiceLike, priceIds: Set<string>) {
  return invoice.lines?.data?.some((line) => {
    const priceId = line.price?.id ?? line.pricing?.price_details?.price ?? null;
    return Boolean(priceId && priceIds.has(priceId));
  }) ?? false;
}

function invoiceSubscriptionId(invoice: StripeInvoiceLike) {
  const subscription = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  return typeof subscription === 'string' ? subscription : subscription?.id ?? null;
}

function monthStartJstSeconds(now = new Date()) {
  const jstYearMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(jstYearMonth.find((part) => part.type === 'year')?.value);
  const month = Number(jstYearMonth.find((part) => part.type === 'month')?.value);
  return Math.floor(Date.UTC(year, month - 1, 1, -9) / 1000);
}

async function listAll<T>(fetchPage: (limit: number) => Promise<{ data: T[]; has_more: boolean }>) {
  // The current applications have a small customer base. We deliberately fail closed
  // if this stops being true instead of silently reporting a partial total as final.
  const page = await fetchPage(100);
  return page.has_more ? null : page.data;
}

export function hasValidMonitorBearer(request: Request, envName: string) {
  const expected = process.env[envName]?.trim();
  const authorization = request.headers.get('authorization') ?? '';
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || !authorization.startsWith('Bearer ')) return false;
  const supplied = authorization.slice('Bearer '.length).trim();
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function getGarageMonitorMetrics(now = new Date()): Promise<MonitorMetrics> {
  const asOf = now.toISOString();
  const excludedTenantIds = parseExcludedTenantIds();
  const priceIds = configuredPriceIds();
  const admin = createAdminClient();
  const stripe = getStripeClient() as unknown as StripeMonitorClient | null;

  // Do not turn an unconfigured exclusion rule or billing mapping into zeroes.
  if (!excludedTenantIds || !admin || !stripe || priceIds.size === 0) {
    return {
      freeRegistrations: null,
      trials: null,
      paidCustomers: null,
      currentMonthRevenueJpy: null,
      lifetimeRevenueJpy: null,
      asOf,
      sourceStatus: 'partial',
    };
  }

  try {
    const [tenantResult, subscriptionResult, stripeSubscriptions, paidInvoices, creditNotes] = await Promise.all([
      admin.rpc('garage_monitor_active_tenant_ids'),
      admin.from('company_subscriptions').select('tenant_id,stripe_subscription_id'),
      listAll((limit) => stripe.subscriptions.list({ status: 'all', limit })),
      listAll((limit) => stripe.invoices.list({ status: 'paid', limit, created: { gte: monthStartJstSeconds(now) } })),
      listAll((limit) => stripe.creditNotes.list({ limit })),
    ]);

    if (tenantResult.error || subscriptionResult.error || !stripeSubscriptions || !paidInvoices || !creditNotes) {
      throw new Error('monitor_source_unavailable');
    }

    const subscriptionsByStripeId = new Map<string, SubscriptionRow>();
    for (const row of (subscriptionResult.data ?? []) as SubscriptionRow[]) {
      if (row.stripe_subscription_id && row.tenant_id) subscriptionsByStripeId.set(row.stripe_subscription_id, row);
    }

    const configuredSubscriptions = stripeSubscriptions.filter((subscription) => isConfiguredSubscription(subscription, priceIds));
    const attributableSubscriptions = configuredSubscriptions.filter((subscription) => {
      const row = subscriptionsByStripeId.get(subscription.id);
      return Boolean(row?.tenant_id && !excludedTenantIds.has(row.tenant_id) && isConfiguredSubscription(subscription, priceIds));
    });

    if (configuredSubscriptions.length !== attributableSubscriptions.length) {
      return {
        freeRegistrations: null,
        trials: null,
        paidCustomers: null,
        currentMonthRevenueJpy: null,
        lifetimeRevenueJpy: null,
        asOf,
        sourceStatus: 'partial',
      };
    }

    const refundsByInvoice = new Map<string, number>();
    for (const note of creditNotes) {
      if (note.status && note.status !== 'issued') continue;
      const invoiceId = typeof note.invoice === 'string' ? note.invoice : note.invoice?.id;
      if (!invoiceId) continue;
      refundsByInvoice.set(invoiceId, (refundsByInvoice.get(invoiceId) ?? 0) + note.amount);
    }

    const revenueFor = (invoices: StripeInvoiceLike[]) => invoices
      .filter((invoice) => invoice.status === 'paid' && invoice.currency === 'jpy' && invoice.amount_paid > 0)
      .filter((invoice) => isConfiguredInvoice(invoice, priceIds))
      .filter((invoice) => {
        const subscriptionId = invoiceSubscriptionId(invoice);
        const row = subscriptionId ? subscriptionsByStripeId.get(subscriptionId) : null;
        return Boolean(row?.tenant_id && !excludedTenantIds.has(row.tenant_id));
      })
      .reduce((total, invoice) => total + Math.max(0, invoice.amount_paid - (refundsByInvoice.get(invoice.id) ?? 0)), 0);

    // Lifetime revenue needs a second, complete source traversal; no historical
    // total is inferred from current subscriptions.
    const lifetimeInvoices = await listAll((limit) => stripe.invoices.list({ status: 'paid', limit }));
    if (!lifetimeInvoices) throw new Error('monitor_lifetime_source_unavailable');

    const configuredInvoices = [...paidInvoices, ...lifetimeInvoices]
      .filter((invoice) => isConfiguredInvoice(invoice, priceIds));
    const fullyAttributableInvoices = configuredInvoices.every((invoice) => {
      const subscriptionId = invoiceSubscriptionId(invoice);
      const row = subscriptionId ? subscriptionsByStripeId.get(subscriptionId) : null;
      return Boolean(row?.tenant_id);
    });
    if (!fullyAttributableInvoices) {
      return {
        freeRegistrations: null,
        trials: null,
        paidCustomers: null,
        currentMonthRevenueJpy: null,
        lifetimeRevenueJpy: null,
        asOf,
        sourceStatus: 'partial',
      };
    }

    return {
      freeRegistrations: ((tenantResult.data ?? []) as TenantRow[]).filter((tenant) => !excludedTenantIds.has(tenant.tenant_id)).length,
      trials: attributableSubscriptions.filter((subscription) => subscription.status === 'trialing').length,
      paidCustomers: attributableSubscriptions.filter((subscription) => subscription.status === 'active').length,
      currentMonthRevenueJpy: revenueFor(paidInvoices),
      lifetimeRevenueJpy: revenueFor(lifetimeInvoices),
      asOf,
      sourceStatus: 'ok',
    };
  } catch {
    return {
      freeRegistrations: null,
      trials: null,
      paidCustomers: null,
      currentMonthRevenueJpy: null,
      lifetimeRevenueJpy: null,
      asOf,
      sourceStatus: 'error',
    };
  }
}
