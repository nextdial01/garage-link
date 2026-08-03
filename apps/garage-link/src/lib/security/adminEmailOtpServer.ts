import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const UX_ACCEPTANCE_FIXTURE_PREFIX = '[UX QA 20260803]';

export async function getPreviewUxAcceptanceAdminContext(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const service = createAdminClient();
  if (!url || !anonKey || !service) return null;
  const supabase = createServerClient(url, anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined } });
  const [{ data: userData }, { data: claimsData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  const user = userData.user;
  const sessionId = typeof claimsData?.claims?.session_id === 'string' ? claimsData.claims.session_id : '';
  if (!user?.id || !user.email?.toLowerCase().endsWith('.invalid') || !sessionId) return null;

  const { data: memberships, error: membershipError } = await service
    .from('memberships')
    .select('tenant_id, store_id, role, joined_at, invite_accepted_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .is('disabled_at', null)
    .is('deleted_at', null);
  if (membershipError || !memberships || memberships.length !== 1) return null;
  const membership = memberships[0];
  if (!membership.joined_at && !membership.invite_accepted_at) return null;

  const [{ data: tenant }, { data: store }] = await Promise.all([
    service.from('tenants').select('status').eq('id', membership.tenant_id).maybeSingle(),
    service.from('stores').select('name, status, tenant_id').eq('id', membership.store_id).maybeSingle(),
  ]);
  if (
    tenant?.status !== 'active' ||
    !store ||
    store?.tenant_id !== membership.tenant_id ||
    typeof store.name !== 'string' ||
    !store.name.startsWith(UX_ACCEPTANCE_FIXTURE_PREFIX) ||
    !['active', 'trialing'].includes(String(store.status))
  ) return null;

  return {
    userId: user.id,
    email: user.email,
    sessionId,
    tenantId: membership.tenant_id,
    storeId: membership.store_id,
    role: membership.role,
    service,
  };
}

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
