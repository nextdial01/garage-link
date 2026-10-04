'use client';

import Link from 'next/link';
import { useSyncExternalStore, type ComponentProps, type MouseEventHandler, type ReactNode } from 'react';
import { BRAND } from '@/lib/brand';
import { readSignupAttribution, saveSignupAttribution, trackConversion } from '@/lib/analytics/conversion';
import { releaseQaRunId } from '@/lib/auth/releaseQaCallback';

type SignupProps = {
  children: ComponentProps<typeof Link>['children'];
  className?: string;
  placement: string;
  source?: string;
};

type InquiryProps = {
  children: ReactNode;
  className?: string;
  placement: string;
  source?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

function subscribeReleaseQaRun() {
  return () => undefined;
}

function releaseQaRunSnapshot() {
  return releaseQaRunId(new URLSearchParams(window.location.search).get('qa_run'));
}

function currentAttribution(defaultSource: string, placement: string) {
  const current = readSignupAttribution(new URLSearchParams(window.location.search));
  return {
    source: current.source === 'direct' ? defaultSource : current.source,
    placement,
    lead: current.lead === 'direct' ? 'unknown' : current.lead,
  };
}

export function TrackedSignupLink({ children, placement, className, source = 'landing' }: SignupProps) {
  const qaRunId = useSyncExternalStore(subscribeReleaseQaRun, releaseQaRunSnapshot, () => null);
  const href = `/signup?placement=${encodeURIComponent(placement)}${qaRunId ? `&qa_run=${encodeURIComponent(qaRunId)}` : ''}`;

  return (
    <Link
      className={className}
      href={href}
      onClick={() => {
        const attribution = currentAttribution(source, placement);
        saveSignupAttribution(attribution);
        trackConversion('lp_signup_cta_click', attribution);
        if (source === 'demo' || placement.startsWith('demo_')) {
          trackConversion('demo_signup_click', attribution);
        }
      }}
    >
      {children}
    </Link>
  );
}

export function TrackedInquiryLink({
  children,
  placement,
  className,
  source = 'public',
  onClick,
}: InquiryProps) {
  return (
    <a
      className={className}
      href={BRAND.inquiryUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        const attribution = currentAttribution(source, placement);
        saveSignupAttribution(attribution);
        trackConversion('inquiry_click', attribution);
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}

// The QA recovery journey can begin in a fresh browser tab. Preserve the
// run-bound context in the route itself, not only in tab-scoped sessionStorage.
// Ordinary visitors receive the unchanged /login URL.
export function TrackedLoginLink({ children, className, onClick }: {
  children: ComponentProps<typeof Link>['children'];
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const qaRunId = useSyncExternalStore(subscribeReleaseQaRun, releaseQaRunSnapshot, () => null);
  const href = `/login${qaRunId ? `?qa_run=${encodeURIComponent(qaRunId)}` : ''}`;

  return <Link className={className} onClick={onClick} href={href}>{children}</Link>;
}
