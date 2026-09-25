export const PURCHASE_FIELDS = 'id, store_id, inspection_expiry_date, liability_insurance_expiry_date, vin, management_no, maker, model_name, status, purchase_supplier_name, purchase_supplier_type, purchase_date, purchase_price, direct_cost_special, direct_cost_accessories, direct_cost_agency, direct_cost_legal, direct_cost_other, direct_cost_repair, listing_price, sale_price, sold_date, market_value, created_at, updated_at';
export const SUPPLIER_TYPES = ['オークション','業者','買取','下取','個人','その他'] as const;
export const COST_KEYS = ['direct_cost_special','direct_cost_accessories','direct_cost_agency','direct_cost_legal','direct_cost_other','direct_cost_repair'] as const;
export const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && /^\d+(?:\.\d{1,4})?$/.test(String(value)) && value >= 0 && value <= 100_000_000 ? value : null;
export const cleanText = (value: unknown, max = 160) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
export const cleanDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
