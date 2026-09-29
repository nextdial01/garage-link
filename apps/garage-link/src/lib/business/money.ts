/** Yen rounding is half-up, once per line. Quantities retain three decimals. */
export type TaxDisplayMode = 'included' | 'excluded';
export type TaxCategory = 'taxable' | 'exempt' | 'out_of_scope';
export type MoneyLine = {
  quantity: number | string;
  unit_price: number | string;
  tax_rate?: number | string;
  tax_category?: TaxCategory;
  line_discount_input_amount?: number | string;
};

const LIMIT = 100_000_000;
export function decimal(value: number | string, places = 3): number {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('数量・金額は0以上の数値で入力してください。');
  const result = Number(text);
  if (!Number.isFinite(result) || result > LIMIT || (text.split('.')[1]?.length ?? 0) > places) {
    throw new Error(`小数点以下${places}桁以内の数値を入力してください。`);
  }
  return result;
}

function scaled(value: number | string, places: number): bigint {
  decimal(value, places);
  const [whole, fraction = ''] = String(value).trim().split('.');
  return BigInt(whole) * BigInt(10) ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
}
function rounded(numerator: bigint, denominator: bigint): number {
  return Number((numerator + denominator / BigInt(2)) / denominator);
}

export function calculateLine(line: MoneyLine, mode: TaxDisplayMode) {
  const quantity = decimal(line.quantity);
  const unitPrice = decimal(line.unit_price, 4);
  const beforeDiscount = rounded(scaled(line.quantity, 3) * scaled(line.unit_price, 4), BigInt(10_000_000));
  const lineDiscount = decimal(line.line_discount_input_amount ?? 0, 0);
  if (lineDiscount > beforeDiscount) throw new Error('明細値引きは明細金額以下で入力してください。');
  const inputAmount = beforeDiscount - lineDiscount;
  const rate = decimal(line.tax_rate ?? 0.1, 4);
  if (rate > 1) throw new Error('税率が正しくありません。');
  const taxable = (line.tax_category ?? 'taxable') === 'taxable';
  const rateUnits = taxable ? scaled(rate, 4) : BigInt(0);
  const tax = rounded(BigInt(inputAmount) * rateUnits, mode === 'included' ? BigInt(10_000) + rateUnits : BigInt(10_000));
  const net = mode === 'included' ? inputAmount - tax : inputAmount;
  const gross = mode === 'included' ? inputAmount : inputAmount + tax;
  if (gross > LIMIT) throw new Error('明細金額が上限を超えています。');
  return { line_discount_input_amount: lineDiscount, quantity, unit_price: unitPrice, tax_rate: taxable ? rate : 0, tax_category: line.tax_category ?? 'taxable', input_amount: inputAmount, amount: net, tax_amount: tax, gross_amount: gross };
}

/** Discounts are entered in the document's mode and allocated before tax.
 * Trade-in and recorded payments are final yen deductions, never taxed again.
 * Persist discount_input_amount as well as the net discount_amount so reopening
 * an inclusive document never changes the user's entered discount.
 */
export function calculateDocument(lines: readonly MoneyLine[], mode: TaxDisplayMode, options: { discount?: number | string; tradeIn?: number | string; paid?: number | string } = {}) {
  const calculated = lines.map((line) => calculateLine(line, mode));
  const discountInput = decimal(options.discount ?? 0, 0);
  const basis = calculated.reduce((sum, line) => sum + line.input_amount, 0);
  if (discountInput > basis) throw new Error('値引きは小計以下で入力してください。');
  let allocated = 0;
  let cumulativeBasis = 0;
  const adjusted = calculated.map((line) => {
    cumulativeBasis += line.input_amount;
    const cumulativeDiscount = basis ? Number(BigInt(discountInput) * BigInt(cumulativeBasis) / BigInt(basis)) : 0;
    const portion = cumulativeDiscount - allocated;
    allocated += portion;
    const after = calculateLine({ quantity: 1, unit_price: line.input_amount - portion, tax_rate: line.tax_rate, tax_category: line.tax_category }, mode);
    return { ...line, discounted_tax_amount: after.tax_amount, net_discount: line.amount - after.amount };
  });
  const subtotal = adjusted.reduce((sum, line) => sum + line.amount, 0);
  const discount = adjusted.reduce((sum, line) => sum + line.net_discount, 0);
  const tax = adjusted.reduce((sum, line) => sum + line.discounted_tax_amount, 0);
  const tradeIn = decimal(options.tradeIn ?? 0, 0);
  const paid = decimal(options.paid ?? 0, 0);
  const total = subtotal - discount + tax - tradeIn;
  if (total < 0 || total > LIMIT || paid > total) throw new Error('合計・支払済額を確認してください。');
  return { lines: adjusted, tax_display_mode: mode, subtotal_amount: subtotal, tax_amount: tax, discount_amount: discount, discount_input_amount: discountInput, trade_in_amount: tradeIn, total_amount: total, paid_amount: paid, unpaid_amount: total - paid };
}

export function priceLabel(label: string, mode: TaxDisplayMode, category: TaxCategory = 'taxable') {
  return `${label}（${category === 'exempt' ? '非課税' : category === 'out_of_scope' ? '税対象外' : mode === 'included' ? '税込' : '税抜'}）`;
}

/** Product prices keep the pre-existing inclusive storage convention.
 * Display conversions must never rewrite an unchanged stored amount.
 */
export function storedPriceToDisplay(value: number | string, mode: TaxDisplayMode, rate = 0.1): number {
  const amount = decimal(value, 4);
  return mode === 'included' ? amount : Math.round(amount / (1 + rate) * 10000) / 10000;
}
export function displayPriceToStored(value: number | string, mode: TaxDisplayMode, rate = 0.1): number {
  const amount = decimal(value, 4);
  return mode === 'included' ? amount : Math.round(amount * (1 + rate) * 10000) / 10000;
}
