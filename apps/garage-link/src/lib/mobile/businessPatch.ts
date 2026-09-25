import { normalizedWorkDetails, legacyWorkDetails, maintenanceTotals, type WorkDetail } from '@/lib/business/workDetails';
import { calculateLine, type MoneyLine } from '@/lib/business/money';
import { validateCustomer } from '@/lib/business/customer';

export function validateMobileCustomer(row: Record<string, unknown>) {
  validateCustomer({ name: String(row.name ?? ''), birth_date: String(row.birth_date ?? '') });
}
export function maintenanceBusinessPatch(row: Record<string, unknown>, storeMode: unknown, workDetailsProvided = row.work_details_version == null && Array.isArray(row.work_details), partLines?: readonly MoneyLine[]) {
  const mode = row.tax_display_mode === 'excluded' ? 'excluded' : row.tax_display_mode === 'included' ? 'included' : storeMode === 'excluded' ? 'excluded' : 'included';
  const rows = normalizedWorkDetails((workDetailsProvided || row.work_details_version === 1) && Array.isArray(row.work_details) ? row.work_details as WorkDetail[] : legacyWorkDetails(Array.isArray(row.work_items) ? row.work_items as string[] : [], Number(row.labor_amount || 0)));
  const totals = maintenanceTotals(rows, mode, Number(row.parts_amount || 0), Number(row.inspection_amount || 0), Number(row.legal_fee_amount || 0), Number(row.additional_amount || 0), Number(row.discount_amount || 0), partLines);
  return { ...(partLines?.length ? { parts_amount: partLines.reduce((sum,line) => sum + calculateLine(line,mode).input_amount,0) } : {}), work_details: rows.map((item) => ({ ...item, ...calculateLine(item, mode) })), work_items: rows.map((item) => item.description), work_details_version: 1, tax_display_mode: mode, discount_input_amount: totals.discount_input_amount, labor_amount: rows.reduce((sum,item) => sum + calculateLine(item, mode).input_amount,0), estimated_total_amount: totals.total_amount, billing_amount: totals.total_amount };
}

/** Stored part subtotals already include per-part discounts in the job mode. */
export function maintenancePartLines(rows: readonly { subtotal_amount: number | string; tax_rate: number | string | null }[]): MoneyLine[] {
  return rows.map((row) => ({ quantity: 1, unit_price: row.subtotal_amount, tax_rate: row.tax_rate ?? 0.1 }));
}
