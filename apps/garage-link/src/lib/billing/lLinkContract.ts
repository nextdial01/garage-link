import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { GarageTenantContext } from '@/lib/security/garageTenantContext';

export async function canStoreUseLLink(context: Pick<GarageTenantContext, 'tenantId' | 'storeId'>) {
  if (!context.storeId) return false;
  const admin = createAdminClient();
  if (!admin) return false;
  const { data: scopes, error } = await admin.rpc('service_resolve_garage_store_scope', {
    p_store_id: context.storeId,
  });
  if (error || !Array.isArray(scopes) || scopes.length !== 1) return false;
  const scope = scopes[0];
  if (
    scope.store_id !== context.storeId ||
    scope.tenant_id !== context.tenantId ||
    scope.store_status !== 'active'
  ) return false;
  const { data: subscription } = await admin
    .from('company_subscriptions')
    .select('l_link_integration_enabled')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .maybeSingle();
  return Boolean((subscription as { l_link_integration_enabled: boolean } | null)?.l_link_integration_enabled);
}
