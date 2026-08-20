type AuthFailure = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

const SUPABASE_AUTH_COOKIE = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i;

export function isSupabaseAuthCookieName(name: string): boolean {
  return SUPABASE_AUTH_COOKIE.test(name);
}

export function getSupabaseAuthCookieNames(cookies: Iterable<{ name: string }>): string[] {
  return Array.from(cookies, ({ name }) => name).filter(isSupabaseAuthCookieName);
}

export function isRecoverableStaleSessionError(error: AuthFailure | null | undefined): boolean {
  const status = error?.status ?? 0;
  if (status >= 500) return false;

  const code = error?.code?.toLowerCase() ?? '';
  const message = error?.message?.toLowerCase() ?? '';
  return code === 'refresh_token_not_found'
    || message.includes('refresh token not found')
    || message.includes('invalid refresh token');
}
