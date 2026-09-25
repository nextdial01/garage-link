const COST_KEYS = ['labor_amount','parts_amount','inspection_amount','legal_fee_amount','additional_amount'] as const;

export function maintenanceEstimate(row: Record<string, number | null | undefined>): number | null {
  const subtotal = COST_KEYS.reduce((sum, key) => sum + (row[key] ?? 0), 0);
  const discount = row.discount_amount ?? 0;
  const total = subtotal - discount;
  return Number.isSafeInteger(total) && total >= 0 && total <= 100_000_000 ? total : null;
}
