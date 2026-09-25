export type CostParts = {
  purchase_price: number | null;
  direct_cost_special: number | null;
  direct_cost_accessories: number | null;
  direct_cost_agency: number | null;
  direct_cost_legal: number | null;
  direct_cost_other: number | null;
  direct_cost_repair: number | null;
  listing_price: number | null;
  market_value: number | null;
  purchase_date: string | null;
  created_at: string;
};

const asMoney = (value: number | null) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
export function vehicleCost(row: CostParts, now = new Date()) {
  const totalCost = asMoney(row.purchase_price) + asMoney(row.direct_cost_special)
    + asMoney(row.direct_cost_accessories) + asMoney(row.direct_cost_agency)
    + asMoney(row.direct_cost_legal) + asMoney(row.direct_cost_other)
    + asMoney(row.direct_cost_repair);
  const price = asMoney(row.market_value ?? row.listing_price);
  const expectedProfit = price - totalCost;
  const purchaseDay = row.purchase_date ?? row.created_at.slice(0, 10);
  const currentDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const daysInStock = Math.max(0, Math.floor((Date.parse(`${currentDay}T00:00:00Z`) - Date.parse(`${purchaseDay}T00:00:00Z`)) / 86_400_000));
  return { totalCost, expectedProfit, profitRate: price > 0 ? expectedProfit / price : null, daysInStock };
}
