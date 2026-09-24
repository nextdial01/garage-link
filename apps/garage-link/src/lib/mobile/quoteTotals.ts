export type MobileQuoteLine = { item_type: string; amount: number; tax_amount: number };

const MAX_DB_INTEGER = 2_147_483_647;

export function mobileQuoteTotals(lines: MobileQuoteLine[]) {
  const subtotalAmount = lines.filter((line) => line.item_type !== 'discount' && line.item_type !== 'trade_in').reduce((sum, line) => sum + line.amount, 0);
  const taxAmount = lines.reduce((sum, line) => sum + line.tax_amount, 0);
  const discountAmount = -lines.filter((line) => line.item_type === 'discount').reduce((sum, line) => sum + line.amount, 0);
  const tradeInAmount = -lines.filter((line) => line.item_type === 'trade_in').reduce((sum, line) => sum + line.amount, 0);
  const totalAmount = subtotalAmount + taxAmount - discountAmount - tradeInAmount;
  if (![subtotalAmount, taxAmount, discountAmount, tradeInAmount, totalAmount].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_DB_INTEGER) || totalAmount > 100_000_000) return null;
  return { subtotalAmount, taxAmount, discountAmount, tradeInAmount, totalAmount };
}
