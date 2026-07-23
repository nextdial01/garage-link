#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env.secrets.local'));

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith('sk_test_')) {
  throw new Error('Stripeテストキーが設定されていません。本番キーでは実行できません。');
}

const stripe = new Stripe(secretKey);
const now = new Date();
const periodStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
const periodEnd = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
let customerId = null;
let invoiceId = null;

try {
  const customer = await stripe.customers.create({
    name: 'GARAGE LINK 請求書検証用',
    email: 'garage-link-invoice-test@example.invalid',
    metadata: { purpose: 'garage-link-invoice-verification', disposable: 'true' },
  });
  customerId = customer.id;

  await stripe.invoiceItems.create({
    customer: customer.id,
    amount: 16280,
    currency: 'jpy',
    description: 'GARAGE LINK Standard 月額利用料（検証用）',
    period: { start: periodStart, end: periodEnd },
  });

  const draft = await stripe.invoices.create({
    customer: customer.id,
    pending_invoice_items_behavior: 'include',
    collection_method: 'send_invoice',
    days_until_due: 30,
    auto_advance: false,
    description: 'GARAGE LINK 請求書PDF検証',
    metadata: { purpose: 'garage-link-invoice-verification', disposable: 'true' },
  });
  invoiceId = draft.id;
  const invoice = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });

  assert.equal(invoice.livemode, false);
  assert.equal(invoice.customer, customer.id);
  assert.equal(invoice.total, 16280);
  assert.equal(invoice.currency, 'jpy');
  assert.ok(invoice.number);
  assert.ok(invoice.invoice_pdf?.startsWith('https://'));

  const line = invoice.lines.data[0];
  assert.equal(line?.period.start, periodStart);
  assert.equal(line?.period.end, periodEnd);

  const pdfResponse = await fetch(invoice.invoice_pdf, { redirect: 'follow' });
  assert.equal(pdfResponse.ok, true);
  assert.match(pdfResponse.headers.get('content-type') ?? '', /application\/(pdf|octet-stream)/);
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
  assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 4)), '%PDF');

  console.log(JSON.stringify({
    mode: 'test',
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    total: invoice.total,
    currency: invoice.currency,
    periodStart: new Date(periodStart * 1000).toISOString(),
    periodEnd: new Date(periodEnd * 1000).toISOString(),
    pdfVerified: true,
    status: invoice.status,
  }, null, 2));
} finally {
  if (invoiceId) {
    await stripe.invoices.voidInvoice(invoiceId).catch(() => undefined);
  }
  if (customerId) {
    await stripe.customers.del(customerId).catch(() => undefined);
  }
}
