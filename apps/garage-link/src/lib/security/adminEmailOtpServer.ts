import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasEffectiveAdminRole } from '@/lib/security/adminEmailOtp';

export async function getAuthenticatedAdminContext(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const service = createAdminClient();
  if (!url || !anonKey || !service) return null;
  const supabase = createServerClient(url, anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined } });
  const [{ data: userData }, { data: claimsData }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  const user = userData.user;
  const sessionId = typeof claimsData?.claims?.session_id === 'string' ? claimsData.claims.session_id : '';
  if (!user?.id || !user.email || !sessionId) return null;
  const tenantScope = await supabase.rpc('current_user_tenant_ids', {});
  if (tenantScope.error || !Array.isArray(tenantScope.data) || tenantScope.data.length === 0) return null;
  const membershipRoles = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('tenant_id', tenantScope.data)
    .limit(10);
  if (membershipRoles.error) return null;
  const isAdmin = hasEffectiveAdminRole(membershipRoles.data ?? [], []);
  if (!isAdmin) return null;
  return { userId: user.id, email: user.email, sessionId, service, supabase };
}
