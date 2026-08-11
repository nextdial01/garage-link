'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { saveSignupAttribution, trackConversion } from '@/lib/analytics/conversion';
import { releaseQaRunId } from '@/lib/auth/releaseQaCallback';

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'onClick'> & {
  children: ReactNode;
  placement: string;
};

export function TrackedSignupLink({ children, placement, ...props }: Props) {
  const href = `/signup?source=landing&placement=${encodeURIComponent(placement)}`;

  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        saveSignupAttribution({ source: 'landing', placement });
        trackConversion('lp_signup_cta_click', { source: 'landing', placement });
        const currentRunId = releaseQaRunId(new URLSearchParams(window.location.search).get('qa_run'));
        if (currentRunId) {
          event.preventDefault();
          window.location.assign(`/signup?source=landing&placement=${encodeURIComponent(placement)}&qa_run=${encodeURIComponent(currentRunId)}`);
        }
      }}
    >
      {children}
    </Link>
  );
}
