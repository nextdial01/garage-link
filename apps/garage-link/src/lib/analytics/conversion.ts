'use client';

import { track } from '@vercel/analytics';

export type ConversionEvent =
  | 'acquisition_landing_view'
  | 'lp_signup_cta_click'
  | 'inquiry_click'
  | 'demo_view'
  | 'demo_interaction'
  | 'demo_scenario_generated'
  | 'demo_vehicle_created'
  | 'demo_deal_created'
  | 'demo_quote_opened'
  | 'demo_signup_click'
  | 'signup_start'
  | 'signup_form_engaged'
  | 'signup_submit'
  | 'account_created'
  | 'email_confirmed'
  | 'signup_complete'
  | 'onboarding_start'
  | 'onboarding_step_1_complete'
  | 'onboarding_step_2_complete'
  | 'onboarding_step_3_complete'
  | 'onboarding_step_4_complete'
  | 'onboarding_complete'
  | 'dashboard_first_arrival'
  | 'first_vehicle_created'
  | 'first_customer_created'
  | 'first_maintenance_created'
  | 'first_business_record_created'
  | 'return_visit_1d'
  | 'return_visit_7d';

export type FirstBusinessRecordType = 'vehicle' | 'customer' | 'maintenance';

type Attribution = { source: string; placement: string; lead: string };
type StoredAttribution = Attribution & { at: number };
type ConversionProperties = Partial<Attribution> & {
  value_type?: FirstBusinessRecordType;
  demo_action?: string;
  demo_scenario?: string;
  demo_view?: string;
};

const ATTRIBUTION_KEY = 'garage-link-signup-attribution';
const ATTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ONCE_KEY_PREFIX = 'garage-link-conversion-once:';
const FIRST_RECORD_AT_KEY_PREFIX = 'garage-link-first-business-record-at:';

function safeValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().slice(0, 64);
  return normalized || fallback;
}

function parseStoredAttribution(raw: string | null): Attribution | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredAttribution>;
    const at = Number(stored.at);
    if (!Number.isFinite(at) || at <= 0 || Date.now() - at > ATTRIBUTION_TTL_MS) return null;
    return {
      source: safeValue(stored.source, 'direct'),
      placement: safeValue(stored.placement, 'direct'),
      lead: safeValue(stored.lead, 'direct'),
    };
  } catch {
    return null;
  }
}

function attributionScope(attribution: Attribution) {
  return attribution.lead !== 'direct' && attribution.lead !== 'unknown'
    ? attribution.lead
    : 'browser';
}

export function saveSignupAttribution(attribution: Partial<Attribution>) {
  if (typeof window === 'undefined') return;
  const value: Attribution = {
    source: safeValue(attribution.source, 'landing'),
    placement: safeValue(attribution.placement, 'unknown'),
    lead: safeValue(attribution.lead, 'unknown'),
  };
  const serialized = JSON.stringify({ ...value, at: Date.now() } satisfies StoredAttribution);
  window.sessionStorage.setItem(ATTRIBUTION_KEY, serialized);
  window.localStorage.setItem(ATTRIBUTION_KEY, serialized);
}

export function readSignupAttribution(searchParams?: URLSearchParams): Attribution {
  let stored: Attribution | null = null;

  if (typeof window !== 'undefined') {
    stored = parseStoredAttribution(window.sessionStorage.getItem(ATTRIBUTION_KEY));
    if (!stored) {
      stored = parseStoredAttribution(window.localStorage.getItem(ATTRIBUTION_KEY));
      if (stored) {
        window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(stored));
      }
    }
  }

  const queryAttribution = {
    source: searchParams?.get('source') ?? undefined,
    placement: searchParams?.get('placement') ?? undefined,
    lead: searchParams?.get('lead') ?? undefined,
  };

  if (queryAttribution.source || queryAttribution.placement || queryAttribution.lead) {
    const value = {
      source: safeValue(queryAttribution.source, stored?.source ?? 'landing'),
      placement: safeValue(queryAttribution.placement, stored?.placement ?? 'unknown'),
      lead: safeValue(queryAttribution.lead, stored?.lead ?? 'unknown'),
    };
    saveSignupAttribution(value);
    return value;
  }

  if (stored) return stored;

  return { source: 'direct', placement: 'direct', lead: 'direct' };
}

export function trackConversion(event: ConversionEvent, properties: ConversionProperties = {}) {
  const current = readSignupAttribution();
  const value = {
    source: safeValue(properties.source, current.source),
    placement: safeValue(properties.placement, current.placement),
    lead: safeValue(properties.lead, current.lead),
    ...(properties.value_type ? { value_type: properties.value_type } : {}),
    ...(properties.demo_action ? { demo_action: safeValue(properties.demo_action, 'unknown') } : {}),
    ...(properties.demo_scenario ? { demo_scenario: safeValue(properties.demo_scenario, 'unknown') } : {}),
    ...(properties.demo_view ? { demo_view: safeValue(properties.demo_view, 'unknown') } : {}),
  };

  track(event, value);

  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('garage-link:conversion', { detail: { event, ...value } }));
  }
}

export function trackConversionOnce(event: ConversionEvent, properties: ConversionProperties = {}) {
  if (typeof window === 'undefined') return;
  const current = readSignupAttribution();
  const scope = attributionScope(current);
  const key = `${ONCE_KEY_PREFIX}${scope}:${event}`;
  if (window.localStorage.getItem(key) === '1') return;

  trackConversion(event, properties);
  window.localStorage.setItem(key, '1');
}

export function recordFirstBusinessRecord(valueType: FirstBusinessRecordType) {
  if (typeof window === 'undefined') return;
  const specificEvent: Record<FirstBusinessRecordType, ConversionEvent> = {
    vehicle: 'first_vehicle_created',
    customer: 'first_customer_created',
    maintenance: 'first_maintenance_created',
  };

  trackConversionOnce(specificEvent[valueType], { value_type: valueType });

  const current = readSignupAttribution();
  const scope = attributionScope(current);
  const firstRecordAtKey = `${FIRST_RECORD_AT_KEY_PREFIX}${scope}`;
  if (!window.localStorage.getItem(firstRecordAtKey)) {
    window.localStorage.setItem(firstRecordAtKey, String(Date.now()));
    trackConversionOnce('first_business_record_created', { value_type: valueType });
  }
}

export function trackReturnVisitMilestones() {
  if (typeof window === 'undefined') return;
  const current = readSignupAttribution();
  const scope = attributionScope(current);
  const raw = window.localStorage.getItem(`${FIRST_RECORD_AT_KEY_PREFIX}${scope}`);
  if (!raw) return;

  const firstRecordAt = Number(raw);
  if (!Number.isFinite(firstRecordAt) || firstRecordAt <= 0) return;

  const elapsedMs = Date.now() - firstRecordAt;
  if (elapsedMs >= 20 * 60 * 60 * 1000) {
    trackConversionOnce('return_visit_1d');
  }
  if (elapsedMs >= 6 * 24 * 60 * 60 * 1000 + 20 * 60 * 60 * 1000) {
    trackConversionOnce('return_visit_7d');
  }
}
