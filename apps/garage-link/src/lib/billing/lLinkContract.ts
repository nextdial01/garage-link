import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { GarageTenantContext } from '@/lib/security/garageTenantContext';

export async function canStoreUseLLink(context: Pick<GarageTenantContext, 'tenantId' | 'storeId'>) {
  if (!context.storeId) return false;
  const admin = createAdminClient();
  if (!admin) return false;
  const { data: store } = await admin
    .from('stores')
    .select('tenant_id')
    .eq('id', context.storeId)
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .single();
  const tenantId = (store as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId || tenantId !== context.tenantId) return false;
  const { data: subscription } = await admin
    .from('company_subscriptions')
    .select('l_link_integration_enabled')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  return Boolean((subscription as { l_link_integration_enabled: boolean } | null)?.l_link_integration_enabled);
}
