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
  discoveryPath: 'ACTIVE_STORE_VIEW' | 'JWT_MEMBERSHIP_FALLBACK';
};

type PostgrestErrorClass = 'RELATION_PRIVILEGE' | 'SCHEMA_USAGE' | 'ROW_SECURITY' | 'FUNCTION_PRIVILEGE' | 'OTHER';
type PostgrestKnownObject =
  | 'current_user_active_store_membership'
  | 'memberships'
  | 'tenants'
  | 'stores'
  | 'membership_store_assignments'
  | 'user_active_store_preferences'
  | 'current_user_accessible_store_ids'
  | 'current_user_active_store_id'
  | 'current_user_can_access_store'
  | 'store_is_authorization_eligible';

export type ReleaseQaFixtureLookup =
  | { fixture: ReleaseQaFixture; code: 'OK' }
  | {
    fixture: null;
    code: `MEMBERSHIP_READ_${number}` | 'MEMBERSHIP_CARDINALITY' | 'MEMBERSHIP_SHAPE' | `STORE_READ_${number}` | 'STORE_CARDINALITY' | 'STORE_SHAPE' | `UI_CONTEXT_READ_${number}` | 'UI_CONTEXT_SHAPE' | `CONTRACT_ACCESS_READ_${number}` | 'CONTRACT_ACCESS_SHAPE';
    diagnostic: {
      layer: 'POSTGREST_MEMBERSHIP' | 'POSTGREST_STORE' | 'POSTGREST_UI_CONTEXT' | 'POSTGREST_CONTRACT_ACCESS';
      postgrestStatus: number;
      providerErrorCode: string | null;
      providerErrorClass: PostgrestErrorClass | null;
      providerObject: PostgrestKnownObject | null;
    };
  };

