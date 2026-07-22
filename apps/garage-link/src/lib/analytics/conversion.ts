'use client';

import { track } from '@vercel/analytics';

export type ConversionEvent =
  | 'lp_signup_cta_click'
  | 'signup_start'
  | 'signup_submit'
  | 'account_created'
  | 'signup_complete'
  | 'onboarding_complete';

type Attribution = { source: string; placement: string };

const ATTRIBUTION_KEY = 'garage-link-signup-attribution';

function safeValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().slice(0, 64);
  return normalized || fallback;
}

export function saveSignupAttribution(attribution: Partial<Attribution>) {
  if (typeof window === 'undefined') return;
  const value: Attribution = {
    source: safeValue(attribution.source, 'landing'),
    placement: safeValue(attribution.placement, 'unknown'),
  };
  window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
}

export function readSignupAttribution(searchParams?: URLSearchParams): Attribution {
  const queryAttribution = {
    source: searchParams?.get('source') ?? undefined,
    placement: searchParams?.get('placement') ?? undefined,
  };

  if (queryAttribution.source || queryAttribution.placement) {
    const value = {
      source: safeValue(queryAttribution.source, 'landing'),
      placement: safeValue(queryAttribution.placement, 'unknown'),
    };
    saveSignupAttribution(value);
    return value;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_KEY) ?? '') as Partial<Attribution>;
      return {
        source: safeValue(stored.source, 'direct'),
        placement: safeValue(stored.placement, 'direct'),
      };
    } catch {
      // A broken or old browser value must never stop signup.
    }
  }

  return { source: 'direct', placement: 'direct' };
}

export function trackConversion(event: ConversionEvent, attribution?: Partial<Attribution>) {
  const current = readSignupAttribution();
  const value = {
    source: safeValue(attribution?.source, current.source),
    placement: safeValue(attribution?.placement, current.placement),
  };

  track(event, value);

  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('garage-link:conversion', { detail: { event, ...value } }));
  }
}
