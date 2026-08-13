'use client';

import Link from 'next/link';
import { useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { saveSignupAttribution, trackConversion } from '@/lib/analytics/conversion';
import { releaseQaRunId } from '@/lib/auth/releaseQaCallback';

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'onClick'> & {
  children: ReactNode;
  placement: string;
};

function subscribeReleaseQaRun() {
  return () => undefined;
}

function releaseQaRunSnapshot() {
  return releaseQaRunId(new URLSearchParams(window.location.search).get('qa_run'));
}

export function TrackedSignupLink({ children, placement, ...props }: Props) {
  const qaRunId = useSyncExternalStore(subscribeReleaseQaRun, releaseQaRunSnapshot, () => null);

  const href = `/signup?source=landing&placement=${encodeURIComponent(placement)}${qaRunId ? `&qa_run=${encodeURIComponent(qaRunId)}` : ''}`;

  return (
    <Link
      {...props}
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
