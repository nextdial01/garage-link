import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { readReleaseQaFixture } from '@/lib/auth/releaseQaFixture';
import { isControlledStagingReleaseQaRuntime } from '@/lib/security/stagingReleaseQaHost';

export const dynamic = 'force-dynamic';

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CallbackPhase = 'callback' | 'arrival' | 'store_created' | 'onboarding_completed' | 'password_updated';
type CallbackPurpose = 'signup' | 'recovery';

function stagingRuntime(request: Request) {
  return isControlledStagingReleaseQaRuntime({
    hostname: new URL(request.url).hostname,
    projectId: process.env.VERCEL_PROJECT_ID,
    vercelEnv: process.env.VERCEL_ENV?.toLowerCase(),
    nodeEnv: process.env.NODE_ENV,
    previewOtpSecret: process.env.GARAGE_PREVIEW_OTP_SINK_SECRET,
  });
}

function callbackPurpose(nextPath: unknown, runId: string): CallbackPurpose | null {
  if (typeof nextPath !== 'string') return null;
  const url = new URL(nextPath, 'https://garage-link.invalid');
  if (url.searchParams.get('qa_run') !== runId) return null;
  if (url.pathname === '/signup' && url.searchParams.get('resume') === '1') return 'signup';
  if (url.pathname === '/auth/reset-password') return 'recovery';
  return null;
}

function validCallbackChain(
  value: Record<string, unknown>,
  purpose: CallbackPurpose,
  runId: string,
  origin: string,
) {
  const expectedNext = purpose === 'signup'
    ? `/signup?resume=1&qa_run=${runId}`
    : `/auth/reset-password?qa_run=${runId}`;
  const callback = value.callback as { next_path?: unknown; origin?: unknown; recorded_at?: unknown } | undefined;
  const arrival = value.arrival as { next_path?: unknown; origin?: unknown; recorded_at?: unknown } | undefined;
  const callbackAt = Date.parse(typeof callback?.recorded_at === 'string' ? callback.recorded_at : '');
  const arrivalAt = Date.parse(typeof arrival?.recorded_at === 'string' ? arrival.recorded_at : '');
  return callback?.next_path === expectedNext
    && arrival?.next_path === expectedNext
    && callback.origin === origin
    && arrival.origin === origin
    && Number.isFinite(callbackAt)
    && Number.isFinite(arrivalAt)
    && callbackAt <= arrivalAt;
}

export async function POST(request: Request) {
  if (!stagingRuntime(request)) return new Response(null, { status: 404 });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return new Response(null, { status: 401 });

  let body: { run_id?: unknown; phase?: unknown; next_path?: unknown };
  try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }
  const runId = typeof body.run_id === 'string' && RUN_ID.test(body.run_id) ? body.run_id.toLowerCase() : null;
  const phase: CallbackPhase | null = body.phase === 'callback' || body.phase === 'arrival' || body.phase === 'store_created' || body.phase === 'onboarding_completed' || body.phase === 'password_updated' ? body.phase : null;
  if (!runId || !phase) return new Response(null, { status: 400 });
  const purpose = callbackPurpose(body.next_path, runId);
  if (!purpose) return new Response(null, { status: 400 });
  if (phase === 'password_updated' && purpose !== 'recovery') return new Response(null, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const admin = createAdminClient();
  if (!url || !anonKey || !admin) return new Response(null, { status: 404 });
  const verifier = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user?.email || data.user.app_metadata?.release_qa_run_id !== runId) return new Response(null, { status: 403 });

  const prior = data.user.app_metadata?.release_qa_callback;
  if (prior && typeof prior === 'object' && prior.run_id && prior.run_id !== runId) return new Response(null, { status: 409 });
  const existingPurpose = prior && typeof prior === 'object' && prior[purpose] && typeof prior[purpose] === 'object' ? prior[purpose] : {};
  const origin = new URL(request.url).origin;
  if (phase === 'store_created') {
    if (purpose !== 'signup' || !validCallbackChain(existingPurpose, purpose, runId, origin)) return new Response(null, { status: 409 });
  }
  if (phase === 'onboarding_completed') {
    const storeCreated = existingPurpose.store_created as { server_bound_continuation?: unknown } | undefined;
    if (
      purpose !== 'signup'
      || !validCallbackChain(existingPurpose, purpose, runId, origin)
      || storeCreated?.server_bound_continuation !== true
    ) return new Response(null, { status: 409 });
  }
  if (phase === 'password_updated' && !validCallbackChain(existingPurpose, purpose, runId, origin)) {
    return new Response(null, { status: 409 });
  }
  const recordedAt = new Date().toISOString();
  const continuation = phase === 'store_created' || phase === 'onboarding_completed' || phase === 'password_updated'
    ? { server_bound_continuation: true, continuation_of_callback_at: (existingPurpose.callback as { recorded_at?: unknown }).recorded_at }
    : {};
  // Fixture adoption must stay bound to the browser session that completed
  // administrator OTP.  Capture the synthetic owner's already-authorized
  // membership only after onboarding: at that point the real callback,
  // store, OTP, and onboarding continuation are all present in this one
  // authenticated request.  The runner later reads this signed-by-Auth
  // evidence; it never replaces it with a fresh password session.
  let fixture: Record<string, unknown> | undefined;
  if (phase === 'onboarding_completed') {
    const lookup = await readReleaseQaFixture({
      url,
      anonKey,
      accessToken: token,
      userId: data.user.id,
    });
    if (!lookup.fixture) return new Response(null, { status: 409 });
    fixture = {
      membership_id: lookup.fixture.membershipId,
      tenant_id: lookup.fixture.tenantId,
      store_id: lookup.fixture.storeId,
      tenant_name: lookup.fixture.tenantName,
      account_state: {
        garage_ui_context: lookup.fixture.accountState.garageUiContext,
        active_store: lookup.fixture.accountState.activeStore,
        onboarding_completed: lookup.fixture.accountState.onboardingCompleted,
        membership_role: lookup.fixture.accountState.membershipRole,
        membership_status: lookup.fixture.accountState.membershipStatus,
        contract_access_state: lookup.fixture.accountState.contractAccessState,
      },
    };
  }
  const evidence = {
    ...(prior && typeof prior === 'object' ? prior : {}),
    run_id: runId,
    [purpose]: {
      ...existingPurpose,
      [phase]: { next_path: body.next_path, origin, recorded_at: recordedAt, ...continuation, ...(fixture ? { fixture } : {}) },
    },
  };
  const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { ...data.user.app_metadata, release_qa_callback: evidence },
  });
  if (updateError) return new Response(null, { status: 500 });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
