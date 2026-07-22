import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export async function canStoreUseLLink(storeId: string) {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data: store } = await admin.from('stores').select('tenant_id').eq('id', storeId).single();
  const tenantId = (store as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId) return false;
  const { data: subscription } = await admin
    .from('company_subscriptions')
    .select('l_link_integration_enabled')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  return Boolean((subscription as { l_link_integration_enabled: boolean } | null)?.l_link_integration_enabled);
}
