import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = resolve(root, 'contract/garage-commercial-contract.json');
const outputs = {
  ts: resolve(root, 'src/garagePlans.generated.ts'),
  stateTs: resolve(root, 'src/garageBillingState.generated.ts'),
  sql: resolve(root, '../../apps/garage-link/supabase/tests/garage-plan-entitlements.generated.sql'),
  stateSql: resolve(root, '../../apps/garage-link/supabase/tests/garage-billing-state.generated.sql'),
  csv: resolve(root, '../../apps/garage-link/docs/commercial/garage-plan-matrix.generated.csv'),
};
const migrationPath = resolve(
  root,
  '../../apps/garage-link/supabase/migrations/20260731000200_commercial_remediation_batch_1b.sql',
);
const contract = JSON.parse(await readFile(contractPath, 'utf8'));
const plans = Object.values(contract.plans);
const ts = `// GENERATED. Edit contract/garage-commercial-contract.json and run the generator.\n`
  + `export const GARAGE_PLAN_CONTRACT_DATA = ${JSON.stringify(contract.plans, null, 2)} as const;\n`
  + `export const GARAGE_ADDON_CONTRACT_DATA = ${JSON.stringify(contract.addons, null, 2)} as const;\n`
  + `export const GARAGE_BILLING_LIFECYCLE_CONTRACT = ${JSON.stringify(contract.billingLifecycle, null, 2)} as const;\n`;
const statePolicy = contract.billingStatePolicy;
const stateTs = `// GENERATED. Edit contract/garage-commercial-contract.json and run the generator.\n`
  + `export const GARAGE_BILLING_STATE_POLICY = ${JSON.stringify(statePolicy, null, 2)} as const;\n\n`
  + `export function resolveGeneratedGarageBillingState(input: {\n`
  + `  stripeStatus: string;\n  cancelAtPeriodEnd?: boolean;\n  graceEndsAt?: string | null;\n`
  + `  currentPeriodEnd?: string | null;\n  canceledAt?: string | null;\n`
  + `  restorationState?: string;\n  now?: Date;\n}): string {\n`
  + `  const now = (input.now ?? new Date()).getTime();\n`
  + `  if (!(GARAGE_BILLING_STATE_POLICY.recognizedStripeStatuses as readonly string[]).includes(input.stripeStatus)) return GARAGE_BILLING_STATE_POLICY.unknownStripeStatus;\n`
  + `  if ((GARAGE_BILLING_STATE_POLICY.restorationFailClosedStatuses as readonly string[]).includes(input.restorationState ?? '')) return 'reconciliation_required';\n`
  + `  if (input.stripeStatus === 'canceled' || input.canceledAt) return 'canceled';\n`
  + `  if (input.stripeStatus === 'incomplete') return 'initial_payment_pending';\n`
  + `  if ((GARAGE_BILLING_STATE_POLICY.unpaidStripeStatuses as readonly string[]).includes(input.stripeStatus)) return 'unpaid';\n`
  + `  if (input.stripeStatus === 'paused') return 'restricted';\n`
  + `  if (input.stripeStatus === 'past_due') {\n`
  + `    const deadline = input.graceEndsAt ? Date.parse(input.graceEndsAt) : Number.NaN;\n`
  + `    return Number.isFinite(deadline) && deadline > now ? 'grace_period' : 'restricted';\n`
  + `  }\n`
  + `  if (input.cancelAtPeriodEnd) {\n`
  + `    const periodEnd = input.currentPeriodEnd ? Date.parse(input.currentPeriodEnd) : Number.NaN;\n`
  + `    if (!Number.isFinite(periodEnd)) return 'canceled';\n`
  + `    return periodEnd <= now ? 'canceled' : 'cancellation_scheduled';\n`
  + `  }\n`
  + `  return (GARAGE_BILLING_STATE_POLICY.activeStripeStatuses as readonly string[]).includes(input.stripeStatus) ? 'active' : GARAGE_BILLING_STATE_POLICY.unknownStripeStatus;\n`
  + `}\n`;
const stateSqlCase = `case
    when p_stripe_status not in (${statePolicy.recognizedStripeStatuses.map((value) => `'${value}'`).join(', ')}) then '${statePolicy.unknownStripeStatus}'
    when p_restoration_state in (${statePolicy.restorationFailClosedStatuses.map((value) => `'${value}'`).join(', ')}) then 'reconciliation_required'
    when p_stripe_status = 'canceled' or p_cancelled_at is not null then 'canceled'
    when p_stripe_status = 'past_due' and p_grace_ends_at is not null and p_grace_ends_at > p_now then 'grace_period'
    when p_stripe_status = 'past_due' then 'restricted'
    when p_stripe_status = 'incomplete' then 'initial_payment_pending'
    when p_stripe_status in (${statePolicy.unpaidStripeStatuses.map((value) => `'${value}'`).join(', ')}) then 'unpaid'
    when p_stripe_status = 'paused' then 'restricted'
    when p_cancel_at_period_end and (p_current_period_end is null or p_current_period_end <= p_now) then 'canceled'
    when p_cancel_at_period_end then 'cancellation_scheduled'
    when p_stripe_status in (${statePolicy.activeStripeStatuses.map((value) => `'${value}'`).join(', ')}) then 'active'
    else '${statePolicy.unknownStripeStatus}'
  end`;
const stateSql = `-- GENERATED billing state CASE; migration must contain this exact expression.\n${stateSqlCase};\n`;
const sqlRows = plans.map((plan) => [
  `'${plan.code}'`, plan.monthlyPrice, plan.netBasisMonthlyPrice, plan.inventoryLimit,
  plan.includedStaffCount, plan.includedStoreCount, plan.storageLimitMb,
  plan.quoteInvoiceLimit === null ? 'null' : plan.quoteInvoiceLimit,
].join(', '));
const sql = `-- GENERATED contract fixture; migration values must match these rows.\nvalues\n`
  + sqlRows.map((row) => `  (${row})`).join(',\n') + ';\n';
const csvHeader = 'plan,name,gross_monthly_jpy,net_basis_jpy,inventory,staff,store,storage_mb,quote_invoice,l_link\n';
const csv = csvHeader + plans.map((plan) => [
  plan.code, plan.name, plan.monthlyPrice, plan.netBasisMonthlyPrice, plan.inventoryLimit,
  plan.includedStaffCount, plan.includedStoreCount, plan.storageLimitMb,
  plan.quoteInvoiceLimit ?? 'unlimited', plan.lLinkAvailability,
].join(',')).join('\n') + '\n';

const expected = {
  [outputs.ts]: ts,
  [outputs.stateTs]: stateTs,
  [outputs.sql]: sql,
  [outputs.stateSql]: stateSql,
  [outputs.csv]: csv,
};
if (process.argv.includes('--check')) {
  const mismatches = [];
  for (const [path, content] of Object.entries(expected)) {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== content) mismatches.push(path);
  }
  const migration = await readFile(migrationPath, 'utf8');
  for (const row of sqlRows) {
    if (!migration.includes(`(${row},`)) mismatches.push(`${migrationPath}#${row.split(',')[0]}`);
  }
  if (!migration.includes(stateSqlCase)) mismatches.push(`${migrationPath}#billing-state-policy`);
  if (mismatches.length) {
    throw new Error(`GARAGE commercial contract drift: ${mismatches.join(', ')}`);
  }
} else {
  for (const [path, content] of Object.entries(expected)) await writeFile(path, content);
}
