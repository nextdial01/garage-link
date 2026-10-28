export const NOTICE_TYPES = ['deal_notice', 'quote_notice', 'invoice_notice', 'price_reduction', 'repurchase'] as const;
export type NoticeType = typeof NOTICE_TYPES[number];
export const NOTICE_LABELS: Record<NoticeType, string> = { deal_notice: '商談案内', quote_notice: '見積案内', invoice_notice: '請求案内', price_reduction: '値下げ案内', repurchase: '買替提案' };
export const MERGE_FIELDS = ['customer_name', 'vehicle_name', 'inspection_expiry_date', 'old_price', 'new_price', 'deal_title', 'document_url', 'document_number', 'total_amount', 'store_name'] as const;
export type MergeField = typeof MERGE_FIELDS[number];
export const DEFAULT_TEMPLATES: Record<NoticeType, string> = {
 deal_notice: '{{customer_name}}様\n{{deal_title}}についてご案内します。',
 quote_notice: '{{customer_name}}様\nお見積書をご確認ください。\n{{document_url}}',
 invoice_notice: '{{customer_name}}様\nご請求書をご確認ください。\n{{document_url}}',
 price_reduction: '{{customer_name}}様\n{{vehicle_name}}の販売価格が{{old_price}}から{{new_price}}に変更されました。',
 repurchase: '{{customer_name}}様\n{{vehicle_name}}の車検満了日（{{inspection_expiry_date}}）が近づいています。お買替えのご相談を承ります。',
};

export const NOTICE_MERGE_FIELDS: Record<NoticeType, readonly MergeField[]> = {
 deal_notice: ['customer_name','vehicle_name','deal_title','store_name'],
 quote_notice: ['customer_name','vehicle_name','deal_title','document_url','document_number','total_amount','store_name'],
 invoice_notice: ['customer_name','vehicle_name','deal_title','document_url','document_number','total_amount','store_name'],
 price_reduction: ['customer_name','vehicle_name','old_price','new_price','inspection_expiry_date','store_name'],
 repurchase: ['customer_name','vehicle_name','inspection_expiry_date','store_name'],
};
export function validNoticeTemplate(type: NoticeType, value: unknown): value is string {
 if (!validTemplate(value)) return false;
 return [...value.matchAll(/\{\{([a-z_]+)\}\}/g)].every(match => (NOTICE_MERGE_FIELDS[type] as readonly string[]).includes(match[1]));
}

export type NoticeSettings = { repurchase_enabled: boolean; repurchase_before_months: number; templates: Record<NoticeType, string>; updated_at: string | null };
export function defaultNoticeSettings(): NoticeSettings { return { repurchase_enabled: false, repurchase_before_months: 3, templates: { ...DEFAULT_TEMPLATES }, updated_at: null }; }
export function validTemplate(value: unknown): value is string {
 if (typeof value !== 'string' || !value.trim() || value.length > 4000) return false;
 const rest = value.replace(/\{\{([a-z_]+)\}\}/g, (_, field: string) => (MERGE_FIELDS as readonly string[]).includes(field) ? '' : '{');
 return !/[{}]/.test(rest);
}
export function validateNoticeSettings(value: unknown): value is NoticeSettings {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const v = value as Record<string, unknown>;
 if (Object.keys(v).sort().join(',') !== 'repurchase_before_months,repurchase_enabled,templates,updated_at') return false;
 if (typeof v.repurchase_enabled !== 'boolean' || !Number.isInteger(v.repurchase_before_months) || (v.repurchase_before_months as number) < 0 || (v.repurchase_before_months as number) > 60) return false;
 if (v.updated_at !== null && (typeof v.updated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v.updated_at) || !Number.isFinite(Date.parse(v.updated_at)))) return false;
 if (!v.templates || typeof v.templates !== 'object' || Array.isArray(v.templates) || Object.keys(v.templates).sort().join(',') !== [...NOTICE_TYPES].sort().join(',')) return false;
 return NOTICE_TYPES.every(type => validNoticeTemplate(type, (v.templates as Record<string, unknown>)[type]));
}
export function renderNoticeTemplate(template: string, values: Partial<Record<MergeField, string>>): string {
 if (!validTemplate(template)) throw new Error('案内テンプレートが不正です。');
 const result = template.replace(/\{\{([a-z_]+)\}\}/g, (_, field: MergeField) => {
  const value = values[field];
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new Error('案内に必要な情報が不足しています。');
  return value;
 });
 if (result.length > 5000) throw new Error('案内本文が長すぎます。');
 return result;
}
export function subtractCalendarMonths(isoDate: string, months: number): string {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(months) || months < 0 || months > 60) throw new Error('日付または月数が不正です。');
 const [year, month, day] = isoDate.split('-').map(Number);
 const date = new Date(isoDate + 'T00:00:00Z');
 if (year < 100 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) throw new Error('日付が不正です。');
 const index = year * 12 + month - 1 - months, targetYear = Math.floor(index / 12), targetMonth = index % 12;
 if (targetYear < 100) throw new Error('日付が範囲外です。');
 const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
 return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
