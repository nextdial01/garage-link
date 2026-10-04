'use client';

import { useEffect } from 'react';
import { readSignupAttribution, trackConversion } from '@/lib/analytics/conversion';

export function AcquisitionPageTracker({
  source,
  placement,
}: {
  source: string;
  placement: string;
}) {
  useEffect(() => {
    const attribution = readSignupAttribution(new URLSearchParams(window.location.search));
    trackConversion('acquisition_landing_view', {
      source: attribution.source === 'direct' ? source : attribution.source,
      placement,
      lead: attribution.lead,
    });
  }, [placement, source]);

  return null;
}
