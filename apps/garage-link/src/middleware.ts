import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { resolvePostAuthPath } from '@/lib/auth/post-auth-redirect';
import { ADMIN_EMAIL_OTP_COOKIE, deviceTokenHash, getAdminEmailOtpSecret, hasEffectiveAdminRole, readTrustedDeviceCookieValue } from '@/lib/security/adminEmailOtp';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/auth/callback',
  '/auth/reset-password',
  '/api/auth/password-login',
  '/help',
  '/logout',
  '/legal/terms',
  '/legal/privacy',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/features',
  '/pricing',
  '/faq',
];

const CANCELLED_RETENTION_ALLOWED = [
  '/settings/billing',
  '/logout',
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/legal/')) return true;
  if (pathname.startsWith('/industries/')) return true;
  // L-LINK からのサーバー間通信は各ルートで HMAC 署名・timestamp・nonce を検証する。
  // Supabase セッションを持たないため、ログイン画面へ転送せずルート自身の認証へ渡す。
  if (pathname.startsWith('/api/s2s/line-link/')) return true;
  // Google向け在庫フィードはBearerトークン/クエリトークンで自前認証するため、
  // セッションCookieを持たないクローラーからのアクセスをここで弾かない。
  if (pathname === '/api/vehicles/google-feed') return true;
  return false;
}

function isCancelledRetentionAllowedPath(pathname: string) {
  if (CANCELLED_RETENTION_ALLOWED.includes(pathname)) return true;
  if (pathname.startsWith('/legal/')) return true;
  return false;
}

function isSecurityGate(pathname: string) {
  return pathname === '/security/mfa'
    || pathname === '/security/email-otp'
    || pathname.startsWith('/api/auth/admin-email-otp/')
    || pathname === '/api/auth/logout';
}

function redirectWithSessionCookies(url: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

async function requiresAdminSecurity(
  userId: string
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return true;
  const supabase = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const storeRole = await supabase
    .from('store_members')
    .select('role')
    .eq('user_id', userId)
    .in('status', ['active', 'member'])
    .limit(10);
  if (storeRole.error) return true;
  if ((storeRole.data ?? []).length > 0) return hasEffectiveAdminRole([], storeRole.data ?? []);

  const membershipRole = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(10);
  if (membershipRole.error) return true;
  return hasEffectiveAdminRole(membershipRole.data ?? [], []);
}

async function hasTrustedAdminDevice(request: NextRequest, userId: string, sessionId: string) {
  const secret = getAdminEmailOtpSecret();
  const cookie = await readTrustedDeviceCookieValue(secret, request.cookies.get(ADMIN_EMAIL_OTP_COOKIE)?.value, userId, sessionId);
  if (!cookie) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return false;
  const service = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = await deviceTokenHash(secret, cookie.token);
  const { data, error } = await service
    .from('admin_trusted_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .eq('device_token_hash', hash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return !error && Boolean(data);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: claimData } = user ? await supabase.auth.getClaims() : { data: null };

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    const isAuthEntry = pathname === '/login' || pathname === '/signup';
    const shouldCheckAdminSecurity = isAuthEntry || (!isPublicPath(pathname) && !isSecurityGate(pathname));

    if (shouldCheckAdminSecurity) {
      const adminSecurityRequired = await requiresAdminSecurity(user.id);
      if (adminSecurityRequired) {
        const returnPath = isAuthEntry ? '/dashboard' : `${pathname}${request.nextUrl.search}`;
        const sessionId = typeof claimData?.claims?.session_id === 'string' ? claimData.claims.session_id : '';
        if (!sessionId || !await hasTrustedAdminDevice(request, user.id, sessionId)) {
          const verificationUrl = new URL('/security/email-otp', request.url);
          verificationUrl.searchParams.set('from', returnPath);
          return redirectWithSessionCookies(verificationUrl, response);
        }
      }
    }

    const postAuthPath = isSecurityGate(pathname)
      ? '/dashboard'
      : await resolvePostAuthPath(supabase, user.id, {
          nextPath: request.nextUrl.searchParams.get('next'),
        });

    if (pathname === '/login' || pathname === '/signup') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = postAuthPath.split('?')[0] ?? postAuthPath;
      redirectUrl.search = postAuthPath.includes('?')
        ? postAuthPath.slice(postAuthPath.indexOf('?'))
        : '';
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname === '/onboarding' && postAuthPath.startsWith('/dashboard')) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/dashboard';
      dashboardUrl.search = '';
      return NextResponse.redirect(dashboardUrl);
    }

    if (
      !isPublicPath(pathname) &&
      pathname !== '/onboarding' &&
      (postAuthPath.startsWith('/onboarding') || postAuthPath.startsWith('/signup'))
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = postAuthPath.split('?')[0] ?? postAuthPath;
      redirectUrl.search = postAuthPath.includes('?')
        ? postAuthPath.slice(postAuthPath.indexOf('?'))
        : '';
      return NextResponse.redirect(redirectUrl);
    }

    if (!isPublicPath(pathname)) {
      const { data: contractAccess } = await supabase.rpc('get_member_contract_access', {});
      const accessState =
        contractAccess &&
        typeof contractAccess === 'object' &&
        'state' in contractAccess &&
        typeof (contractAccess as { state?: string }).state === 'string'
          ? (contractAccess as { state: string }).state
          : 'active';

      if (accessState === 'cancelled_retention' && !isCancelledRetentionAllowedPath(pathname)) {
        const billingUrl = request.nextUrl.clone();
        billingUrl.pathname = '/settings/billing';
        billingUrl.searchParams.set('contract', 'cancelled');
        return NextResponse.redirect(billingUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
