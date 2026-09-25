'use client';

import Link from 'next/link';
import { useSyncExternalStore, type ComponentProps, type MouseEventHandler } from 'react';
import { saveSignupAttribution, trackConversion } from '@/lib/analytics/conversion';
import { releaseQaRunId } from '@/lib/auth/releaseQaCallback';

type Props = {
  children: ComponentProps<typeof Link>['children'];
  className?: string;
  placement: string;
};

function subscribeReleaseQaRun() {
  return () => undefined;
}

function releaseQaRunSnapshot() {
  return releaseQaRunId(new URLSearchParams(window.location.search).get('qa_run'));
}

export function TrackedSignupLink({ children, placement, className }: Props) {
  const qaRunId = useSyncExternalStore(subscribeReleaseQaRun, releaseQaRunSnapshot, () => null);

  const href = `/signup?source=landing&placement=${encodeURIComponent(placement)}${qaRunId ? `&qa_run=${encodeURIComponent(qaRunId)}` : ''}`;

  return (
    <Link
      className={className}
      href={href}
      onClick={() => {
        saveSignupAttribution({ source: 'landing', placement });
        trackConversion('lp_signup_cta_click', { source: 'landing', placement });
      }}
    >
      {children}
    </Link>
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
