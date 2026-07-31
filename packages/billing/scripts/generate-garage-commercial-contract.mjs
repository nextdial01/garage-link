import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = resolve(root, 'contract/garage-commercial-contract.json');
const outputs = {
  ts: resolve(root, 'src/garagePlans.generated.ts'),
  sql: resolve(root, '../../apps/garage-link/supabase/tests/garage-plan-entitlements.generated.sql'),
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
  + `export const GARAGE_ADDON_CONTRACT_DATA = ${JSON.stringify(contract.addons, null, 2)} as const;\n`;
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

const expected = { [outputs.ts]: ts, [outputs.sql]: sql, [outputs.csv]: csv };
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
  if (mismatches.length) {
    throw new Error(`GARAGE commercial contract drift: ${mismatches.join(', ')}`);
  }
} else {
  for (const [path, content] of Object.entries(expected)) await writeFile(path, content);
}
