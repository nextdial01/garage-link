import { NextResponse } from 'next/server';
import { getConfiguredStripePricePlans, isStripeConfigured } from '@/lib/stripe/client';

export async function GET() {
  return NextResponse.json({
    ok: true,
    stripeConfigured: isStripeConfigured(),
    checkoutReady: getConfiguredStripePricePlans().length > 0,
    plans: getConfiguredStripePricePlans(),
  });
}
