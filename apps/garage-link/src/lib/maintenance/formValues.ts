// Keep the stored labels unchanged, including labels used by older records.
export const MAINTENANCE_JOB_TYPES = [
  '車検', '法定点検', '一般整備', '修理', 'カスタム', 'オイル交換', 'その他', '点検', '整備',
] as const;

export function maintenanceJobTypes(current: string): readonly string[] {
  return current && !MAINTENANCE_JOB_TYPES.some((value) => value === current)
    ? [...MAINTENANCE_JOB_TYPES, current]
    : MAINTENANCE_JOB_TYPES;
}

// No detail rows means a manually entered amount is authoritative. Reading an
// empty detail list must not silently replace that amount with a computed zero.
export function loadedPartsTotal(rows: readonly { subtotal_amount: number }[]): number | null {
  return rows.length ? rows.reduce((sum, row) => sum + row.subtotal_amount, 0) : null;
}

// Document creation prefers actual part rows. Without rows, carry the saved
// manual cost once; never add it on top of the detail subtotal.
export function manualPartsDocumentLine(amount: number | null, detailCount: number) {
  if (detailCount || amount === null || amount <= 0) return null;
  return {
    localId: 'maintenance-manual-parts', part_id: null, part_no: '', name: '部品代',
    quantity: '1', unit_price: String(amount), cost_price: '', tax_rate: '0.1',
  };
}
