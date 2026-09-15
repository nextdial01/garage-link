'use client';

import { track } from '@vercel/analytics';

export type ConversionEvent =
  | 'lp_signup_cta_click'
  | 'signup_start'
  | 'signup_submit'
  | 'account_created'
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
type ConversionProperties = Partial<Attribution> & { value_type?: FirstBusinessRecordType };

const ATTRIBUTION_KEY = 'garage-link-signup-attribution';
const ONCE_KEY_PREFIX = 'garage-link-conversion-once:';
const FIRST_RECORD_AT_KEY_PREFIX = 'garage-link-first-business-record-at:';

function safeValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().slice(0, 64);
  return normalized || fallback;
}

function parseStoredAttribution(raw: string | null): Attribution | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<Attribution>;
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
  const serialized = JSON.stringify(value);
  window.sessionStorage.setItem(ATTRIBUTION_KEY, serialized);
  window.localStorage.setItem(ATTRIBUTION_KEY, serialized);
}

export function readSignupAttribution(searchParams?: URLSearchParams): Attribution {
  const queryAttribution = {
    source: searchParams?.get('source') ?? undefined,
    placement: searchParams?.get('placement') ?? undefined,
    lead: searchParams?.get('lead') ?? undefined,
  };

  if (queryAttribution.source || queryAttribution.placement || queryAttribution.lead) {
    const value = {
      source: safeValue(queryAttribution.source, 'landing'),
      placement: safeValue(queryAttribution.placement, 'unknown'),
      lead: safeValue(queryAttribution.lead, 'unknown'),
    };
    saveSignupAttribution(value);
    return value;
  }

  if (typeof window !== 'undefined') {
    const sessionValue = parseStoredAttribution(window.sessionStorage.getItem(ATTRIBUTION_KEY));
    if (sessionValue) return sessionValue;

    const persistentValue = parseStoredAttribution(window.localStorage.getItem(ATTRIBUTION_KEY));
    if (persistentValue) {
      window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(persistentValue));
      return persistentValue;
    }
  }

  return { source: 'direct', placement: 'direct', lead: 'direct' };
}

export function trackConversion(event: ConversionEvent, properties: ConversionProperties = {}) {
  const current = readSignupAttribution();
  const value = {
    source: safeValue(properties.source, current.source),
    placement: safeValue(properties.placement, current.placement),
    lead: safeValue(properties.lead, current.lead),
    ...(properties.value_type ? { value_type: properties.value_type } : {}),
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
