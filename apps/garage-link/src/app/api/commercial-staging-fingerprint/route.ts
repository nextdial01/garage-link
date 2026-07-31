import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

const PRODUCTION_VERCEL_PROJECT_ID = 'prj_OOUdmGaVBHaVPMxPHTiPXLw3Tq64';
const CURRENT_SUPABASE_REF = 'wmlpuzuskfiwdipluglz';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (process.env.GARAGE_COMMERCIAL_STAGING_FINGERPRINT_ENABLED !== 'true') {
    return new NextResponse(null, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const projectName = process.env.VERCEL_PROJECT_NAME?.trim();
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  const releaseSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const expectedStripeAccountId = process.env.STRIPE_ACCOUNT_ID?.trim();
  const stripe = getStripeClient();
  const runtimeHost = new URL(request.url).hostname;
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : '';

  const denied = runtimeHost === 'garage-link.tech'
    || runtimeHost.endsWith('.garage-link.tech')
    || supabaseHost.includes(CURRENT_SUPABASE_REF)
    || projectId === PRODUCTION_VERCEL_PROJECT_ID
    || projectName === 'garage-link'
    || !stripeKey?.startsWith('sk_test_');

  const complete = Boolean(
    supabaseHost && projectId && projectName && deploymentId && releaseSha
      && expectedStripeAccountId && stripe,
  );
  if (denied || !complete) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  let stripeAccountId: string;
  try {
    stripeAccountId = (await stripe!.accounts.retrieve(expectedStripeAccountId!)).id;
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    runtime_host: runtimeHost,
    supabase_host: supabaseHost,
    stripe_mode: 'test',
    stripe_account_id: stripeAccountId,
    vercel_project_id: projectId,
    vercel_project_name: projectName,
    vercel_deployment_id: deploymentId,
    release_sha: releaseSha,
  });
}
