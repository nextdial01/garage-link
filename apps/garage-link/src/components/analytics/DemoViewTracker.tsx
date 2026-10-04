'use client';

import { useEffect } from 'react';
import { trackConversionOnce } from '@/lib/analytics/conversion';

export function DemoViewTracker() {
  useEffect(() => {
    trackConversionOnce('demo_view');
  }, []);

  return null;
}
