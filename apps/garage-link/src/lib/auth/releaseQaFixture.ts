import { createClient } from '@supabase/supabase-js';

export type ReleaseQaFixture = {
  membershipId: string;
  tenantId: string;
  storeId: string;
  tenantName: string;
};

export async function readReleaseQaFixture({
  url,
  anonKey,
  accessToken,
  userId,
}: {
  url: string;
  anonKey: string;
  accessToken: string;
  userId: string;
}): Promise<ReleaseQaFixture | null> {
  const subject = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: memberships, error: membershipError } = await subject
    .from('memberships')
    .select('id,tenant_id,store_id')
    .eq('user_id', userId)
    .eq('role', 'owner');
  if (membershipError || memberships?.length !== 1) return null;

  const membership = memberships[0];
  if (!membership.id || !membership.tenant_id || !membership.store_id) return null;
  const { data: stores, error: storesError } = await subject.rpc('list_accessible_garage_stores');
  if (storesError) return null;
  const matchingStores = (stores ?? []).filter(
    (store: { id?: string; tenant_id?: string; name?: string }) =>
      store?.id === membership.store_id &&
      store?.tenant_id === membership.tenant_id &&
      typeof store?.name === 'string' &&
      /^\[RELEASE QA \d{8}\]/.test(store.name)
  );
  if (matchingStores.length !== 1) return null;

  return {
    membershipId: membership.id,
    tenantId: membership.tenant_id,
    storeId: membership.store_id,
    tenantName: matchingStores[0].name,
  };
}
