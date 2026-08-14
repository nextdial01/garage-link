import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidStagingReleaseQaRunBinding, isControlledStagingReleaseQaRuntime } from '@/lib/security/stagingReleaseQaHost';

export function isStagingReleaseQaRequest(request: NextRequest) {
  return isControlledStagingReleaseQaRuntime({
    hostname: request.nextUrl.hostname,
    projectId: process.env.VERCEL_PROJECT_ID,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    previewOtpSecret: process.env.GARAGE_PREVIEW_OTP_SINK_SECRET,
  });
}

export async function getAuthenticatedAdminContext(
  request: NextRequest,
  options: { requireReleaseQa?: boolean } = {},
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const service = createAdminClient();
  if (!url || !anonKey || !service) return null;
  const releaseQaRequest = options.requireReleaseQa && isStagingReleaseQaRequest(request);
  const bearer = releaseQaRequest
    ? request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    : undefined;
  const supabase = bearer
    ? createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : createServerClient(url, anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined } });
  const [{ data: userData }, { data: claimsData }] = await Promise.all([
    bearer ? supabase.auth.getUser(bearer) : supabase.auth.getUser(),
    bearer ? supabase.auth.getClaims(bearer) : supabase.auth.getClaims(),
  ]);
  const user = userData.user;
  const sessionId = typeof claimsData?.claims?.session_id === 'string' ? claimsData.claims.session_id : '';
  if (!user?.id || !user.email || !sessionId) return null;
  // The Preview OTP sink is limited to the exact Staging QA run binding.
  // Legacy plus-address fixtures remain cleanup-only and cannot request OTPs.
  if (releaseQaRequest && !hasValidStagingReleaseQaRunBinding(user.app_metadata?.release_qa_run_id)) return null;
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
