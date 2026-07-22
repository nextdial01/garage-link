'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { saveSignupAttribution, trackConversion } from '@/lib/analytics/conversion';

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
      onClick={() => {
        saveSignupAttribution({ source: 'landing', placement });
        trackConversion('lp_signup_cta_click', { source: 'landing', placement });
      }}
    >
      {children}
    </Link>
  );
}
