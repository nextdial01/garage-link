import {
  GARAGE_PLANS,
  canAddVehicle,
  canCreateDocument,
  type GarageSubscriptionLike,
} from '@/lib/billing/garagePlans';
import type { createClient } from '@/lib/supabase/client';

type SupabaseClient = ReturnType<typeof createClient>;

export type CompanySubscriptionRow = GarageSubscriptionLike & {
  id?: string;
  company_id: string;
  plan: string;
  status: string;
  included_staff_count: number;
  extra_staff_count: number;
  included_store_count: number;
  extra_store_count: number;
  storage_limit_mb: number;
  extra_storage_gb: number;
  current_inventory_limit: number;
  l_link_integration_enabled: boolean;
  started_at?: string | null;
  updated_at?: string | null;
};

type VehicleLimitRow = {
  status: string | null;
  deleted_at?: string | null;
  is_archived?: boolean | null;
};

type DocumentCountRow = {
  id: string;
  created_at: string | null;
};

export const VEHICLE_LIMIT_MESSAGE =
  '現在のプランでは登録できる在庫台数の上限に達しています。プラン変更をご検討ください。';

export const DOCUMENT_LIMIT_MESSAGE =
  '現在のプランでは今月作成できる見積・請求件数の上限に達しています。プラン変更をご検討ください。';

export function createDefaultFreeSubscription(companyId: string): CompanySubscriptionRow {
  const plan = GARAGE_PLANS.free;

  return {
    company_id: companyId,
    plan: plan.code,
    status: 'active',
    included_staff_count: plan.includedStaffCount,
    extra_staff_count: 0,
    included_store_count: plan.includedStoreCount,
    extra_store_count: 0,
    storage_limit_mb: plan.storageLimitMb,
    extra_storage_gb: 0,
    current_inventory_limit: plan.inventoryLimit,
    l_link_integration_enabled: plan.lLinkIntegrationEnabled,
    started_at: null,
    updated_at: null,
  };
}

export async function getActiveCompanySubscription(
  supabase: SupabaseClient,
  companyId: string,
  options: { ensure?: boolean } = {}
) {
  const selectColumns =
    'id, company_id, plan, status, included_staff_count, extra_staff_count, included_store_count, extra_store_count, storage_limit_mb, extra_storage_gb, current_inventory_limit, l_link_integration_enabled, started_at, updated_at';

  const { data, error } = await supabase
    .from<CompanySubscriptionRow>('company_subscriptions')
    .select(selectColumns)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .single();

  if (data) {
    return data;
  }

  const fallback = createDefaultFreeSubscription(companyId);

  if (!options.ensure) {
    return fallback;
  }

  const { data: inserted, error: insertError } = await supabase
    .from<CompanySubscriptionRow>('company_subscriptions')
    .insert(fallback)
    .select(selectColumns)
    .single();

  if (inserted) {
    return inserted;
  }

  if (insertError && !error) {
    throw new Error(insertError.message);
  }

  return fallback;
}

export function isCurrentInventoryVehicle(row: VehicleLimitRow) {
  if (row.deleted_at || row.is_archived === true) {
    return false;
  }

  const status = (row.status ?? '').trim().toLowerCase();
  return !['売却済み', '納車済み', 'sold', 'delivered', 'archived', 'deleted'].includes(status);
}

export async function getCurrentInventoryCount(supabase: SupabaseClient, storeId: string) {
  const { data, error } = await supabase
    .from<VehicleLimitRow>('vehicles')
    .select('status, deleted_at, is_archived')
    .eq('store_id', storeId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter(isCurrentInventoryVehicle).length;
}

function isInCurrentMonth(row: DocumentCountRow, now = new Date()) {
  if (!row.created_at) {
    return false;
  }

  const createdAt = new Date(row.created_at);
  return createdAt.getFullYear() === now.getFullYear() && createdAt.getMonth() === now.getMonth();
}

export async function getMonthlyDocumentCount(supabase: SupabaseClient, storeId: string) {
  const [quotesResult, invoicesResult] = await Promise.all([
    supabase.from<DocumentCountRow>('quotes').select('id, created_at').eq('store_id', storeId),
    supabase.from<DocumentCountRow>('invoices').select('id, created_at').eq('store_id', storeId),
  ]);

  if (quotesResult.error) {
    throw new Error(quotesResult.error.message);
  }
  if (invoicesResult.error) {
    throw new Error(invoicesResult.error.message);
  }

  return [
    ...(quotesResult.data ?? []),
    ...(invoicesResult.data ?? []),
  ].filter((row) => isInCurrentMonth(row)).length;
}

export async function assertVehicleLimitAvailable(supabase: SupabaseClient, storeId: string) {
  const [subscription, currentInventoryCount] = await Promise.all([
    getActiveCompanySubscription(supabase, storeId),
    getCurrentInventoryCount(supabase, storeId),
  ]);
  const result = canAddVehicle(subscription, currentInventoryCount);

  if (!result.allowed) {
    throw new Error(VEHICLE_LIMIT_MESSAGE);
  }

  return result;
}

export async function assertDocumentLimitAvailable(supabase: SupabaseClient, storeId: string) {
  const [subscription, monthlyDocumentCount] = await Promise.all([
    getActiveCompanySubscription(supabase, storeId),
    getMonthlyDocumentCount(supabase, storeId),
  ]);
  const result = canCreateDocument(subscription, monthlyDocumentCount);

  if (!result.allowed) {
    throw new Error(DOCUMENT_LIMIT_MESSAGE);
  }

  return result;
}
