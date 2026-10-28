/** Public, captured-at-handoff document content. No source reads or tax/total calculations. */
export type GarageDocumentSnapshot = {
  kind: 'quote' | 'invoice'; title: string; documentNumber: string; issuedAtLabel: string;
  dueAtLabel?: string; issuerLines: string[]; recipientLines: string[];
  items: { description: string; quantityLabel: string; unitPriceLabel: string; lineTotalLabel: string }[];
  summary: { label: string; value: string }[]; notes?: string[]; paymentLines?: string[];
};

const forbiddenControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
function invalid(field: string): never {
  throw new Error(`書類の公開用データを確認してください（${field}）。内容は省略せず、案内を停止しました。`);
}
function text(value: unknown, field: string): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 4000 || forbiddenControls.test(value)) invalid(field);
  return value;
}
function requiredText(value: unknown, field: string): string {
  const result = text(value, field);
  if (!result.trim()) invalid(field);
  return result;
}
function firstText(primary: unknown, fallback: unknown, field: string): string {
  const stored = text(primary, field);
  return stored.trim() ? stored : text(fallback, field);
}
function checkedLines(lines: string[], max: number, field: string): string[] {
  if (lines.length > max) invalid(field);
  return lines.map(line => text(line, field));
}
// Group the saved decimal representation; do not round or derive financial values.
function decimal(value: unknown, field: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') invalid(field);
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) invalid(field);
  const result = String(value);
  if (result.length > 80 || !/^-?\d+(?:\.\d+)?$/.test(result)) invalid(field);
  return result;
}
function money(value: unknown, field: string, deduction = false): string {
  if (value == null) return '-';
  const saved = decimal(value, field);
  const negative = saved.startsWith('-');
  const unsigned = negative ? saved.slice(1) : saved;
  const zero = /^0+(?:\.0+)?$/.test(unsigned);
  const [integer, fraction] = unsigned.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : `.${fraction}`);
  return `${!zero && (deduction ? !negative : negative) ? '-' : ''}${grouped}円`;
}
function scalar(value: unknown, field: string): string {
  if (value == null) return '';
  return typeof value === 'number' ? decimal(value, field) : text(value, field);
}
function add(lines: string[], label: string, value: unknown): void {
  const rendered = text(value, label);
  if (rendered.trim()) lines.push(`${label}${rendered}`);
}
function memoValue(memo: unknown, label: string): unknown {
  if (memo == null || memo === '') return undefined;
  if (typeof memo !== 'string') invalid('内部メモ形式');
  const prefix = `${label}: `;
  const lines = memo.split('\n').filter(line => line.startsWith(prefix));
  if (lines.length > 1) invalid(label);
  if (!lines.length) return undefined;
  try { return JSON.parse(lines[0].slice(prefix.length)); } catch { return invalid(label); }
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}
function paymentBreakdown(memo: unknown): string[] {
  const parsed = memoValue(memo, '支払方法内訳');
  if (parsed === undefined) return [];
  if (!Array.isArray(parsed) || parsed.length > 100) invalid('支払方法内訳');
  return parsed.flatMap(value => {
    const item = object(value, '支払方法内訳');
    // Copy only these public fields. Other memo lines/keys never reach the DTO.
    const method = text(item.method, '支払方法');
    const date = text(item.scheduledDate, '支払予定日');
    const note = text(item.note, '支払備考');
    const hasAmount = item.amount !== undefined && item.amount !== null && item.amount !== '';
    if (!method && !date && !note && !hasAmount) return [];
    return [[method || '-', hasAmount ? money(item.amount, '支払内訳金額') : '-', date, note].filter(Boolean).join(' / ')];
  });
}
function tradeInLines(memo: unknown): string[] {
  const parsed = memoValue(memo, '下取り情報');
  if (parsed === undefined) return [];
  const item = object(parsed, '下取り情報');
  const lines: string[] = [];
  const vehicle = [text(item.maker, '下取りメーカー'), text(item.modelName, '下取り車種')].filter(Boolean).join(' ');
  add(lines, '下取り車両: ', vehicle);
  add(lines, '下取り年式: ', scalar(item.modelYear, '下取り年式'));
  if (item.mileageKm != null && item.mileageKm !== '') add(lines, '下取り走行距離: ', `${decimal(item.mileageKm, '下取り走行距離')}km`);
  add(lines, '下取り車台番号: ', item.vin);
  if (item.appraisalAmount != null && item.appraisalAmount !== '') add(lines, '下取り査定額: ', money(item.appraisalAmount, '下取り査定額'));
  if (item.tradeInAmount != null && item.tradeInAmount !== '') add(lines, '下取り充当額: ', money(item.tradeInAmount, '下取り充当額'));
  // enabled, grade, memo, costs and every other key are deliberately not copied.
  return lines;
}

