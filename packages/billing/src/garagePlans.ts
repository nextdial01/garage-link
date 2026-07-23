export type GaragePlanCode = 'free' | 'starter' | 'standard' | 'pro';

export type GaragePlan = {
  code: GaragePlanCode;
  name: string;
  monthlyPrice: number;
  inventoryLimit: number;
  includedStaffCount: number;
  extraStaffPrice: number | null;
  includedStoreCount: number;
  extraStorePrice: number | null;
  storageLimitMb: number;
  extraStoragePricePer10Gb: number | null;
  quoteInvoiceLimit: number | null;
  lLinkIntegrationEnabled: boolean;
  chatSupportIncluded: boolean;
  individualSupportHourlyPrice: number;
};

export type GarageSubscriptionLike = {
  plan?: string | null;
  included_staff_count?: number | null;
  extra_staff_count?: number | null;
  included_store_count?: number | null;
  extra_store_count?: number | null;
  storage_limit_mb?: number | null;
  extra_storage_gb?: number | null;
  current_inventory_limit?: number | null;
  l_link_integration_enabled?: boolean | null;
};

export const GARAGE_PLANS: Record<GaragePlanCode, GaragePlan> = {
  free: {
    code: 'free',
    name: 'Free',
    monthlyPrice: 0,
    inventoryLimit: 5,
    includedStaffCount: 1,
    extraStaffPrice: null,
    includedStoreCount: 1,
    extraStorePrice: null,
    storageLimitMb: 500,
    extraStoragePricePer10Gb: null,
    quoteInvoiceLimit: 5,
    lLinkIntegrationEnabled: false,
    chatSupportIncluded: true,
    individualSupportHourlyPrice: 11000,
  },
  starter: {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 7480,
    inventoryLimit: 50,
    includedStaffCount: 1,
    extraStaffPrice: 1100,
    includedStoreCount: 1,
    extraStorePrice: null,
    storageLimitMb: 2048,
    extraStoragePricePer10Gb: 550,
    quoteInvoiceLimit: 20,
    lLinkIntegrationEnabled: false,
    chatSupportIncluded: true,
    individualSupportHourlyPrice: 11000,
  },
  standard: {
    code: 'standard',
    name: 'Standard',
    monthlyPrice: 16280,
    inventoryLimit: 200,
    includedStaffCount: 3,
    extraStaffPrice: 1100,
    includedStoreCount: 1,
    extraStorePrice: 5500,
    storageLimitMb: 10240,
    extraStoragePricePer10Gb: 550,
    quoteInvoiceLimit: null,
    lLinkIntegrationEnabled: true,
    chatSupportIncluded: true,
    individualSupportHourlyPrice: 11000,
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: 32780,
    inventoryLimit: 500,
    includedStaffCount: 10,
    extraStaffPrice: 1100,
    includedStoreCount: 3,
    extraStorePrice: 5500,
    storageLimitMb: 51200,
    extraStoragePricePer10Gb: 550,
    quoteInvoiceLimit: null,
    lLinkIntegrationEnabled: true,
    chatSupportIncluded: true,
    individualSupportHourlyPrice: 11000,
  },
};

export const GARAGE_PLAN_ORDER: GaragePlanCode[] = ['free', 'starter', 'standard', 'pro'];

export function normalizeGaragePlanCode(value: string | null | undefined): GaragePlanCode {
  if (value === 'starter' || value === 'standard' || value === 'pro') return value;
  return 'free';
}

export function getGaragePlan(value: string | null | undefined) {
  return GARAGE_PLANS[normalizeGaragePlanCode(value)];
}

function planCodeFromInput(value: string | GarageSubscriptionLike | null | undefined) {
  return typeof value === 'string' || value === null || value === undefined
    ? normalizeGaragePlanCode(value)
    : normalizeGaragePlanCode(value.plan);
}

export function getGaragePlanFromSubscription(subscription: GarageSubscriptionLike | null | undefined) {
  return getGaragePlan(subscription?.plan);
}

export function formatGarageYen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

export function formatStorage(mb: number) {
  if (mb >= 1024) {
    return `${Math.round(mb / 1024).toLocaleString('ja-JP')}GB`;
  }

  return `${mb.toLocaleString('ja-JP')}MB`;
}

export function canAddVehicle(subscription: GarageSubscriptionLike | null | undefined, currentInventoryCount: number) {
  const plan = getGaragePlanFromSubscription(subscription);
  const limit = subscription?.current_inventory_limit ?? plan.inventoryLimit;
  return {
    allowed: currentInventoryCount < limit,
    limit,
    currentCount: currentInventoryCount,
    remaining: Math.max(limit - currentInventoryCount, 0),
  };
}

export function canCreateDocument(subscription: GarageSubscriptionLike | null | undefined, monthlyDocumentCount: number) {
  const plan = getGaragePlanFromSubscription(subscription);
  const limit = plan.quoteInvoiceLimit;
  return {
    allowed: limit === null || monthlyDocumentCount < limit,
    limit,
    currentCount: monthlyDocumentCount,
    remaining: limit === null ? null : Math.max(limit - monthlyDocumentCount, 0),
  };
}

export function canAddStaff(value: string | GarageSubscriptionLike | null | undefined) {
  return planCodeFromInput(value) !== 'free';
}

export function canAddStore(value: string | GarageSubscriptionLike | null | undefined) {
  const plan = planCodeFromInput(value);
  return plan === 'standard' || plan === 'pro';
}

export function canAddStorage(value: string | GarageSubscriptionLike | null | undefined) {
  return planCodeFromInput(value) !== 'free';
}

export function canUseLLinkIntegration(subscription: GarageSubscriptionLike | null | undefined) {
  const plan = getGaragePlanFromSubscription(subscription);
  return Boolean(subscription?.l_link_integration_enabled ?? plan.lLinkIntegrationEnabled);
}

export function getStorageLimit(subscription: GarageSubscriptionLike | null | undefined) {
  const plan = getGaragePlanFromSubscription(subscription);
  return (subscription?.storage_limit_mb ?? plan.storageLimitMb) + (subscription?.extra_storage_gb ?? 0) * 1024;
}
