'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';

const PUBLIC_PREFIXES = ['/industries/', '/legal/'];
const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/onboarding',
  '/pricing',
  '/faq',
  '/help',
]);

function filterPrivateRoutes(event: BeforeSendEvent) {
  const pathname = new URL(event.url).pathname;
  const isPublic = PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  return isPublic ? event : null;
}

export function GarageAnalytics() {
  return <Analytics beforeSend={filterPrivateRoutes} />;
}
