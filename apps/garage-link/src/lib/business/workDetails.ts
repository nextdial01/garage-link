import { calculateDocument, decimal, type TaxCategory, type TaxDisplayMode, type MoneyLine } from './money';

export type WorkDetail = { description: string; category: string; quantity: number | string; unit: string; unit_price: number | string; tax_rate: number | string; tax_category: TaxCategory; note: string };
export const emptyWorkDetail = (): WorkDetail => ({ description: '', category: '', quantity: '1', unit: '', unit_price: '0', tax_rate: '0.1', tax_category: 'taxable', note: '' });

export function normalizedWorkDetails(rows: readonly WorkDetail[]) {
  return rows.filter((row) => row.description.trim()).map((row) => {
    const quantity = decimal(row.quantity);
    if (!quantity) throw new Error('作業の数量は0より大きい値を入力してください。');
    return { ...row, description: row.description.trim(), quantity, unit_price: decimal(row.unit_price, 4), tax_rate: decimal(row.tax_rate, 4) };
  });
}

export function legacyWorkDetails(items: string[] | null, laborAmount: number | null): WorkDetail[] {
  const rows = (items ?? []).map((description) => ({ ...emptyWorkDetail(), description }));
  if (laborAmount) rows.push({ ...emptyWorkDetail(), description: '工賃（既存合計）', unit_price: laborAmount });
  return rows;
}

export function maintenanceTotals(rows: readonly WorkDetail[], mode: TaxDisplayMode, parts: number, inspection: number, legal: number, extra: number, discount: number, partLines?: readonly MoneyLine[]) {
  const work = normalizedWorkDetails(rows);
  return calculateDocument([...work,
    ...(partLines?.length ? partLines : [{ quantity: 1, unit_price: parts }]), { quantity: 1, unit_price: inspection },
    { quantity: 1, unit_price: legal, tax_category: 'out_of_scope' }, { quantity: 1, unit_price: extra },
  ], mode, { discount });
}
