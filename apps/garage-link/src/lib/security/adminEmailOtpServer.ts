import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const RELEASE_QA_EMAIL = /\+garage-link-[0-9a-f]{8}-[0-9a-f-]{27}@/i;
const RELEASE_QA_RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isStagingReleaseQaRequest(request: NextRequest) {
  const host = request.nextUrl.hostname;
  return process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID
    && process.env.VERCEL_ENV === 'preview'
    && /^garage-link-staging-[a-z0-9-]+\.vercel\.app$/i.test(host);
}

export async function getAuthenticatedAdminContext(
  request: NextRequest,
  options: { requireReleaseQa?: boolean } = {},
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const service = createAdminClient();
  if (!url || !anonKey || !service) return null;
  const bearer = options.requireReleaseQa && isStagingReleaseQaRequest(request)
    ? request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    : undefined;
  const supabase = bearer
    ? createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : createServerClient(url, anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined } });
  const [{ data: userData }, { data: claimsData }] = await Promise.all([
    supabase.auth.getUser(bearer),
    supabase.auth.getClaims(bearer),
  ]);
  const user = userData.user;
  const sessionId = typeof claimsData?.claims?.session_id === 'string' ? claimsData.claims.session_id : '';
  if (!user?.id || !user.email || !sessionId) return null;
  // Current Release Critical runs bind the exact authorized Gmail recipient
  // to a service-owned app_metadata run id. Keep the legacy plus-address
  // contract only for cleanup of older synthetic fixtures.
  if (
    bearer
    && !RELEASE_QA_EMAIL.test(user.email)
    && !RELEASE_QA_RUN_ID.test(String(user.app_metadata?.release_qa_run_id ?? ''))
  ) return null;
  const rpcCalls = options.requireReleaseQa
    ? [
        service.rpc('release_qa_admin_bootstrap_context', {
          p_user_id: user.id,
          p_session_id: sessionId,
          p_environment: process.env.VERCEL_ENV ?? 'development',
        }),
        service.rpc('ux_acceptance_admin_bootstrap_context', {
          p_user_id: user.id,
          p_session_id: sessionId,
          p_environment: process.env.VERCEL_ENV ?? 'development',
        }),
        // Public signup creates the synthetic owner through the real Auth
        // flow, so it has no fixture-only app metadata. The authorized
        // Preview OTP sink must still let this Staging owner finish MFA.
        service.rpc('admin_email_otp_bootstrap_context', { p_user_id: user.id, p_session_id: sessionId }),
      ]
    : [service.rpc('admin_email_otp_bootstrap_context', { p_user_id: user.id, p_session_id: sessionId })];
  let bootstrap: unknown = null;
  for (const rpcCall of rpcCalls) {
    const result = await rpcCall;
    if (result.error) return null;
    if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
      bootstrap = result.data;
      break;
    }
  }
  if (!bootstrap || typeof bootstrap !== 'object' || Array.isArray(bootstrap)) return null;
  const context = bootstrap as {
    user_id?: unknown;
    email?: unknown;
    tenant_id?: unknown;
    store_id?: unknown;
    role?: unknown;
  };
  if (
    context.user_id !== user.id ||
    context.email !== user.email.toLowerCase() ||
    typeof context.tenant_id !== 'string' ||
    typeof context.store_id !== 'string' ||
    !['owner', 'admin', 'implementer'].includes(String(context.role))
  ) return null;
  return {
    userId: user.id,
    email: user.email,
    sessionId,
    tenantId: context.tenant_id,
    storeId: context.store_id,
    role: String(context.role),
    service,
  };
}
