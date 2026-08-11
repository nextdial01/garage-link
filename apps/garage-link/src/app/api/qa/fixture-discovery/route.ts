import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { readReleaseQaFixture } from '@/lib/auth/releaseQaFixture';

export const dynamic = 'force-dynamic';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const STAGING_REF = 'gaytoojzwqkpuvfofeql';
const STAGING_HOST = /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i;
const EMAIL_MARKER = /^(?:g[0-9a-f]{6}|garage-link-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}))$/i;

type SafeJwtDiagnostic = {
  sub_matches_user: 'YES' | 'NO';
  role: string;
  aud: string;
  exp_valid: 'YES' | 'NO';
  project_ref_matches: 'YES' | 'NO';
};

function stagingRuntime(request: Request) {
  const url = new URL(request.url);
  const targetEnvironment = process.env.VERCEL_TARGET_ENV?.toLowerCase();
  // Preview deployments can retain a project target of "production". The
  // runtime environment is authoritative unless the target is explicitly safe.
  const environment = ['preview', 'staging'].includes(targetEnvironment ?? '')
    ? targetEnvironment
    : process.env.VERCEL_ENV?.toLowerCase();
  return process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID
    && ['preview', 'staging'].includes(environment ?? '')
    && STAGING_HOST.test(url.hostname);
}

function safeClaim(value: unknown, fallback: string) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value) ? value : fallback;
}

function jwtDiagnostic(token: string, userId: string, supabaseUrl: string): SafeJwtDiagnostic {
  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) throw new Error('missing payload');
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    const expectedIssuer = `${new URL(supabaseUrl).origin}/auth/v1`;
    const audience = Array.isArray(payload.aud) ? payload.aud.join(',') : payload.aud;
    return {
      sub_matches_user: payload.sub === userId ? 'YES' : 'NO',
      role: safeClaim(payload.role, 'UNKNOWN'),
      aud: safeClaim(audience, 'UNKNOWN'),
      exp_valid: typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() ? 'YES' : 'NO',
      project_ref_matches: payload.iss === expectedIssuer ? 'YES' : 'NO',
    };
  } catch {
    return { sub_matches_user: 'NO', role: 'UNKNOWN', aud: 'UNKNOWN', exp_valid: 'NO', project_ref_matches: 'NO' };
  }
}

async function markerHash(marker: string) {
  const bytes = new TextEncoder().encode(marker);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  if (!stagingRuntime(request)) return new Response(null, { status: 404 });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return new Response(null, { status: 401 });
  let body: { email_marker?: unknown };
  try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }
  const emailMarker = typeof body.email_marker === 'string' && EMAIL_MARKER.test(body.email_marker)
    ? body.email_marker.toLowerCase()
    : null;
  if (!emailMarker) return new Response(null, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) return new Response(null, { status: 404 });
  try {
    if (new URL(url).hostname !== `${STAGING_REF}.supabase.co`) return new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 404 });
  }
  const verifier = createSupabaseClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user) return Response.json({
    layer: 'ROUTE_AUTH',
    provider_error_code: safeClaim(error?.code, 'UNKNOWN'),
  }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const jwt = jwtDiagnostic(token, data.user.id, url);
  const markerMatches = data.user.email?.toLowerCase().includes(`+${emailMarker}@`) === true;
  if (!markerMatches) return Response.json({
    layer: 'ROUTE_MARKER',
    jwt,
    marker_hash: await markerHash(emailMarker),
  }, { status: 403, headers: { 'Cache-Control': 'no-store' } });

  const lookup = await readReleaseQaFixture({ url, anonKey, accessToken: token, userId: data.user.id });
  if (!lookup.fixture) return Response.json({
    layer: lookup.diagnostic.layer,
    code: lookup.code,
    postgrest_response_code: lookup.diagnostic.postgrestStatus,
    postgrest_provider_error_code: lookup.diagnostic.providerErrorCode,
    postgrest_error_class: lookup.diagnostic.providerErrorClass,
    postgrest_object: lookup.diagnostic.providerObject,
    jwt,
    deployed_supabase_ref_matches: 'YES',
    deployed_anon_key_accepted: 'YES',
    marker_hash: await markerHash(emailMarker),
  }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  const fixture = lookup.fixture;
  return Response.json({
    membership_id: fixture.membershipId,
    tenant_id: fixture.tenantId,
    store_id: fixture.storeId,
    tenant_name: fixture.tenantName,
    discovery_path: fixture.discoveryPath,
    account_state: {
      garage_ui_context: fixture.accountState.garageUiContext,
      active_store: fixture.accountState.activeStore,
      onboarding_completed: fixture.accountState.onboardingCompleted,
      membership_role: fixture.accountState.membershipRole,
      membership_status: fixture.accountState.membershipStatus,
      contract_access_state: fixture.accountState.contractAccessState,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
