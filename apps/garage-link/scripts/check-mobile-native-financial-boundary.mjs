import { readFile } from 'node:fs/promises';

const dto = await readFile(new URL('../src/lib/mobile/dto.ts', import.meta.url), 'utf8');
const forbidden = ['purchase_price', 'cost_price', 'expected_profit', 'gross_profit', 'profit_rate', 'inventory_total_cost', 'expected_gross_profit', 'realized_gross_profit_this_month', 'management_target_gross_profit_yen', 'monthly_sales', 'store_sales', 'internal_memo', 'internal_note', 'work_memo'];
for (const field of forbidden) if (!dto.includes(`'${field}'`)) throw new Error(`forbidden mobile field registry is missing ${field}`);
for (const selected of ['MOBILE_VEHICLE_FIELDS', 'MOBILE_CUSTOMER_FIELDS', 'MOBILE_QUOTE_FIELDS', 'MOBILE_QUOTE_ITEM_FIELDS']) {
  const match = dto.match(new RegExp(`export const ${selected} = '([^']*)'`));
  if (!match) throw new Error(`missing ${selected}`);
  for (const field of forbidden) if (match[1].split(', ').includes(field)) throw new Error(`${selected} exposes ${field}`);
}
console.log('PASS mobile native financial response boundary');
