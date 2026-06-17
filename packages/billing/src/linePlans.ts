export type LinePlanCode = 'FREE' | 'LINE_BASIC' | 'LINE_AUTO';

export type LinePlan = {
  planCode: LinePlanCode;
  planName: string;
  monthlyPrice: number;
  monthlyDeliveryLimit: number;
  richMenuLimit: number | null;
  formLimit: number | null;
  multiStoreEnabled: boolean;
  overageEnabled: boolean;
  unlimitedOptionEnabled: boolean;
  overageUnit: number | null;
  overageUnitPrice: number | null;
};

export const UNLIMITED_DELIVERY_OPTION = {
  optionCode: 'UNLIMITED_DELIVERY_OPTION',
  optionName: '通数無制限オプション',
  monthlyPrice: 9800,
  eligiblePlans: ['LINE_BASIC', 'LINE_AUTO'] satisfies LinePlanCode[],
};

export const LINE_PLANS: Record<LinePlanCode, LinePlan> = {
  FREE: {
    planCode: 'FREE',
    planName: 'FREE',
    monthlyPrice: 0,
    monthlyDeliveryLimit: 1000,
    richMenuLimit: 1,
    formLimit: 1,
    multiStoreEnabled: false,
    overageEnabled: false,
    unlimitedOptionEnabled: false,
    overageUnit: null,
    overageUnitPrice: null,
  },
  LINE_BASIC: {
    planCode: 'LINE_BASIC',
    planName: 'LINE BASIC',
    monthlyPrice: 9800,
    monthlyDeliveryLimit: 5000,
    richMenuLimit: null,
    formLimit: null,
    multiStoreEnabled: false,
    overageEnabled: true,
    unlimitedOptionEnabled: true,
    overageUnit: 1000,
    overageUnitPrice: 1000,
  },
  LINE_AUTO: {
    planCode: 'LINE_AUTO',
    planName: 'LINE AUTO',
    monthlyPrice: 29800,
    monthlyDeliveryLimit: 30000,
    richMenuLimit: null,
    formLimit: null,
    multiStoreEnabled: true,
    overageEnabled: true,
    unlimitedOptionEnabled: true,
    overageUnit: 1000,
    overageUnitPrice: 1000,
  },
};

export function normalizeLinePlanCode(value: string | null | undefined): LinePlanCode {
  if (value === 'LINE_BASIC' || value === 'LINE_AUTO') {
    return value;
  }

  return 'FREE';
}

export function getLinePlan(value: string | null | undefined) {
  return LINE_PLANS[normalizeLinePlanCode(value)];
}

export function formatYen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

export function currentBillingMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export type LineDeliveryUsageInput = {
  planCode?: string | null;
  unlimitedDeliveryEnabled?: boolean | null;
  usedBefore: number;
  deliveryCount: number;
};

export type LineDeliveryUsageEvaluation = {
  planCode: LinePlanCode;
  planName: string;
  monthlyDeliveryLimit: number;
  unlimitedDeliveryEnabled: boolean;
  usedBefore: number;
  deliveryCount: number;
  projectedUsage: number;
  overageEnabled: boolean;
  overageUnit: number | null;
  overageUnitPrice: number | null;
  overageCount: number;
  estimatedOverageAmount: number;
  allowed: boolean;
  reasonCode: 'ok' | 'free_limit_exceeded';
  message: string | null;
};

export function evaluateLineDeliveryUsage({
  planCode,
  unlimitedDeliveryEnabled,
  usedBefore,
  deliveryCount,
}: LineDeliveryUsageInput): LineDeliveryUsageEvaluation {
  const plan = getLinePlan(planCode);
  const unlimited = Boolean(unlimitedDeliveryEnabled && plan.unlimitedOptionEnabled);
  const projectedUsage = usedBefore + deliveryCount;

  if (unlimited) {
    return {
      planCode: plan.planCode,
      planName: plan.planName,
      monthlyDeliveryLimit: plan.monthlyDeliveryLimit,
      unlimitedDeliveryEnabled: true,
      usedBefore,
      deliveryCount,
      projectedUsage,
      overageEnabled: plan.overageEnabled,
      overageUnit: plan.overageUnit,
      overageUnitPrice: plan.overageUnitPrice,
      overageCount: 0,
      estimatedOverageAmount: 0,
      allowed: true,
      reasonCode: 'ok',
      message: '配信数無制限オプション適用中です。',
    };
  }

  const overageBefore = Math.max(0, usedBefore - plan.monthlyDeliveryLimit);
  const overageAfter = Math.max(0, projectedUsage - plan.monthlyDeliveryLimit);
  const overageCount = Math.max(0, overageAfter - overageBefore);
  const estimatedOverageAmount =
    plan.overageEnabled && plan.overageUnit && plan.overageUnitPrice && overageCount > 0
      ? Math.ceil(overageCount / plan.overageUnit) * plan.overageUnitPrice
      : 0;

  if (plan.planCode === 'FREE' && projectedUsage > plan.monthlyDeliveryLimit) {
    return {
      planCode: plan.planCode,
      planName: plan.planName,
      monthlyDeliveryLimit: plan.monthlyDeliveryLimit,
      unlimitedDeliveryEnabled: false,
      usedBefore,
      deliveryCount,
      projectedUsage,
      overageEnabled: false,
      overageUnit: null,
      overageUnitPrice: null,
      overageCount,
      estimatedOverageAmount: 0,
      allowed: false,
      reasonCode: 'free_limit_exceeded',
      message: '今月の無料配信数の上限に達しました。配信を続けるには、LINE BASICへアップグレードしてください。',
    };
  }

  return {
    planCode: plan.planCode,
    planName: plan.planName,
    monthlyDeliveryLimit: plan.monthlyDeliveryLimit,
    unlimitedDeliveryEnabled: false,
    usedBefore,
    deliveryCount,
    projectedUsage,
    overageEnabled: plan.overageEnabled,
    overageUnit: plan.overageUnit,
    overageUnitPrice: plan.overageUnitPrice,
    overageCount,
    estimatedOverageAmount,
    allowed: true,
    reasonCode: 'ok',
    message: overageCount > 0 ? '月間配信数を超過するため、従量課金の対象です。' : null,
  };
}
