#!/usr/bin/env node
/**
 * Stripe テストモードに GARAGE LINK プラン Product/Price を作成し、
 * .env.secrets.local の STRIPE_PRICE_* を更新する。
 *
 * 使い方:
 *   cd /Users/ksk/garage-link
 *   node apps/garage-link/scripts/setup-stripe-test-products.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const secretsPath = path.join(root, '.env.secrets.local');

const PLANS = [
  { code: 'starter', name: 'GARAGE LINK Starter', amount: 6800 },
  { code: 'standard', name: 'GARAGE LINK Standard', amount: 14800 },
  { code: 'pro', name: 'GARAGE LINK Pro', amount: 29800 },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function upsertEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  const marker = '# --- Stripe（テストモード）---';
  if (content.includes(marker)) {
    return content.replace(marker, `${marker}\n${line}`);
  }
  return `${content.trim()}\n${line}\n`;
}

loadEnvFile(secretsPath);

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith('sk_test_')) {
  console.error('STRIPE_SECRET_KEY (sk_test_...) が .env.secrets.local に必要です。');
  process.exit(1);
}

const stripe = new Stripe(secretKey);
const created = {};

for (const plan of PLANS) {
  const product = await stripe.products.create({
    name: plan.name,
    metadata: { garage_plan_code: plan.code },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'jpy',
    unit_amount: plan.amount,
    recurring: { interval: 'month' },
    metadata: { garage_plan_code: plan.code },
  });

  created[plan.code] = price.id;
  console.log(`${plan.code}: ${price.id} (${plan.amount} JPY/month)`);
}

let secrets = fs.readFileSync(secretsPath, 'utf8');
for (const [code, priceId] of Object.entries(created)) {
  secrets = upsertEnvValue(secrets, `STRIPE_PRICE_${code.toUpperCase()}`, priceId);
}
fs.writeFileSync(secretsPath, secrets, 'utf8');

console.log('\nUpdated .env.secrets.local with STRIPE_PRICE_*');
console.log('Next: pnpm sync:env');
