export type LLinkPlanCode = 'free' | 'basic' | 'auto';

export type LLinkPlan = {
  code: LLinkPlanCode;
  name: string;
  monthlyPrice: number;
  friendLimit: number | null;
  monthlyDeliveryLimit: number;
  formLimit: number | null;
  richMenuLimit: number | null;
  stepScenarioLimit: number | null;
  scenarioBranchEnabled: boolean;
  scheduledDeliveryEnabled: boolean;
  staffLimit: number | null;
  lineAccountLimit: number;
};

export const L_LINK_PLANS: Record<LLinkPlanCode, LLinkPlan> = {
  free: {
    code: 'free',
    name: 'Free',
    monthlyPrice: 0,
    friendLimit: 300,
    monthlyDeliveryLimit: 1000,
    formLimit: 1,
    richMenuLimit: 1,
    stepScenarioLimit: 1,
    scenarioBranchEnabled: false,
    scheduledDeliveryEnabled: false,
    staffLimit: 1,
    lineAccountLimit: 1,
  },
  basic: {
    code: 'basic',
    name: 'L-Link BASIC',
    monthlyPrice: 9800,
    friendLimit: 5000,
    monthlyDeliveryLimit: 5000,
    formLimit: null,
    richMenuLimit: null,
    stepScenarioLimit: 5,
    scenarioBranchEnabled: true,
    scheduledDeliveryEnabled: true,
    staffLimit: 5,
    lineAccountLimit: 1,
  },
  auto: {
    code: 'auto',
    name: 'L-Link AUTO',
    monthlyPrice: 29800,
    friendLimit: null,
    monthlyDeliveryLimit: 30000,
    formLimit: null,
    richMenuLimit: null,
    stepScenarioLimit: null,
    scenarioBranchEnabled: true,
    scheduledDeliveryEnabled: true,
    staffLimit: null,
    lineAccountLimit: 3,
  },
};

export function getLLinkPlan(value: string | null | undefined) {
  if (value === 'basic' || value === 'auto') return L_LINK_PLANS[value];
  return L_LINK_PLANS.free;
}
