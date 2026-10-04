'use client';

import { useEffect } from 'react';
import { readSignupAttribution, saveSignupAttribution, trackConversion } from '@/lib/analytics/conversion';

export function AcquisitionPageTracker({
  source,
  placement,
}: {
  source: string;
  placement: string;
}) {
  useEffect(() => {
    const attribution = readSignupAttribution(new URLSearchParams(window.location.search));
    const effective = {
      source: attribution.source === 'direct' ? source : attribution.source,
      placement,
      lead: attribution.lead,
    };
    saveSignupAttribution(effective);
    trackConversion('acquisition_landing_view', effective);
  }, [placement, source]);

  return null;
}
