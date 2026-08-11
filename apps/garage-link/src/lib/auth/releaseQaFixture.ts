export type ReleaseQaFixture = {
  membershipId: string;
  tenantId: string;
  storeId: string;
  tenantName: string;
};

export type ReleaseQaFixtureLookup =
  | { fixture: ReleaseQaFixture; code: 'OK' }
  | {
    fixture: null;
    code: `MEMBERSHIP_READ_${number}` | 'MEMBERSHIP_CARDINALITY' | 'MEMBERSHIP_SHAPE' | `STORE_READ_${number}` | 'STORE_CARDINALITY' | 'STORE_SHAPE';
    diagnostic: {
      layer: 'POSTGREST_MEMBERSHIP' | 'POSTGREST_STORE';
      postgrestStatus: number;
      providerErrorCode: string | null;
    };
  };

async function postgrestErrorCode(response: Response) {
  const body = await response.clone().json().catch(() => null) as { code?: unknown } | null;
  return typeof body?.code === 'string' && /^[A-Z0-9]{4,12}$/i.test(body.code) ? body.code.toUpperCase() : null;
}

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
}): Promise<ReleaseQaFixtureLookup> {
  // Send the owner's JWT directly to PostgREST. A server Supabase client with
  // no persisted session can otherwise fall back to its anon key before the
  // RLS query is sent, which makes the formal fixture lookup indistinguishable
  // from an absent fixture.
  const headers = {
    apikey: anonKey,
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
  };
  // Do not query the base memberships relation here. Its direct Data API
  // contract is intentionally narrow. The application already uses this
  // authenticated, security-invoker view to resolve the caller's active
  // membership without widening grants or bypassing RLS.
  const membershipsUrl = new URL('/rest/v1/current_user_active_store_membership', url);
  membershipsUrl.searchParams.set('select', 'id,tenant_id,store_id,user_id,role');
  membershipsUrl.searchParams.set('user_id', `eq.${userId}`);
  membershipsUrl.searchParams.set('role', 'eq.owner');
  const membershipsResponse = await fetch(membershipsUrl, { headers, cache: 'no-store' });
  if (!membershipsResponse.ok) return {
    fixture: null,
    code: `MEMBERSHIP_READ_${membershipsResponse.status}`,
    diagnostic: { layer: 'POSTGREST_MEMBERSHIP', postgrestStatus: membershipsResponse.status, providerErrorCode: await postgrestErrorCode(membershipsResponse) },
  };
  const memberships = await membershipsResponse.json() as Array<{ id?: string; tenant_id?: string; store_id?: string; user_id?: string; role?: string }>;
  if (!Array.isArray(memberships) || memberships.length !== 1) return {
    fixture: null,
    code: 'MEMBERSHIP_CARDINALITY',
    diagnostic: { layer: 'POSTGREST_MEMBERSHIP', postgrestStatus: membershipsResponse.status, providerErrorCode: null },
  };

  const membership = memberships[0];
  if (!membership.id || !membership.tenant_id || !membership.store_id || membership.user_id !== userId || membership.role !== 'owner') return {
    fixture: null,
    code: 'MEMBERSHIP_SHAPE',
    diagnostic: { layer: 'POSTGREST_MEMBERSHIP', postgrestStatus: membershipsResponse.status, providerErrorCode: null },
  };
  const storesResponse = await fetch(new URL('/rest/v1/rpc/list_accessible_garage_stores', url), {
    method: 'POST', headers, cache: 'no-store',
  });
  if (!storesResponse.ok) return {
    fixture: null,
    code: `STORE_READ_${storesResponse.status}`,
    diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: await postgrestErrorCode(storesResponse) },
  };
  const stores = await storesResponse.json() as Array<{ id?: string; tenant_id?: string; name?: string }>;
  if (!Array.isArray(stores)) return {
    fixture: null,
    code: 'STORE_SHAPE',
    diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: null },
  };
  const matchingStores = (stores ?? []).filter(
    (store: { id?: string; tenant_id?: string; name?: string }) =>
      store?.id === membership.store_id &&
      store?.tenant_id === membership.tenant_id &&
      typeof store?.name === 'string' &&
      /^\[RELEASE QA \d{8}\]/.test(store.name)
  );
  if (matchingStores.length !== 1) return {
    fixture: null,
    code: 'STORE_CARDINALITY',
    diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: null },
  };
  const tenantName = matchingStores[0].name;
  if (typeof tenantName !== 'string') return {
    fixture: null,
    code: 'STORE_SHAPE',
    diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: null },
  };

  return { code: 'OK', fixture: { membershipId: membership.id, tenantId: membership.tenant_id, storeId: membership.store_id, tenantName } };
}
