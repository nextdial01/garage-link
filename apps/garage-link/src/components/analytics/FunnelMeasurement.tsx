'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  readSignupAttribution,
  recordFirstBusinessRecord,
  trackConversionOnce,
  trackReturnVisitMilestones,
} from '@/lib/analytics/conversion';

type PendingRecordType = 'vehicle' | 'customer' | 'maintenance';

type PendingRecord = {
  type: PendingRecordType;
  at: number;
};

const PENDING_RECORD_KEY = 'garage-link-funnel-pending-record';
const PENDING_ONBOARDING_COMPLETE_KEY = 'garage-link-funnel-pending-onboarding-complete';
const PENDING_TTL_MS = 60_000;

function setPendingRecord(type: PendingRecordType) {
  window.sessionStorage.setItem(PENDING_RECORD_KEY, JSON.stringify({ type, at: Date.now() } satisfies PendingRecord));
}

function readPendingRecord(): PendingRecord | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PENDING_RECORD_KEY) ?? '') as Partial<PendingRecord>;
    if (!parsed.type || !parsed.at || Date.now() - parsed.at > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(PENDING_RECORD_KEY);
      return null;
    }
    if (!['vehicle', 'customer', 'maintenance'].includes(parsed.type)) return null;
    return parsed as PendingRecord;
  } catch {
    return null;
  }
}

function setPendingOnboardingComplete() {
  window.sessionStorage.setItem(PENDING_ONBOARDING_COMPLETE_KEY, String(Date.now()));
}

function takePendingOnboardingComplete() {
  const raw = window.sessionStorage.getItem(PENDING_ONBOARDING_COMPLETE_KEY);
  window.sessionStorage.removeItem(PENDING_ONBOARDING_COMPLETE_KEY);
  const at = Number(raw);
  return Number.isFinite(at) && Date.now() - at <= PENDING_TTL_MS;
}

function visibleOnboardingStep() {
  const match = document.body.innerText.match(/STEP\s+([1-4])\s*\/\s*4/);
  return match ? Number(match[1]) : null;
}

const STEP_COMPLETE_EVENT = {
  1: 'onboarding_step_1_complete',
  2: 'onboarding_step_2_complete',
  3: 'onboarding_step_3_complete',
} as const;

function targetButton(event: MouseEvent) {
  const target = event.target;
  return target instanceof Element ? target.closest('button') : null;
}

export function FunnelMeasurement() {
  const pathname = usePathname();
  const lastOnboardingStep = useRef<number | null>(null);

  useEffect(() => {
    function onSubmit() {
      const currentPath = window.location.pathname;
      if (currentPath === '/vehicles/new') setPendingRecord('vehicle');
      if (currentPath === '/customers/new') setPendingRecord('customer');
    }

    function onClick(event: MouseEvent) {
      const button = targetButton(event);
      if (!button || button.hasAttribute('disabled')) return;
      const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const currentPath = window.location.pathname;

      if (currentPath === '/maintenance/new' && /(保存|登録)/.test(text)) {
        setPendingRecord('maintenance');
      }

      if (currentPath === '/onboarding' && text.includes('設定を完了してダッシュボードへ進む')) {
        setPendingOnboardingComplete();
      }
    }

    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  useEffect(() => {
    readSignupAttribution(new URLSearchParams(window.location.search));

    if (pathname === '/onboarding') {
      trackConversionOnce('onboarding_start');
      lastOnboardingStep.current = visibleOnboardingStep();

      const observer = new MutationObserver(() => {
        const nextStep = visibleOnboardingStep();
        const previousStep = lastOnboardingStep.current;
        if (nextStep && previousStep && nextStep > previousStep) {
          for (let completed = previousStep; completed < nextStep && completed <= 3; completed += 1) {
            trackConversionOnce(STEP_COMPLETE_EVENT[completed as 1 | 2 | 3]);
          }
        }
        if (nextStep) lastOnboardingStep.current = nextStep;
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      return () => observer.disconnect();
    }

    lastOnboardingStep.current = null;

    if (pathname === '/dashboard') {
      if (takePendingOnboardingComplete()) {
        trackConversionOnce('onboarding_step_4_complete');
      }
      trackConversionOnce('dashboard_first_arrival');
    }

    const pending = readPendingRecord();
    if (pending) {
      const successfulDestination =
        (pending.type === 'vehicle' && pathname === '/vehicles') ||
        (pending.type === 'customer' && pathname === '/customers') ||
        (pending.type === 'maintenance' && pathname === '/maintenance');

      if (successfulDestination) {
        window.sessionStorage.removeItem(PENDING_RECORD_KEY);
        recordFirstBusinessRecord(pending.type);
      }
    }

    if (!['/', '/login', '/signup', '/onboarding', '/pricing', '/faq', '/help'].includes(pathname)) {
      trackReturnVisitMilestones();
    }
  }, [pathname]);

  return null;
}
