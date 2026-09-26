import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginIdentityHash } from '@/lib/security/authSecurity';

type Overview = {
  kind: 'ready';
  email: string;
  role: string;
  botProtection: 'enabled' | 'disabled' | 'test' | 'unavailable';
  loginRestriction: 'available' | 'locked' | 'unavailable';
};

/** Self-only, read-only status. No environment values or identity hashes leave this module. */
export async function getAccountSecurityOverview(): Promise<Overview | { kind: 'unauthenticated' | 'forbidden' | 'unavailable' }> {
  try {
    const client = await createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user?.id) return { kind: 'unauthenticated' };

    const { data: member, error: memberError } = await client
      .from<{ role: string | null; store_id: string }>('current_user_active_store_membership')
      .select('role, store_id')
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (memberError) return { kind: 'unavailable' };
    if (!member?.store_id || !['owner', 'admin'].includes(member.role ?? '')) return { kind: 'forbidden' };

    const enabled = process.env.NEXT_PUBLIC_ENABLE_BOT_PROTECTION === 'true';
    // Match GarageLoginForm's effective Web setting, including its public test fallback.
    const testSiteKey = '1x00000000000000000000AA';
    const siteKey = process.env.NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY ?? testSiteKey;
    const validSiteKey = /^[a-zA-Z0-9_-]{3,200}$/.test(siteKey);
    let loginRestriction: Overview['loginRestriction'] = 'unavailable';
    const secret = process.env.GARAGE_LOGIN_SECURITY_SECRET
      ?? process.env.GARAGE_ADMIN_ACCESS_COOKIE_SECRET
      ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    const email = auth.user.email ?? '';
    const service = createAdminClient();
    if (secret && service && email) {
      const identityHash = await loginIdentityHash(secret, email.trim().toLowerCase());
      const { data: lockedUntil, error } = await service.rpc('get_login_lock', { p_identity_hash: identityHash });
      if (!error && (lockedUntil === null || (typeof lockedUntil === 'string' && Number.isFinite(Date.parse(lockedUntil))))) {
        loginRestriction = typeof lockedUntil === 'string' && Date.parse(lockedUntil) > Date.now() ? 'locked' : 'available';
      }
    }
    return {
      kind: 'ready', email, role: member.role!,
      botProtection: !enabled ? 'disabled' : !validSiteKey ? 'unavailable' : siteKey === testSiteKey ? 'test' : 'enabled',
      loginRestriction,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}