async function postgrestErrorDiagnostic(response: Response): Promise<{
  code: string | null;
  providerErrorClass: PostgrestErrorClass | null;
  providerObject: PostgrestKnownObject | null;
}> {
  const body = await response.clone().json().catch(() => null) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const code = typeof body?.code === 'string' && /^[A-Z0-9]{4,12}$/i.test(body.code) ? body.code.toUpperCase() : null;
  const text = [body?.message, body?.details, body?.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const knownObjects = [
    'current_user_active_store_membership',
    'membership_store_assignments',
    'user_active_store_preferences',
    'current_user_accessible_store_ids',
    'current_user_active_store_id',
    'current_user_can_access_store',
    'store_is_authorization_eligible',
    'memberships',
    'tenants',
    'stores',
  ] as const;
  const providerObject = knownObjects.find(value => text.includes(value)) ?? null;
  const providerErrorClass: PostgrestErrorClass | null = /permission denied(?: for)? (?:table|relation|view)|insufficient privilege.*(?:table|relation|view)/.test(text)
    ? 'RELATION_PRIVILEGE'
    : /permission denied(?: for)? schema|insufficient privilege.*schema/.test(text)
      ? 'SCHEMA_USAGE'
      : /row-level security|violates row security/.test(text)
        ? 'ROW_SECURITY'
        : /permission denied(?: for)? (?:function|routine)|insufficient privilege.*(?:function|routine)/.test(text)
          ? 'FUNCTION_PRIVILEGE'
          : /permission denied|insufficient privilege/.test(text)
            ? 'RELATION_PRIVILEGE'
          : text ? 'OTHER' : null;
  return { code, providerErrorClass, providerObject };
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
  allowedRoles = ['owner'],
}: {
  url: string;
  anonKey: string;
  accessToken: string;
  userId: string;
  allowedRoles?: string[];
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
  membershipsUrl.searchParams.set('role', `in.(${allowedRoles.join(',')})`);
  const membershipsResponse = await fetch(membershipsUrl, { headers, cache: 'no-store' });
  let discoveryPath: ReleaseQaFixture['discoveryPath'] = 'ACTIVE_STORE_VIEW';
  let memberships: Array<{ id?: string; tenant_id?: string; store_id?: string; user_id?: string; role?: string }>;
  if (membershipsResponse.ok) {
    memberships = await membershipsResponse.json();
  } else {
    const provider = await postgrestErrorDiagnostic(membershipsResponse);
    // Some deployed PostgREST schemas can reject the security-invoker view
    // even though the same authenticated role can read its own membership.
    // Prove that boundary before using the already-authorized base relation;
    // never broaden a grant or bypass the subject JWT for fixture discovery.
    if (membershipsResponse.status !== 403 || provider.code !== '42501') {
      return {
        fixture: null,
        code: `MEMBERSHIP_READ_${membershipsResponse.status}`,
        diagnostic: { layer: 'POSTGREST_MEMBERSHIP', postgrestStatus: membershipsResponse.status, providerErrorCode: provider.code, providerErrorClass: provider.providerErrorClass, providerObject: provider.providerObject },
      };
    }
    const fallbackUrl = new URL('/rest/v1/memberships', url);
    fallbackUrl.searchParams.set('select', 'id,tenant_id,store_id,user_id,role');
    fallbackUrl.searchParams.set('user_id', `eq.${userId}`);
    fallbackUrl.searchParams.set('role', `in.(${allowedRoles.join(',')})`);
    fallbackUrl.searchParams.set('status', 'eq.active');
    fallbackUrl.searchParams.set('disabled_at', 'is.null');
    fallbackUrl.searchParams.set('deleted_at', 'is.null');
    const fallbackResponse = await fetch(fallbackUrl, { headers, cache: 'no-store' });
    if (!fallbackResponse.ok) {
      const fallbackProvider = await postgrestErrorDiagnostic(fallbackResponse);
      return {
        fixture: null,
        code: `MEMBERSHIP_READ_${fallbackResponse.status}`,
        diagnostic: { layer: 'POSTGREST_MEMBERSHIP', postgrestStatus: fallbackResponse.status, providerErrorCode: fallbackProvider.code, providerErrorClass: fallbackProvider.providerErrorClass, providerObject: fallbackProvider.providerObject },
      };
    }
    memberships = await fallbackResponse.json();
    discoveryPath = 'JWT_MEMBERSHIP_FALLBACK';
  }
  if (!Array.isArray(memberships) || memberships.length !== 1) return {
    fixture: null,
    code: 'MEMBERSHIP_CARDINALITY',
    diagnostic: { layer: 'POSTGREST_MEMBERSHIP', postgrestStatus: membershipsResponse.status, providerErrorCode: null, providerErrorClass: null, providerObject: null },
  };

  const membership = memberships[0];
  if (!membership.id || !membership.tenant_id || !membership.store_id || membership.user_id !== userId || !allowedRoles.includes(String(membership.role))) return {
    fixture: null,
    code: 'MEMBERSHIP_SHAPE',
    diagnostic: { layer: 'POSTGREST_MEMBERSHIP', postgrestStatus: membershipsResponse.status, providerErrorCode: null, providerErrorClass: null, providerObject: null },
  };
  const storesResponse = await fetch(new URL('/rest/v1/rpc/list_accessible_garage_stores', url), {
    method: 'POST', headers, cache: 'no-store',
  });
  if (!storesResponse.ok) {
    const provider = await postgrestErrorDiagnostic(storesResponse);
    return {
      fixture: null,
      code: `STORE_READ_${storesResponse.status}`,
      diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: provider.code, providerErrorClass: provider.providerErrorClass, providerObject: provider.providerObject },
    };
  }
  const stores = await storesResponse.json() as Array<{ id?: string; tenant_id?: string; name?: string }>;
  if (!Array.isArray(stores)) return {
    fixture: null,
    code: 'STORE_SHAPE',
    diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: null, providerErrorClass: null, providerObject: null },
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
    diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: null, providerErrorClass: null, providerObject: null },
  };
  const tenantName = matchingStores[0].name;
  if (typeof tenantName !== 'string') return {
    fixture: null,
    code: 'STORE_SHAPE',
    diagnostic: { layer: 'POSTGREST_STORE', postgrestStatus: storesResponse.status, providerErrorCode: null, providerErrorClass: null, providerObject: null },
  };

  const [uiContextResponse,contractResponse] = await Promise.all([
    fetch(new URL('/rest/v1/rpc/get_garage_ui_context_v2', url), { method: 'POST', headers, cache: 'no-store' }),
    fetch(new URL('/rest/v1/rpc/get_member_contract_access', url), { method: 'POST', headers, cache: 'no-store' }),
  ]);
  if (!uiContextResponse.ok) {
    const provider = await postgrestErrorDiagnostic(uiContextResponse);
    return {
      fixture: null,
      code: `UI_CONTEXT_READ_${uiContextResponse.status}`,
      diagnostic: { layer: 'POSTGREST_UI_CONTEXT', postgrestStatus: uiContextResponse.status, providerErrorCode: provider.code, providerErrorClass: provider.providerErrorClass, providerObject: provider.providerObject },
    };
  }
  if (!contractResponse.ok) {
    const provider = await postgrestErrorDiagnostic(contractResponse);
    return {
      fixture: null,
      code: `CONTRACT_ACCESS_READ_${contractResponse.status}`,
      diagnostic: { layer: 'POSTGREST_CONTRACT_ACCESS', postgrestStatus: contractResponse.status, providerErrorCode: provider.code, providerErrorClass: provider.providerErrorClass, providerObject: provider.providerObject },
    };
  }
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
    diagnostic: { layer: 'POSTGREST_UI_CONTEXT', postgrestStatus: uiContextResponse.status, providerErrorCode: null, providerErrorClass: null, providerObject: null },
  };

  return { code: 'OK', fixture: { membershipId: membership.id, tenantId: membership.tenant_id, storeId: membership.store_id, tenantName, accountState, discoveryPath } };
}
