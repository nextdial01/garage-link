import contract from '../../../../../packages/billing/contract/garage-commercial-contract.json';

export type OptionType = 'add_staff' | 'add_store' | 'add_storage';
export type OptionRequest = { type: OptionType; action: 'add' | 'remove'; amount: number; termsAccepted: true };
export const optionConfig = {
  add_staff: { env: 'STRIPE_PRICE_EXTRA_STAFF', price: 1100, field: 'extra_staff_count', unit: 1 },
  add_store: { env: 'STRIPE_PRICE_EXTRA_STORE', price: 5500, field: 'extra_store_count', unit: 1 },
  add_storage: { env: 'STRIPE_PRICE_EXTRA_STORAGE_10GB', price: 550, field: 'extra_storage_gb', unit: 10 },
} as const;
export function parseOptionRequest(value: unknown): OptionRequest {
  const body = value as Partial<OptionRequest> | null;
  if (!body || body.termsAccepted !== true || !Object.hasOwn(optionConfig, body.type ?? '')
    || !['add', 'remove'].includes(body.action ?? '') || !Number.isSafeInteger(body.amount)
    || Number(body.amount) <= 0 || Number(body.amount) > 10000) throw new Error('invalid_option_request');
  if (body.type === 'add_storage' && Number(body.amount) % 10 !== 0) throw new Error('invalid_storage_unit');
  return body as OptionRequest;
}
export function assertOptionPlan(plan: string, type: OptionType) {
  const plans = contract.plans;
  if (!Object.hasOwn(plans, plan) || plan === 'free') throw new Error('option_plan_forbidden');
  const selected = plans[plan as keyof typeof plans];
  const allowed = type === 'add_staff' ? selected.extraStaffPrice : type === 'add_store' ? selected.extraStorePrice : selected.extraStoragePricePer10Gb;
  if (allowed === null) throw new Error('option_plan_forbidden');
}
export function nextOptionQuantity(request: OptionRequest, current: number) {
  if (!Number.isSafeInteger(current) || current < 0) throw new Error('invalid_current_quantity');
  const next = current + (request.action === 'add' ? 1 : -1) * request.amount / optionConfig[request.type].unit;
  if (!Number.isSafeInteger(next) || next < 0 || next > 10000) throw new Error('invalid_target_quantity');
  return next;
}
export type OptionPrice = { id: string; livemode: boolean; active: boolean; currency: string; unit_amount: number | null; recurring: { interval: string; interval_count: number; usage_type?: string } | null; tax_behavior?: string | null };
export type OptionSubscription = { id: string; livemode: boolean; status: string; cancel_at_period_end: boolean; automatic_tax?: { enabled: boolean }; default_tax_rates?: unknown[] | null; customer: string | { id: string }; metadata: Record<string,string>; items: { data: Array<{ id: string; price: { id: string }; quantity?: number | null; tax_rates?: unknown[] | null }> } };
