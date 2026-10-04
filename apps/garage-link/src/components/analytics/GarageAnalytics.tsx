'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { FunnelMeasurement } from '@/components/analytics/FunnelMeasurement';

const PUBLIC_PREFIXES = ['/industries/', '/solutions/', '/legal/'];
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/onboarding',
  '/features',
  '/demo',
  '/pricing',
  '/faq',
  '/help',
]);

function redactPrivateRoutes(event: BeforeSendEvent) {
  const url = new URL(event.url);
  const isPublic = PUBLIC_PATHS.has(url.pathname) || PUBLIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  if (isPublic) return event;

  // Keep activation/retention custom events emitted after login while avoiding
  // customer IDs, vehicle IDs, query strings, or other private route details.
  url.pathname = '/app';
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}

export function GarageAnalytics() {
  return (
    <>
      <Analytics beforeSend={redactPrivateRoutes} />
      <FunnelMeasurement />
    </>
  );
}
