import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function getAuthenticatedAdminContext(
  request: NextRequest,
  options: { requireReleaseQa?: boolean } = {},
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const service = createAdminClient();
  if (!url || !anonKey || !service) return null;
  const supabase = createServerClient(url, anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined } });
  const [{ data: userData }, { data: claimsData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  const user = userData.user;
  const sessionId = typeof claimsData?.claims?.session_id === 'string' ? claimsData.claims.session_id : '';
  if (!user?.id || !user.email || !sessionId) return null;
  const rpcName = options.requireReleaseQa
    ? 'release_qa_admin_bootstrap_context'
    : 'admin_email_otp_bootstrap_context';
  const rpcArgs = options.requireReleaseQa
    ? { p_user_id: user.id, p_session_id: sessionId, p_environment: process.env.VERCEL_ENV ?? 'development' }
    : { p_user_id: user.id, p_session_id: sessionId };
  const { data: bootstrap, error: bootstrapError } = await service.rpc(rpcName, rpcArgs);
  if (bootstrapError || !bootstrap || typeof bootstrap !== 'object' || Array.isArray(bootstrap)) return null;
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
