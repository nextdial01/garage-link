import 'server-only';

export type TrustedSourceItemCost = { id: string; cost_price?: number | string | null };

/** Resolve a private cost snapshot only from the already store-scoped source rows. */
export function trustedSourceItemCost(sourceItemId: string | null, sourceItems: readonly TrustedSourceItemCost[]): number | null {
  if (!sourceItemId) return null;
  const source = sourceItems.find((item) => item.id === sourceItemId);
  if (!source) throw new Error('invalid_source_item');
  if (source.cost_price == null) return null;
  const cost = Number(source.cost_price);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('invalid_source_item_cost');
  return cost;
}
