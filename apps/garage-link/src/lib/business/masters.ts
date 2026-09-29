export const MASTER_KINDS = {
  vehicle_maker: '車両メーカー', part_category: '部品カテゴリー',
  work_category: '作業分類', unit: '単位', reception_route: '受付経路', part_supplier: '部品仕入先',
} as const;
export type MasterKind = keyof typeof MASTER_KINDS;
export type MasterEntry = { id: string; store_id: string; kind: MasterKind; label: string; is_active: boolean; sort_order: number };

/** Retain the exact historical string even after rename/disable. */
export function masterOptions(entries: readonly MasterEntry[], kind: MasterKind, current = '') {
  const active = entries.filter((entry) => entry.kind === kind && entry.is_active).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'ja'));
  const options = active.map((entry) => ({ value: entry.label, label: entry.label }));
  if (current && !options.some((entry) => entry.value === current)) options.unshift({ value: current, label: `${current}（既存値）` });
  return options;
}
