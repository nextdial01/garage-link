import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type GarageTenantRole = 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer';
export type GarageTenantSource = 'api' | 'cron' | 'webhook' | 'worker' | 'llink' | 'system';

export type GarageTenantContext = Readonly<{
  tenantId: string;
  storeId?: string;
  actorUserId?: string;
  actorRole?: GarageTenantRole;
  source: GarageTenantSource;
  correlationId: string;
}>;

type ResolveStoreContextInput = {
  storeId: string;
  expectedTenantId: string;
  actorUserId?: string;
  actorRole?: GarageTenantRole;
  source: GarageTenantSource;
  correlationId: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GarageTenantContextError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT' | 'SCOPE_MISMATCH' | 'STORE_INACTIVE') {
    super(code);
  }
}

export function createSystemTenantContext(input: {
  tenantId: string;
  source: Exclude<GarageTenantSource, 'api'>;
  correlationId: string;
}): GarageTenantContext {
  if (!UUID_RE.test(input.tenantId) || !input.correlationId.trim()) {
    throw new GarageTenantContextError('INVALID_CONTEXT');
  }
  return Object.freeze({ ...input });
}

export async function resolveStoreTenantContext(
  service: SupabaseClient,
  input: ResolveStoreContextInput
): Promise<GarageTenantContext> {
  if (
    !UUID_RE.test(input.storeId)
    || !UUID_RE.test(input.expectedTenantId)
    || !input.correlationId.trim()
    || (input.source === 'api' && (!input.actorUserId || !input.actorRole))
  ) {
    throw new GarageTenantContextError('INVALID_CONTEXT');
  }

  const { data: store, error } = await service
    .from('stores')
    .select('id, tenant_id, status')
    .eq('id', input.storeId)
    .eq('tenant_id', input.expectedTenantId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new GarageTenantContextError('INVALID_CONTEXT');
  if (!store) throw new GarageTenantContextError('SCOPE_MISMATCH');

  return Object.freeze({
    tenantId: input.expectedTenantId,
    storeId: input.storeId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    source: input.source,
    correlationId: input.correlationId,
  });
}

export function assertContextStore(context: GarageTenantContext, storeId: string) {
  if (!context.storeId || context.storeId !== storeId) {
    throw new GarageTenantContextError('SCOPE_MISMATCH');
  }
}

export async function assertServiceTenantStoreContext(
  service: SupabaseClient,
  context: GarageTenantContext
) {
  if (!context.storeId) throw new GarageTenantContextError('INVALID_CONTEXT');
  const { data, error } = await service.rpc('assert_service_tenant_store_context', {
    p_tenant_id: context.tenantId,
    p_store_id: context.storeId,
  });
  if (error || data !== true) throw new GarageTenantContextError('SCOPE_MISMATCH');
}
