import { createClient as createServiceClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !key) {
    return null;
  }

  return createServiceClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Creates a request-scoped client constrained by an already-validated Supabase
 * bearer token. Use this for RLS-protected reads after the mobile route has
 * established the caller's tenant/store context.
 */
export function createBearerClient(token: string, headers: Record<string, string> = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (!url || !anonKey || !token) {
    return null;
  }

  return createServiceClient(url, anonKey, {
    // A server client has no persisted browser session. Supplying the access
    // token explicitly prevents PostgREST/RPC calls from falling back to the
    // anon role after the route has already verified this bearer.
    accessToken: async () => token,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        ...headers,
      },
    },
  });
}

/** Validates a supplied bearer with Supabase Auth before it is bound to PostgREST. */
export function createBearerAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  if (!url || !anonKey) {
    return null;
  }

  return createServiceClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
