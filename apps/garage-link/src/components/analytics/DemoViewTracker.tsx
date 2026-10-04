'use client';

import { useEffect } from 'react';
import { readSignupAttribution, trackConversion } from '@/lib/analytics/conversion';

export function DemoViewTracker() {
  useEffect(() => {
    const attribution = readSignupAttribution(new URLSearchParams(window.location.search));
    trackConversion('demo_view', attribution);
  }, []);

  return null;
}
