export type ReleaseQaFixture = {
  membershipId: string;
  tenantId: string;
  storeId: string;
  tenantName: string;
  accountState: {
    garageUiContext: 'active' | 'selection_required' | 'no_access';
    activeStore: 'YES' | 'NO';
    onboardingCompleted: 'YES' | 'NO';
    membershipRole: string;
    membershipStatus: 'active';
    contractAccessState: string;
  };
};

export type ReleaseQaFixtureLookup =
  | { fixture: ReleaseQaFixture; code: 'OK' }
  | {
    fixture: null;
    code: `MEMBERSHIP_READ_${number}` | 'MEMBERSHIP_CARDINALITY' | 'MEMBERSHIP_SHAPE' | `STORE_READ_${number}` | 'STORE_CARDINALITY' | 'STORE_SHAPE' | `UI_CONTEXT_READ_${number}` | 'UI_CONTEXT_SHAPE' | `CONTRACT_ACCESS_READ_${number}` | 'CONTRACT_ACCESS_SHAPE';
    diagnostic: {
      layer: 'POSTGREST_MEMBERSHIP' | 'POSTGREST_STORE' | 'POSTGREST_UI_CONTEXT' | 'POSTGREST_CONTRACT_ACCESS';
      postgrestStatus: number;
      providerErrorCode: string | null;
    };
  };

async function postgrestErrorCode(response: Response) {
  const body = await response.clone().json().catch(() => null) as { code?: unknown } | null;
  return typeof body?.code === 'string' && /^[A-Z0-9]{4,12}$/i.test(body.code) ? body.code.toUpperCase() : null;
}

function safeAccountState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const garageUiContext = record.state;
  const contractAccessState = record.contract_access_state;
  if (!['active', 'selection_required', 'no_access'].includes(String(garageUiContext))
    || !['YES', 'NO'].includes(String(record.active_store))
    || !['YES', 'NO'].includes(String(record.onboarding_completed))
    || !/^[a-z_]{2,32}$/i.test(String(record.membership_role))
    || !/^[a-z_]{2,48}$/i.test(String(contractAccessState))) return null;
  return {
    garageUiContext: garageUiContext as 'active' | 'selection_required' | 'no_access',
    activeStore: record.active_store as 'YES' | 'NO',
    onboardingCompleted: record.onboarding_completed as 'YES' | 'NO',
    membershipRole: record.membership_role as string,
    membershipStatus: 'active' as const,
    contractAccessState: contractAccessState as string,
  };
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

  const [uiContextResponse,contractResponse] = await Promise.all([
    fetch(new URL('/rest/v1/rpc/get_garage_ui_context_v2', url), { method: 'POST', headers, cache: 'no-store' }),
    fetch(new URL('/rest/v1/rpc/get_member_contract_access', url), { method: 'POST', headers, cache: 'no-store' }),
  ]);
  if (!uiContextResponse.ok) return {
    fixture: null,
    code: `UI_CONTEXT_READ_${uiContextResponse.status}`,
    diagnostic: { layer: 'POSTGREST_UI_CONTEXT', postgrestStatus: uiContextResponse.status, providerErrorCode: await postgrestErrorCode(uiContextResponse) },
  };
  if (!contractResponse.ok) return {
    fixture: null,
    code: `CONTRACT_ACCESS_READ_${contractResponse.status}`,
    diagnostic: { layer: 'POSTGREST_CONTRACT_ACCESS', postgrestStatus: contractResponse.status, providerErrorCode: await postgrestErrorCode(contractResponse) },
  };
  const uiContext = await uiContextResponse.json().catch(() => null) as Record<string, unknown> | null;
  const contractAccess = await contractResponse.json().catch(() => null) as Record<string, unknown> | null;
  const accountState = safeAccountState({
    state: uiContext?.state,
    active_store: uiContext?.store_id ? 'YES' : 'NO',
    onboarding_completed: uiContext?.onboarding_completed === true ? 'YES' : 'NO',
    membership_role: uiContext?.role,
    contract_access_state: contractAccess?.state,
  });
  if (!accountState) return {
    fixture: null,
    code: 'UI_CONTEXT_SHAPE',
    diagnostic: { layer: 'POSTGREST_UI_CONTEXT', postgrestStatus: uiContextResponse.status, providerErrorCode: null },
  };

  return { code: 'OK', fixture: { membershipId: membership.id, tenantId: membership.tenant_id, storeId: membership.store_id, tenantName, accountState } };
}
