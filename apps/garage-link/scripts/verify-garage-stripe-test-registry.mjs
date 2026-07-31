import Stripe from 'stripe';

const expected = [
  { item: 'starter', env: 'STRIPE_PRICE_STARTER', amount: 7480, product: 'prod_UphNg22hvZ9jwJ' },
  { item: 'standard', env: 'STRIPE_PRICE_STANDARD', amount: 16280, product: 'prod_UphN5d2aHTgzC5' },
  { item: 'pro', env: 'STRIPE_PRICE_PRO', amount: 32780, product: 'prod_UphNLsoQw4UEmp' },
  { item: 'extra_staff', env: 'STRIPE_PRICE_EXTRA_STAFF', amount: 1100 },
  { item: 'extra_store', env: 'STRIPE_PRICE_EXTRA_STORE', amount: 5500 },
  { item: 'extra_storage_10gb', env: 'STRIPE_PRICE_EXTRA_STORAGE_10GB', amount: 550 },
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const secret = required('STRIPE_SECRET_KEY');
  if (!secret.startsWith('sk_test_')) {
    throw new Error('Refusing Stripe registry verification: test mode key is required');
  }

  const stripe = new Stripe(secret, { apiVersion: '2026-07-29.dahlia' });
  const results = [];

  for (const item of expected) {
    const priceId = required(item.env);
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = typeof price.product === 'string' ? null : price.product;
    const valid = price.livemode === false
      && price.active
      && price.currency === 'jpy'
      && price.unit_amount === item.amount
      && price.type === 'recurring'
      && price.recurring?.interval === 'month'
      && Boolean(product && !('deleted' in product && product.deleted) && product.active)
      && (!item.product || product?.id === item.product);
    results.push({
      item: item.item,
      mode: price.livemode ? 'live' : 'test',
      active: price.active,
      currency: price.currency,
      amount: price.unit_amount,
      interval: price.recurring?.interval ?? null,
      product_active: Boolean(product && !('deleted' in product && product.deleted) && product.active),
      product_id: product?.id ?? null,
      expected_product_id: item.product ?? null,
      expected_amount: item.amount,
      pass: valid,
    });
  }

  console.log(JSON.stringify({ mode: 'test', results }, null, 2));
  if (results.some((result) => !result.pass)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Stripe registry verification failed');
  process.exit(1);
});