export function buildGarageDocumentSnapshot(
  kind: 'quote_notice' | 'invoice_notice', doc: Record<string, unknown>,
  items: Record<string, unknown>[], store: Record<string, unknown>,
  vehicle: Record<string, unknown> | null, customer: Record<string, unknown>,
): GarageDocumentSnapshot {
  if (kind !== 'quote_notice' && kind !== 'invoice_notice') invalid('書類種別');
  object(doc, '書類'); object(store, '発行者'); object(customer, '宛先');
  if (vehicle !== null) object(vehicle, '車両');
  const quote = kind === 'quote_notice';
  if (!Array.isArray(items) || !items.length || items.length > 1000) invalid('明細件数');
  const issuerLines = [requiredText(firstText(store.company_name, store.name, '発行者'), '発行者')];
  add(issuerLines, '〒', store.postal_code);
  add(issuerLines, '', store.address); add(issuerLines, '', store.building);
  add(issuerLines, '代表者: ', store.representative_name);
  add(issuerLines, '登録番号: ', store.invoice_registration_number);
  add(issuerLines, '電話: ', store.phone); add(issuerLines, 'FAX: ', store.fax); add(issuerLines, 'メール: ', store.email);
  const name = requiredText(firstText(doc.customer_name, customer.name, '宛先名'), '宛先名');
  const honorific = firstText(doc.customer_honorific,
    customer.customer_type === '法人' || customer.customer_type === 'corporate' ? '御中' : '様', '敬称');
  const recipientLines = [`${name} ${honorific}`];
  add(recipientLines, '住所: ', firstText(doc.customer_address, customer.address, '宛先住所'));
  add(recipientLines, '電話: ', firstText(doc.customer_phone, customer.phone, '宛先電話'));
  if (quote) add(recipientLines, 'メール: ', firstText(doc.customer_email, customer.email, '宛先メール'));

  const notes: string[] = [];
  if (quote) add(notes, '件名: ', doc.title);
  const context = vehicle ?? {};
  add(notes, '管理番号: ', context.management_no);
  add(notes, 'メーカー: ', firstText(doc.vehicle_maker, context.maker, 'メーカー'));
  add(notes, '車種名: ', firstText(doc.vehicle_model_name, firstText(doc.vehicle_label, context.model_name, '車種名'), '車種名'));
  if (quote) add(notes, 'グレード: ', context.grade);
  add(notes, '年式: ', scalar(doc.vehicle_year ?? context.model_year, '年式'));
  if ((doc.vehicle_mileage_km ?? context.mileage_km) != null) add(notes, '走行距離: ', `${decimal(doc.vehicle_mileage_km ?? context.mileage_km, '走行距離')}km`);
  add(notes, '登録番号: ', context.registration_no);
  add(notes, '車台番号: ', firstText(doc.vehicle_vin, context.vin, '車台番号'));
  if (quote) add(notes, '車検満了日: ', firstText(doc.vehicle_inspection_expiry_date, context.inspection_expiry_date, '車検満了日'));
  add(notes, '', doc.customer_note);
  add(notes, '', quote ? store.quote_note : store.invoice_note);
  if (quote) notes.push(...tradeInLines(doc.internal_memo));
  add(notes, '', store.document_footer_text);

  const paymentLines: string[] = [];
  // Normal quotes show the payment breakdown, but only invoices display bank details.
  if (!quote) {
    const bank = [text(store.bank_name, '銀行名'), text(store.bank_branch_name, '支店名')].filter(Boolean).join(' ');
    const account = [text(store.bank_account_type, '口座種別'), text(store.bank_account_number, '口座番号')].filter(Boolean).join(' ');
    add(paymentLines, '振込先: ', bank); add(paymentLines, '', account); add(paymentLines, '口座名義: ', store.bank_account_holder);
  }
  const breakdown = paymentBreakdown(doc.internal_memo);
  if (breakdown.length) paymentLines.push('支払方法内訳', ...breakdown);

  const mode = doc.tax_display_mode;
  if (mode != null && mode !== 'included' && mode !== 'excluded') invalid('税表示方式');
  const mappedItems = items.map(item => {
    object(item, '明細');
    const description = [requiredText(item.name, '明細名')];
    add(description, '', quote ? firstText(item.note, item.description, '明細内容') : item.note);
    if (item.tax_category != null && !['taxable', 'exempt', 'out_of_scope'].includes(String(item.tax_category))) invalid('税区分');
    const rate = item.tax_rate == null ? null : Number(decimal(item.tax_rate, '税率'));
    if (rate !== null && (rate < 0 || rate > 1)) invalid('税率');
    const tax = item.tax_category === 'exempt' ? '非課税' : item.tax_category === 'out_of_scope' ? '税対象外'
      : rate !== null ? `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 12 }).format(rate * 100)}%` : '旧帳票';
    description.push(`税区分: ${tax}`, mode == null ? '単価・金額（保存時）' : `単価（${mode === 'included' ? '税込' : '税抜'}）／金額（税抜・税対象外）`);
    if (item.line_discount_input_amount != null) add(description, '行値引: ', money(item.line_discount_input_amount, '行値引'));
    return {
      description: requiredText(description.join('\n'), '明細内容'),
      quantityLabel: requiredText([decimal(item.quantity, '数量'), text(item.unit, '単位')].filter(Boolean).join(' '), '数量'),
      unitPriceLabel: money(item.unit_price, '単価'), lineTotalLabel: money(item.amount, '明細金額'),
    };
  });
  // A missing saved financial value remains visibly absent; never manufacture total-minus-paid or tax math.
  const summary = [
    { label: '小計', value: money(doc.subtotal_amount, '小計') },
    ...(quote ? [{ label: '消費税', value: money(doc.tax_amount, '消費税') }] : []),
    { label: '値引き', value: money(doc.discount_amount, '値引き', true) },
    ...(!quote ? [{ label: '消費税', value: money(doc.tax_amount, '消費税') }] : []),
    { label: '下取り充当', value: money(doc.trade_in_amount, '下取り充当', true) },
    { label: quote ? '見積合計' : '請求合計', value: money(doc.total_amount, '合計') },
    ...(!quote ? [{ label: '入金済', value: money(doc.paid_amount, '入金済') }, { label: '未入金', value: money(doc.unpaid_amount, '未入金') }] : []),
  ];
  const due = text(quote ? doc.expiry_date : doc.payment_due_date, '期限');
  return {
    kind: quote ? 'quote' : 'invoice', title: quote ? '御見積書' : '御請求書',
    documentNumber: requiredText(quote ? doc.quote_no : doc.invoice_no, '書類番号'),
    issuedAtLabel: requiredText(doc.issue_date, '発行日'), ...(due ? { dueAtLabel: due } : {}),
    issuerLines: checkedLines(issuerLines, 30, '発行者情報'), recipientLines: checkedLines(recipientLines, 30, '宛先情報'),
    items: mappedItems, summary, notes: checkedLines(notes, 100, '備考'), paymentLines: checkedLines(paymentLines, 100, '支払情報'),
  };
}
