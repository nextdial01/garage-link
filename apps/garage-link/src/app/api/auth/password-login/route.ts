import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import {
  classifyPasswordLoginFailure,
  type LoginErrorCode,
} from '@/lib/auth/login-error-contract';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginIdentityHash } from '@/lib/security/authSecurity';

type LoginBody = {
  email?: unknown;
  password?: unknown;
  captchaToken?: unknown;
};

function loginError(code: LoginErrorCode, status: number) {
  return NextResponse.json({ code }, { status });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as LoginBody | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : undefined;

  if (!email || !password) {
    return loginError('INVALID_CREDENTIALS', 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.GARAGE_LOGIN_SECURITY_SECRET
    ?? process.env.GARAGE_ADMIN_ACCESS_COOKIE_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const service = createAdminClient();
  if (!url || !anonKey || !secret || !service) {
    return loginError('LOGIN_SECURITY_CHECK_FAILED', 503);
  }

  const identityHash = await loginIdentityHash(secret, email);
  const { data: lockedUntil, error: lockError } = await service.rpc('get_login_lock', {
    p_identity_hash: identityHash,
  });
  if (lockError) {
    return loginError('LOGIN_SECURITY_CHECK_FAILED', 503);
  }
  if (typeof lockedUntil === 'string' && new Date(lockedUntil).getTime() > Date.now()) {
    return loginError('LOGIN_LOCKED', 429);
  }

  const authCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        authCookies.splice(0, authCookies.length, ...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });

  if (error || !data.user?.id || !data.session) {
    const failureCode = classifyPasswordLoginFailure(error, Boolean(captchaToken));
    if (failureCode !== 'INVALID_CREDENTIALS') {
      return loginError(failureCode, failureCode === 'BOT_PROTECTION_FAILED' || failureCode === 'BOT_PROTECTION_REQUIRED' ? 401 : 503);
    }
    const { data: failure, error: failureError } = await service.rpc('record_login_failure', {
      p_identity_hash: identityHash,
    });
    if (failureError) {
      return loginError('LOGIN_SECURITY_CHECK_FAILED', 503);
    }
    const result = Array.isArray(failure) ? failure[0] : failure;
    const isLocked = Boolean(result?.locked_until && new Date(result.locked_until as string).getTime() > Date.now());
    return loginError(isLocked ? 'LOGIN_LOCKED' : 'INVALID_CREDENTIALS', isLocked ? 429 : 401);
  }

  const { error: clearError } = await service.rpc('clear_login_failures', {
    p_identity_hash: identityHash,
  });
  if (clearError) {
    await supabase.auth.signOut();
    return loginError('LOGIN_SECURITY_CHECK_FAILED', 503);
  }

  const response = NextResponse.json({ ok: true });
  authCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}
