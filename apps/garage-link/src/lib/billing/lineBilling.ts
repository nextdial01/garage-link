import {
  currentBillingMonth,
  evaluateLineDeliveryUsage,
  type LineDeliveryUsageEvaluation,
} from '@/lib/billing/linePlans';

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseBillingQuery = PromiseLike<QueryResult<unknown[]>> & {
  eq(column: string, value: string): SupabaseBillingQuery;
};

type SupabaseBillingClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): SupabaseBillingQuery;
    };
    insert(payload: object): PromiseLike<{ error: { message: string } | null }> | unknown;
  };
};

type TenantSubscriptionRow = {
  plan_code: string | null;
  status: string | null;
  unlimited_delivery_enabled: boolean | null;
};

type DeliveryUsageRow = {
  delivery_count: number | null;
};

async function queryRows<T>(query: unknown): Promise<QueryResult<T[]>> {
  const result = await (query as PromiseLike<QueryResult<T[]>>);
  return result;
}

export async function getTenantLineSubscription({
  supabase,
  tenantId,
}: {
  supabase: SupabaseBillingClient;
  tenantId: string | null;
}) {
  if (!tenantId) {
    return null;
  }

  try {
    const query = supabase
      .from('tenant_subscriptions')
      .select('plan_code, status, unlimited_delivery_enabled')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    const { data, error } = await queryRows<TenantSubscriptionRow>(query);

    if (error) {
      return null;
    }

    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getMonthlyDeliveryUsage({
  supabase,
  tenantId,
  billingMonth = currentBillingMonth(),
}: {
  supabase: SupabaseBillingClient;
  tenantId: string | null;
  billingMonth?: string;
}) {
  if (!tenantId) {
    return 0;
  }

  try {
    const query = supabase
      .from('delivery_usage_logs')
      .select('delivery_count')
      .eq('tenant_id', tenantId)
      .eq('billing_month', billingMonth);
    const { data, error } = await queryRows<DeliveryUsageRow>(query);

    if (error) {
      return 0;
    }

    return (data ?? []).reduce((sum, row) => sum + (row.delivery_count ?? 0), 0);
  } catch {
    return 0;
  }
}

export async function evaluateTenantLineDeliveryUsage({
  supabase,
  tenantId,
  deliveryCount,
  billingMonth = currentBillingMonth(),
}: {
  supabase: SupabaseBillingClient;
  tenantId: string | null;
  deliveryCount: number;
  billingMonth?: string;
}) {
  const [subscription, usedBefore] = await Promise.all([
    getTenantLineSubscription({ supabase, tenantId }),
    getMonthlyDeliveryUsage({ supabase, tenantId, billingMonth }),
  ]);

  return evaluateLineDeliveryUsage({
    planCode: subscription?.plan_code ?? 'FREE',
    unlimitedDeliveryEnabled: subscription?.unlimited_delivery_enabled ?? false,
    usedBefore,
    deliveryCount,
  });
}

export function safeBillingSnapshot(evaluation: LineDeliveryUsageEvaluation) {
  return {
    plan_code: evaluation.planCode,
    plan_name: evaluation.planName,
    used_before: evaluation.usedBefore,
    delivery_count: evaluation.deliveryCount,
    projected_usage: evaluation.projectedUsage,
    monthly_delivery_limit: evaluation.monthlyDeliveryLimit,
    overage_count: evaluation.overageCount,
    estimated_overage_amount: evaluation.estimatedOverageAmount,
    unlimited_delivery_enabled: evaluation.unlimitedDeliveryEnabled,
  };
}

export async function recordDeliveryUsage({
  supabase,
  tenantId,
  storeId,
  lineAccountId = null,
  messageId,
  deliveryId = null,
  deliveryCount,
  billingMonth = currentBillingMonth(),
}: {
  supabase: SupabaseBillingClient;
  tenantId: string | null;
  storeId: string;
  lineAccountId?: string | null;
  messageId: string | null;
  deliveryId?: string | null;
  deliveryCount: number;
  billingMonth?: string;
}) {
  if (!tenantId) {
    return;
  }

  try {
    await supabase.from('delivery_usage_logs').insert({
      tenant_id: tenantId,
      store_id: storeId,
      line_account_id: lineAccountId,
      message_id: messageId,
      delivery_id: deliveryId,
      delivery_count: deliveryCount,
      billing_month: billingMonth,
    });
  } catch {
    // 課金ログテーブル未適用のstagingでも既存配信を壊さないため握りつぶす。
  }
}

export async function recordDeliveryOverage({
  supabase,
  tenantId,
  storeId,
  lineAccountId = null,
  deliveryId = null,
  evaluation,
  billingMonth = currentBillingMonth(),
}: {
  supabase: SupabaseBillingClient;
  tenantId: string | null;
  storeId: string;
  lineAccountId?: string | null;
  deliveryId?: string | null;
  evaluation: LineDeliveryUsageEvaluation;
  billingMonth?: string;
}) {
  if (!tenantId || evaluation.overageCount < 1 || evaluation.unlimitedDeliveryEnabled) {
    return;
  }

  try {
    await supabase.from('delivery_overage_logs').insert({
      tenant_id: tenantId,
      store_id: storeId,
      line_account_id: lineAccountId,
      delivery_id: deliveryId,
      included_limit: evaluation.monthlyDeliveryLimit,
      used_before: evaluation.usedBefore,
      delivery_count: evaluation.deliveryCount,
      overage_count: evaluation.overageCount,
      overage_unit: evaluation.overageUnit,
      overage_unit_price: evaluation.overageUnitPrice,
      estimated_overage_amount: evaluation.estimatedOverageAmount,
      billing_month: billingMonth,
      status: 'estimated',
    });
  } catch {
    // 課金ログテーブル未適用のstagingでも既存配信を壊さないため握りつぶす。
  }
}
